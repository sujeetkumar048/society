/**
 * firebase-config.js
 * SR Gold Society — Shared Firebase Initialisation & Helper Layer
 *
 * Include this file AFTER the Firebase compat CDN scripts in every page:
 *   <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
 *   <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>
 *   <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
 *   <script src="firebase-config.js"></script>
 */

// ─── Firebase Project Config ────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBlhrZiQGjGi5rVVfgBEq5UsRjdjW69fKQ",
  authDomain: "society048.firebaseapp.com",
  databaseURL: "https://society048-default-rtdb.firebaseio.com",
  projectId: "society048",
  storageBucket: "society048.firebasestorage.app",
  messagingSenderId: "734910791240",
  appId: "1:734910791240:web:e82333a05266367d40627d"
};

// Guard against double-init on pages that include this file twice
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db   = firebase.database();
const auth = firebase.auth();

// ─── Database Path Map ───────────────────────────────────────────────────────
// Maps every localStorage key used in the app to a Firebase RTDB path.
const DB_PATHS = {
  'society_users'                      : '/users',
  'society_complaints'                 : '/complaints',
  'society_visitors'                   : '/visitors',
  'society_pending_visitor_approvals'  : '/pending_visitor_approvals',
  'society_notices'                    : '/notices',
  'society_pending_invoices'           : '/maintenance/invoices',
  'society_employees'                  : '/employees',
  'society_punches'                    : '/attendance',
  'society_daily_tasks'                : '/daily_tasks',
  'society_daily_task_submissions'     : '/daily_task_submissions',
  'society_parking_residents'          : '/parking/residents',
  'society_parking_visitors'           : '/parking/visitors',
  'society_expenses'                   : '/accounting/expenses',
  'society_income'                     : '/accounting/income',
  'society_incomes'                    : '/accounting/income',
  'society_directory_workers'          : '/directory/workers',
  'society_worker_bookings'            : '/worker_bookings',
  'chat_messages'                      : '/chat',
  'society_chat_threads'               : '/chat_threads',
  'society_documents'                  : '/documents',
  'society_gate_log'                   : '/gate_log',
  'society_notifications'              : '/notifications',
  'society_services'                   : '/local_services',
  'society_meter_readings'             : '/meter_readings',
  'society_gate_requests'              : '/gate_requests',
  'society_activity_logs'              : '/activity_logs',
  'society_vehicles'                   : '/vehicles',
  'society_guard_requests'             : '/guard_requests',
  'society_salary_payments'            : '/salary_payments',
  'society_salary_employees'           : '/salary_employees',
  'society_accounting_entries'         : '/accounting/entries',
  'society_admin_permissions'          : '/admin_permissions_config',
  'society_feed_posts'                 : '/feed_posts',
};

// ─── Core Helper: fbDB ──────────────────────────────────────────────────────
/**
 * fbDB — Thin async wrapper around the Firebase Realtime Database compat SDK.
 * All methods return Promises. Pages continue to use localStorage as an
 * offline cache; fbDB reads/writes are layered on top.
 */
window.fbDB = {

  /** Read data once (returns null if nothing at path) */
  get(path) {
    return db.ref(path).once('value').then(snap => snap.val());
  },

  /** Overwrite entire node */
  set(path, data) {
    return db.ref(path).set(data);
  },

  /** Merge/update fields without overwriting siblings */
  update(path, data) {
    return db.ref(path).update(data);
  },

  /** Append a new child with auto-generated key; resolves with the new key */
  push(path, data) {
    const ref = db.ref(path).push();
    return ref.set(data).then(() => ref.key);
  },

  /** Delete a node */
  remove(path) {
    return db.ref(path).remove();
  },

  /**
   * Subscribe to real-time value changes.
   * @returns {Function} call the returned function to unsubscribe.
   */
  listen(path, callback) {
    const ref = db.ref(path);
    ref.on('value', snap => callback(snap.val()));
    return () => ref.off('value');
  },
};

// ─── High-Level Sync Helpers ────────────────────────────────────────────────
/**
 * Read a key — tries Firebase first, falls back to localStorage on error.
 * Also seeds localStorage cache so pages work offline.
 */
