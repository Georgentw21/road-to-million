// ============================================================================
// LOCAL storage adapter — used ONLY by the standalone offline build.
// Everything lives in this browser's IndexedDB: no account, no server, no limit
// beyond your disk. Images are kept inline as data URLs inside the journal blob.
// The online app never imports this file (it uses dataStore.js → Supabase).
// ============================================================================

const DB_NAME = 'rtm_local';
const STORE = 'kv';
const KEY = 'journal';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const rq = tx.objectStore(STORE).get(key);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}
async function idbPut(key, val) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const idbOK = (typeof indexedDB !== 'undefined');
const LS_KEY = 'rtm_local_journal';

// Load / save the whole journal as one JSON blob.
// Primary: IndexedDB (no practical size limit). Fallback: localStorage (small,
// but keeps a browser that blocks IDB on file:// usable). Either way the app's
// own Backup / Restore-from-file gives a bulletproof, portable copy.
export async function loadJournal() {
  if (idbOK) {
    try { const v = await idbGet(KEY); if (v) return v; } catch (e) { console.error('[local loadJournal idb]', e); }
  }
  try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; }
  catch (e) { return null; }
}
export async function saveJournal(blob) {
  if (idbOK) {
    try { await idbPut(KEY, blob); return; } catch (e) { console.error('[local saveJournal idb]', e); }
  }
  try { localStorage.setItem(LS_KEY, JSON.stringify(blob)); }
  catch (e) { console.error('[local saveJournal ls]', e); }
}

// Images: store the compressed file as a data URL and hand that back as the
// "path". getImageUrl just returns it unchanged (it already renders in <img>).
function fileToDataURL(file) {
  return new Promise((resolve) => {
    try {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(file);
    } catch (e) { resolve(null); }
  });
}
export async function uploadImage(slotId, file) { return await fileToDataURL(file); }
export function getImageUrl(path) { return path || null; }
// Inline images vanish with their trade (App drops them from state.images), so
// there is nothing extra to delete.
export async function deleteImages(_paths) { /* no-op in local mode */ }

// Rough storage meter for the account panel — sum of inlined image data.
export async function imageUsage() {
  try {
    const blob = await loadJournal();
    const imgs = (blob && blob.images) || {};
    let bytes = 0, count = 0;
    for (const k in imgs) {
      const v = imgs[k];
      if (typeof v === 'string' && v) { count++; bytes += Math.round(v.length * 0.75); }
    }
    return { bytes, count };
  } catch (e) { return { bytes: 0, count: 0 }; }
}