window.fbGet = async function(localKey) {
  const path = DB_PATHS[localKey];
  if (!path) return JSON.parse(localStorage.getItem(localKey));

  try {
    const val = await fbDB.get(path);
    if (val !== null) {
      // Cache locally
      localStorage.setItem(localKey, JSON.stringify(Array.isArray(val) ? val : Object.values(val)));
      return Array.isArray(val) ? val : Object.values(val);
    }
  } catch (e) {
    console.warn('[fbGet] Firebase unavailable, using localStorage:', e.message);
  }
  return JSON.parse(localStorage.getItem(localKey));
};

/**
 * Write an array to Firebase AND localStorage (dual-write for offline resilience).
 */
window.fbSet = async function(localKey, dataArray) {
  localStorage.setItem(localKey, JSON.stringify(dataArray));

  const path = DB_PATHS[localKey];
  if (!path) return;

  try {
    // Store arrays as indexed objects in RTDB (Firebase doesn't support raw arrays)
    const obj = {};
    if (Array.isArray(dataArray)) {
      dataArray.forEach((item, i) => { obj[i] = item; });
    } else {
      Object.assign(obj, dataArray);
    }
    await fbDB.set(path, obj);
  } catch (e) {
    console.warn('[fbSet] Firebase write failed (cached locally):', e.message);
  }
};

/**
 * Push a single new item to a Firebase list AND prepend to the localStorage array.
 */
window.fbPush = async function(localKey, item) {
  const current = JSON.parse(localStorage.getItem(localKey)) || [];
  current.unshift(item);
  localStorage.setItem(localKey, JSON.stringify(current));

  const path = DB_PATHS[localKey];
  if (!path) return;

  try {
    await fbDB.push(path, item);
  } catch (e) {
    console.warn('[fbPush] Firebase push failed (cached locally):', e.message);
  }
};

/**
 * Subscribe to real-time changes for a given key. Calls `callback(array)` on
 * every update. Returns an unsubscribe function.
 */
window.fbListen = function(localKey, callback) {
  const path = DB_PATHS[localKey];
  if (!path) {
    callback(JSON.parse(localStorage.getItem(localKey)));
    return () => {};
  }

  return fbDB.listen(path, val => {
    const arr = val
      ? (Array.isArray(val) ? val : Object.values(val)).filter(Boolean)
      : [];
    localStorage.setItem(localKey, JSON.stringify(arr));
    callback(arr);
  });
};

// ─── One-time Migration: push localStorage → Firebase on first load ──────────
window.migrateLocalStorageToFirebase = async function() {
  const migrated = localStorage.getItem('_fb_migrated_v1');
  if (migrated) return;

  console.log('[Firebase] Running one-time localStorage → Firebase migration…');

  for (const [localKey, fbPath] of Object.entries(DB_PATHS)) {
    const raw = localStorage.getItem(localKey);
    if (!raw) continue;

    try {
      const data = JSON.parse(raw);
      const obj  = {};
      if (Array.isArray(data)) {
        data.forEach((item, i) => { obj[i] = item; });
      } else {
        Object.assign(obj, data);
      }
      await db.ref(fbPath).set(obj);
      console.log(`  ✔ Migrated ${localKey} → ${fbPath}`);
    } catch (e) {
      console.warn(`  ✗ Failed ${localKey}:`, e.message);
    }
  }

  localStorage.setItem('_fb_migrated_v1', '1');
  console.log('[Firebase] Migration complete.');
};

// ─── Online / Offline indicator ──────────────────────────────────────────────
db.ref('.info/connected').on('value', snap => {
  window._fbOnline = snap.val() === true;
  const badge = document.getElementById('fbStatusBadge');
  if (badge) {
    badge.textContent = window._fbOnline ? '🟢 Live' : '🔴 Offline';
    badge.style.background = window._fbOnline ? '#00E676' : '#FF5252';
    badge.style.color      = window._fbOnline ? '#033621' : '#FFFFFF';
    badge.style.fontWeight = '700';
    badge.style.border     = window._fbOnline ? '1px solid #B9F6CA' : '1px solid #FF8A80';
    badge.style.boxShadow  = window._fbOnline ? '0 2px 8px rgba(0, 230, 118, 0.4)' : '0 2px 8px rgba(255, 82, 82, 0.4)';
  }
});
window.playBeepSound = function(type = 'default') {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (!audioCtx) return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'success') {
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
      oscillator.start();
      oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime + 0.1);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      oscillator.stop(audioCtx.currentTime + 0.25);
    } else if (type === 'error') {
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(450, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.7, audioCtx.currentTime); // high volume
      oscillator.start();
      oscillator.frequency.linearRampToValueAtTime(900, audioCtx.currentTime + 1.5);
      oscillator.frequency.linearRampToValueAtTime(450, audioCtx.currentTime + 3.0);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 3.0);
      oscillator.stop(audioCtx.currentTime + 3.0);
    } else {
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      oscillator.stop(audioCtx.currentTime + 0.15);
    }
  } catch(e) {
    console.error('Audio beep failed:', e);
  }
};

window.pushNotification = function(title, type) {
  // Play beep sound on new notification
  if (typeof window.playBeepSound === 'function') {
    window.playBeepSound('notification');
  }

  // Do NOT store chat logs in notifications
  if (type === 'chat' || (title && title.toLowerCase().includes('chat'))) {
    return;
  }
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

  if (typeof fbGet === 'function') {
    fbGet('society_notifications').then(list => {
      const arr = (list || []).filter(n => {
        if (n.type === 'chat' || (n.title && n.title.toLowerCase().includes('chat'))) return false;
        const t = n.time || n.timestamp || 0;
        return !t || t >= sevenDaysAgo;
      });
      const newNotif = {
        id: 'NOTIF-' + Date.now() + '-' + Math.floor(Math.random() * 100),
        title: title,
        time: Date.now(),
        type: type
      };
      arr.unshift(newNotif);
      if (arr.length > 50) {
        arr.length = 50;
      }
      fbSet('society_notifications', arr);
    });
  } else {
    const raw = JSON.parse(localStorage.getItem('society_notifications')) || [];
    const arr = raw.filter(n => {
      if (n.type === 'chat' || (n.title && n.title.toLowerCase().includes('chat'))) return false;
      const t = n.time || n.timestamp || 0;
      return !t || t >= sevenDaysAgo;
    });
    const newNotif = {
      id: 'NOTIF-' + Date.now(),
      title: title,
      time: Date.now(),
      type: type
    };
    arr.unshift(newNotif);
    if (arr.length > 50) arr.length = 50;
    localStorage.setItem('society_notifications', JSON.stringify(arr));
  }
};

window.logActivity = function(toolAction, status, name) {
  if (!toolAction) return;
  let userName = name;
  if (!userName) {
    try {
      const cu = JSON.parse(localStorage.getItem('currentUser'));
      userName = cu ? (cu.name || cu.role || 'User') : 'Admin';
    } catch(e) {
      userName = 'Admin';
    }
  }
  const now = new Date();
  const dateTimeStr = now.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) + ' ' + now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true });
  
  const logEntry = {
    id: 'LOG-' + Date.now() + '-' + Math.floor(Math.random()*1000),
    name: userName,
    dateTime: dateTimeStr,
    status: status || 'Completed',
    toolAction: toolAction || 'Action',
    timestamp: Date.now()
  };

  const fourDaysAgo = Date.now() - (4 * 24 * 60 * 60 * 1000);

  if (typeof fbGet === 'function') {
    fbGet('society_activity_logs').then(list => {
      const arr = (list || []).filter(l => {
        const t = l.timestamp || (l.dateTime ? new Date(l.dateTime).getTime() : 0);
        return !t || isNaN(t) || t >= fourDaysAgo;
      });
      arr.unshift(logEntry);
      if (arr.length > 200) arr.length = 200;
      fbSet('society_activity_logs', arr);
    });
  } else {
    const arr = JSON.parse(localStorage.getItem('society_activity_logs')) || [];
    arr.unshift(logEntry);
    if (arr.length > 200) arr.length = 200;
    localStorage.setItem('society_activity_logs', JSON.stringify(arr));
  }
};

// ─── Auto Cleanup for Logs (4 Days) & Notifications (7 Days) ────────────────────────
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000;

window.autoCleanOldLogsAndNotifications = function() {
  const now = Date.now();

  // 1. Clean Notifications older than 7 days
  const cleanNotifs = (list) => {
    if (!Array.isArray(list)) return list;
    return list.filter(n => {
      if (n.type === 'chat' || (n.title && n.title.toLowerCase().includes('chat'))) return false;
      const itemTime = n.time || (n.timestamp ? Number(n.timestamp) : 0);
      if (!itemTime) return true;
      return (now - itemTime) <= SEVEN_DAYS_MS;
    });
  };

  // 2. Clean Activity Logs older than 4 days
  const cleanLogs = (list) => {
    if (!Array.isArray(list)) return list;
    return list.filter(l => {
      const itemTime = l.timestamp || (l.dateTime ? new Date(l.dateTime).getTime() : 0);
      if (!itemTime || isNaN(itemTime)) return true;
      return (now - itemTime) <= FOUR_DAYS_MS;
    });
  };

  if (typeof fbGet === 'function') {
    fbGet('society_notifications').then(list => {
      if (list && list.length > 0) {
        const cleaned = cleanNotifs(list);
        if (cleaned.length !== list.length) {
          fbSet('society_notifications', cleaned);
        }
      }
    }).catch(e => console.warn(e));

    fbGet('society_activity_logs').then(list => {
      if (list && list.length > 0) {
        const cleaned = cleanLogs(list);
        if (cleaned.length !== list.length) {
          fbSet('society_activity_logs', cleaned);
        }
      }
    }).catch(e => console.warn(e));
  }

  try {
    const localNotifs = JSON.parse(localStorage.getItem('society_notifications'));
    if (localNotifs) {
      const cleanedN = cleanNotifs(localNotifs);
      localStorage.setItem('society_notifications', JSON.stringify(cleanedN));
    }

    const localLogs = JSON.parse(localStorage.getItem('society_activity_logs'));
    if (localLogs) {
      const cleanedL = cleanLogs(localLogs);
      localStorage.setItem('society_activity_logs', JSON.stringify(cleanedL));
    }
  } catch(e) {
    console.warn(e);
  }
};

try {
  autoCleanOldLogsAndNotifications();
  setInterval(autoCleanOldLogsAndNotifications, 60 * 60 * 1000);
} catch(e) {
  console.warn(e);
}

console.log('[SR Gold Society] Firebase initialised → project: society048');

// ─── Real-Time Emergency SOS System ──────────────────────────────────────────
let activeSirenContext = null;
let activeSirenOscillator = null;
let activeSirenGain = null;
let sirenTimeout = null;
let isSirenMuted = false;
let sosAlarmInterval = null;

window.playSiren = function() {
  if (isSirenMuted) return;
  try {
    window.stopSiren();

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (!audioCtx) return;
    
    // Resume context if suspended (browser security)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.type = 'sawtooth';
    const duration = 3.0;
    const interval = 0.35;
    oscillator.frequency.setValueAtTime(950, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.8, audioCtx.currentTime);
    
    for (let time = 0; time < duration; time += interval) {
      const pitch = (Math.round(time / interval) % 2 === 0) ? 1200 : 750;
      oscillator.frequency.setValueAtTime(pitch, audioCtx.currentTime + time);
    }
    
    oscillator.start();
    
    gainNode.gain.setValueAtTime(0.8, audioCtx.currentTime + duration - 0.2);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    
    oscillator.stop(audioCtx.currentTime + duration);
    
    activeSirenContext = audioCtx;
    activeSirenOscillator = oscillator;
    activeSirenGain = gainNode;

    sirenTimeout = setTimeout(() => {
      window.stopSiren();
    }, 3000);
  } catch(e) {
    console.error('Siren play failed:', e);
  }
};

window.stopSiren = function() {
  if (sirenTimeout) {
    clearTimeout(sirenTimeout);
    sirenTimeout = null;
  }
  try {
    if (activeSirenOscillator) {
      activeSirenOscillator.stop();
      activeSirenOscillator.disconnect();
    }
  } catch(e) {}
  try {
    if (activeSirenContext) {
      activeSirenContext.close();
    }
  } catch(e) {}
  activeSirenContext = null;
  activeSirenOscillator = null;
  activeSirenGain = null;
};

window.sendGlobalSOSAlert = function() {
  const user = JSON.parse(localStorage.getItem('currentUser'));
  if (!user) return;
  
  const sosData = {
    id: Date.now().toString(),
    active: true,
    sender: user.name || 'Anonymous Resident',
    flat: user.flat || 'N/A',
    tower: user.tower || 'N/A',
    timestamp: Date.now(),
    desc: `EMERGENCY ALERT: SOS triggered from Flat ${user.flat || 'N/A'}, Tower ${user.tower || 'N/A'}`
  };
  
  localStorage.setItem('society_sos_active', JSON.stringify(sosData));
  
  if (typeof fbSet === 'function') {
    fbSet('society_sos_active', sosData).catch(e => console.warn(e));
  }

  // Broadcast Notification to notifications panel
  const notifMsg = `🚨 EMERGENCY SOS! Triggered by ${user.name} (Flat ${user.flat || 'N/A'}, Tower ${user.tower || 'N/A'})`;
  if (typeof window.pushNotification === 'function') {
    window.pushNotification(notifMsg, "sos");
  }
};

window.triggerSosClick = function() {
  if (document.getElementById('sosConfirmModal')) return;
  
  const confirmModal = document.createElement('div');
  confirmModal.id = 'sosConfirmModal';
  confirmModal.style = `
    position: fixed;
    top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(8px);
    z-index: 9999999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
    font-family: 'Space Grotesk', sans-serif;
  `;
  confirmModal.innerHTML = `
    <div style="background: white; width: 100%; max-width: 400px; border-radius: 20px; padding: 24px; text-align: center; box-shadow: 0 15px 35px rgba(0,0,0,0.3); animation: scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);">
      <div style="width: 64px; height: 64px; background: #FFEBEB; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; border: 2px solid #FF3B30;">
        <svg style="width:32px; height:32px; stroke:#FF3B30; fill:none;" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
      <h3 style="margin: 0 0 8px; color: #1a1a1a; font-size: 18px; font-weight: 800;">Emergency SOS Trigger</h3>
      <p style="margin: 0 0 24px; color: #666; font-size: 13.5px; line-height: 1.5;">Are you sure you want to send an Emergency SOS Alert to all society members?</p>
      <div style="display: flex; gap: 10px;">
        <button id="btnSosConfirmCancel" style="flex: 1; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: #f5f5f5; color: #333; font-weight: 700; font-size: 13px; cursor: pointer;">Cancel</button>
        <button id="btnSosConfirmSend" style="flex: 1; padding: 12px; border: none; border-radius: 12px; background: #FF3B30; color: white; font-weight: 700; font-size: 13px; cursor: pointer;">Send SOS</button>
      </div>
    </div>
  `;
  document.body.appendChild(confirmModal);
  
  document.getElementById('btnSosConfirmCancel').addEventListener('click', () => {
    confirmModal.remove();
  });
  document.getElementById('btnSosConfirmSend').addEventListener('click', () => {
    confirmModal.remove();
    window.sendGlobalSOSAlert();
  });
};

function checkAndShowSOS(sos) {
  if (!sos || !sos.active) {
    removeSOSOverlay();
    return;
  }

  // Prevent showing if dismissed in this browser session
  if (sessionStorage.getItem('dismissed_sos_' + sos.id)) {
    removeSOSOverlay();
    return;
  }

  // Prevent showing if alert is older than 30 minutes
  if (Date.now() - sos.timestamp > 30 * 60 * 1000) {
    removeSOSOverlay();
    return;
  }

  // Render full screen red warning overlay
  let overlay = document.getElementById('globalSosOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'globalSosOverlay';
    overlay.style = `
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(139, 0, 0, 0.95);
      z-index: 999999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: white;
      font-family: 'Space Grotesk', sans-serif;
      padding: 20px;
      box-sizing: border-box;
      animation: sosFlash 1s infinite alternate;
    `;

    // Add keyframes styles
    if (!document.getElementById('sosOverlayStyles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'sosOverlayStyles';
      styleEl.innerHTML = `
        @keyframes sosFlash {
          0% { background: rgba(139, 0, 0, 0.95); }
          100% { background: rgba(220, 20, 60, 0.98); }
        }
      `;
      document.head.appendChild(styleEl);
    }

    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const isUserAdmin = currentUser && currentUser.role && (
      currentUser.role.includes('Super Admin') || 
      currentUser.role.includes('Committee Member')
    );

    overlay.innerHTML = `
      <div style="max-width: 450px; width: 100%; background: #ffffff; color: #1a1a1a; border-radius: 24px; padding: 28px; box-shadow: 0 25px 60px rgba(0,0,0,0.6); text-align: center; font-family:'Space Grotesk',sans-serif; border: 3px solid #FF3B30;">
        <div style="font-size: 54px; margin-bottom: 8px; animation: scaleUp 0.5s infinite alternate;">🚨</div>
        <h2 style="margin: 0 0 16px; color: #FF3B30; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">🚨 EMERGENCY ALERT 🚨</h2>
        
        <div style="display:flex; flex-direction:column; gap:12px; text-align:left; margin-bottom:24px; background:#FDF2F2; padding:18px; border-radius:16px; border:1px solid #FBD5D5;">
          <div><span style="font-size:10px; color:#9B1C1C; font-weight:700; text-transform:uppercase;">Resident Name</span><div style="font-size:14px; font-weight:700; color:#1a1a1a; margin-top:2px;">${sos.sender}</div></div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div><span style="font-size:10px; color:#9B1C1C; font-weight:700; text-transform:uppercase;">Flat Number</span><div style="font-size:14px; font-weight:700; color:#1a1a1a; margin-top:2px;">${sos.flat}</div></div>
            <div><span style="font-size:10px; color:#9B1C1C; font-weight:700; text-transform:uppercase;">Tower</span><div style="font-size:14px; font-weight:700; color:#1a1a1a; margin-top:2px;">${sos.tower || 'A'}</div></div>
          </div>
          <div><span style="font-size:10px; color:#9B1C1C; font-weight:700; text-transform:uppercase;">Trigger Time</span><div style="font-size:13px; font-weight:700; color:#1a1a1a; margin-top:2px;">${new Date(sos.timestamp).toLocaleTimeString('en-IN', {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</div></div>
          <div><span style="font-size:10px; color:#9B1C1C; font-weight:700; text-transform:uppercase;">Emergency Message</span><div style="font-size:13px; font-weight:700; color:#DC143C; margin-top:2px; line-height:1.4;">${sos.desc}</div></div>
        </div>

        <div style="display:flex; gap:10px;">
          <button id="btnMuteSosGlobal" style="flex:1; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: #f5f5f5; color: #333; font-weight: 700; font-size: 13px; cursor: pointer;">
            🔊 Mute Siren
          </button>
          <button id="btnDismissSosGlobal" style="flex:1; padding: 14px; border: none; border-radius: 12px; background: #FF3B30; color: white; font-weight: 700; font-size: 13px; cursor: pointer;">
            Dismiss Alert
          </button>
        </div>
        ${isUserAdmin ? `
          <button id="btnResetSosGlobal" style="width:100%; padding: 14px; border: none; border-radius: 12px; background: #22c55e; color: white; font-weight: 700; font-size: 13px; cursor: pointer; margin-top:10px;">
            🟢 Clear SOS Globally
          </button>
        ` : ''}
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('btnDismissSosGlobal').addEventListener('click', () => {
      sessionStorage.setItem('dismissed_sos_' + sos.id, 'true');
      removeSOSOverlay();
    });

    const muteBtn = document.getElementById('btnMuteSosGlobal');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        if (isSirenMuted) {
          isSirenMuted = false;
          muteBtn.innerHTML = '🔊 Mute Siren';
          window.playSiren();
        } else {
          isSirenMuted = true;
          muteBtn.innerHTML = '🔈 Unmute';
          window.stopSiren();
        }
      });
    }

    if (isUserAdmin) {
      const resetBtn = document.getElementById('btnResetSosGlobal');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          if (confirm('Clear this Emergency SOS globally for all users?')) {
            const clearData = { active: false, timestamp: Date.now() };
            localStorage.setItem('society_sos_active', JSON.stringify(clearData));
            if (typeof fbSet === 'function') {
              fbSet('society_sos_active', clearData).catch(e => console.warn(e));
            }
          }
        });
      }
    }
  }

  // Play periodic siren sound (3 seconds duration, repeating every 7 seconds)
  if (!sosAlarmInterval && !isSirenMuted) {
    window.playSiren();
    sosAlarmInterval = setInterval(() => {
      if (isSirenMuted) {
        clearInterval(sosAlarmInterval);
        sosAlarmInterval = null;
        return;
      }
      window.playSiren();
    }, 7000);
  }
}

function removeSOSOverlay() {
  const overlay = document.getElementById('globalSosOverlay');
  if (overlay) overlay.remove();
  window.stopSiren();
  if (sosAlarmInterval) {
    clearInterval(sosAlarmInterval);
    sosAlarmInterval = null;
  }
}

// Hook up SOS listener
if (typeof db !== 'undefined' && typeof db.ref === 'function') {
  db.ref('society_sos_active').on('value', snap => {
    checkAndShowSOS(snap.val());
  });
} else {
  setInterval(() => {
    try {
      const sos = JSON.parse(localStorage.getItem('society_sos_active'));
      checkAndShowSOS(sos);
    } catch(e) {}
  }, 2000);
}

// ─── Floating SOS button Injection ───────────────────────────────────────────
window.initializeFloatingSosButton = function() {
  if (document.getElementById('floatingSosBtn')) return;

  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!currentUser) return;

  const btn = document.createElement('div');
  btn.id = 'floatingSosBtn';
  btn.title = 'EMERGENCY SOS';
  btn.style = `
    position: fixed;
    bottom: 90px;
    right: 20px;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: linear-gradient(135deg, #FF3B30, #FF2D55);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 24px rgba(255, 45, 85, 0.4), 0 0 0 0px rgba(255, 45, 85, 0.3);
    z-index: 99999;
    cursor: pointer;
    border: 2px solid white;
    user-select: none;
    transition: all 0.2s ease;
    animation: sosPulse 2s infinite;
  `;

  if (!document.getElementById('sosPulseStyle')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'sosPulseStyle';
    styleEl.innerHTML = `
      @keyframes sosPulse {
        0% { box-shadow: 0 8px 24px rgba(255, 45, 85, 0.4), 0 0 0 0px rgba(255, 45, 85, 0.4); }
        70% { box-shadow: 0 8px 24px rgba(255, 45, 85, 0.4), 0 0 0 15px rgba(255, 45, 85, 0); }
        100% { box-shadow: 0 8px 24px rgba(255, 45, 85, 0.4), 0 0 0 0px rgba(255, 45, 85, 0); }
      }
      @keyframes scaleUp {
        0% { transform: scale(0.9); }
        100% { transform: scale(1.1); }
      }
    `;
    document.head.appendChild(styleEl);
  }

  btn.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center;">
      <svg style="width:24px; height:24px; stroke:white; fill:none;" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span style="font-size:8px; font-weight:900; margin-top:2px; font-family:'Space Grotesk',sans-serif; letter-spacing:0.5px;">SOS</span>
    </div>
  `;

  btn.onclick = function() {
    window.triggerSosClick();
  };

  document.body.appendChild(btn);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.initializeFloatingSosButton);
} else {
  window.initializeFloatingSosButton();
}
setInterval(window.initializeFloatingSosButton, 2000);

// ─── Shared Admin Permissions Getter ─────────────────────────────────────────
window.getAdminPermission = function(permKey) {
  try {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (currentUser && currentUser.email) {
      const cleanEmailKey = currentUser.email.replace(/\./g, '_');
      const stored = localStorage.getItem('society_admin_permissions_' + cleanEmailKey);
      if (stored) {
        const config = JSON.parse(stored);
        return config[permKey] !== false;
      }
    }
    const config = JSON.parse(localStorage.getItem('society_admin_permissions')) || {
      chat_admin: true,
      vehicle_delete: true,
      maint_rate_edit: true,
      invoice_delete: true,
      payment_history_clear: true,
      meter_readings_edit_delete: true,
      attendance_logs_delete_clear: true,
      complaints_edit_delete: true,
      notices_edit_delete: true,
      accounting_delete: true,
      documents_edit_delete: true
    };
    return config[permKey] !== false;
  } catch(e) {
    return true;
  }
};

// ─── Auto Image Compression Helper (Target 5KB) ──────────────────────────────
window.compressImageToBase64 = function(fileOrBase64, targetSizeKb, callback) {
  const processImage = (imgSrc) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      
      let maxDim = 250;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      let canvas = document.createElement('canvas');
      let ctx = canvas.getContext('2d');
      let quality = 0.6;
      let resultBase64 = "";
      let attempts = 0;

      const attemptCompression = () => {
        canvas.width = width;
        canvas.height = height;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        
        resultBase64 = canvas.toDataURL('image/jpeg', quality);
        const sizeInKb = (resultBase64.length * 0.75) / 1024;

        if (sizeInKb <= targetSizeKb || attempts >= 5 || width < 50 || height < 50) {
          callback(resultBase64);
        } else {
          attempts++;
          width = Math.round(width * 0.85);
          height = Math.round(height * 0.85);
          quality = Math.max(0.1, quality - 0.1);
          attemptCompression();
        }
      };

      attemptCompression();
    };
    img.onerror = () => {
      callback(imgSrc);
    };
    img.src = imgSrc;
  };

  if (fileOrBase64 instanceof File) {
    const reader = new FileReader();
    reader.onload = (e) => processImage(e.target.result);
    reader.onerror = () => callback("");
    reader.readAsDataURL(fileOrBase64);
  } else if (typeof fileOrBase64 === 'string') {
    processImage(fileOrBase64);
  } else {
    callback("");
  }
};

// ─── Auto Document Validator / Compresser (Target 10KB) ──────────────────────
window.validateAndProcessDocument = function(file, targetSizeKb, callback) {
  if (!file) {
    callback(null, 'No file selected');
    return;
  }

  const isImage = file.type.startsWith('image/');
  const sizeInKb = file.size / 1024;

  if (isImage) {
    // Compress the image document to target size (10KB)
    window.compressImageToBase64(file, targetSizeKb, (compressedBase64) => {
      callback({
        name: file.name,
        type: file.type,
        sizeStr: ((compressedBase64.length * 0.75) / 1024).toFixed(1) + ' KB',
        data: compressedBase64
      }, null);
    });
  } else {
    // Check if non-image document size is within limit
    if (sizeInKb <= targetSizeKb) {
      const reader = new FileReader();
      reader.onload = (e) => {
        callback({
          name: file.name,
          type: file.type,
          sizeStr: sizeInKb.toFixed(1) + ' KB',
          data: e.target.result
        }, null);
      };
      reader.onerror = () => callback(null, 'Failed to read file');
      reader.readAsDataURL(file);
    } else {
      callback(null, `Document size (${sizeInKb.toFixed(1)} KB) exceeds the ${targetSizeKb} KB limit. Please upload a smaller file.`);
    }
  }
};

// ─── Automatic Page View Tracker ───
document.addEventListener('DOMContentLoaded', () => {
  try {
    const pageName = window.location.pathname.split('/').pop() || 'index.html';
    if (pageName && pageName !== 'welcome.html') {
      const pageTitles = {
        'index.html': 'Dashboard Home',
        'profile.html': 'Profile & Settings',
        'complaints.html': 'Complaints Desk',
        'notices.html': 'Notice Board',
        'pay-maintenance.html': 'Maintenance & Payments',
        'accounting.html': 'Accounting Desk',
        'visitor-entry.html': 'Visitor Guard Panel',
        'documents.html': 'Documents Center',
        'gate-requests.html': 'Gate Requests Board',
        'staff-attendance.html': 'Staff Attendance',
        'parking.html': 'Parking Management',
        'local-services.html': 'Local Services Directory'
      };
      const title = pageTitles[pageName] || pageName;
      
      // Delay slightly to ensure user auth is parsed and loaded
      setTimeout(() => {
        if (typeof window.logActivity === 'function') {
          window.logActivity('Page View: ' + title, 'Opened');
        }
      }, 800);
    }
  } catch (e) {
    console.error('Error logging page view:', e);
  }
});
