// ============================================================================
// LOCAL storage adapter — used ONLY by the standalone offline build.
// Everything lives in this browser's IndexedDB: no account, no server, no limit
// beyond your disk. Images are kept inline as data URLs inside the journal blob.
// The online app never imports this file (it uses dataStore.js → Supabase).
// ============================================================================

const DB_NAME = 'rtm_local';
const STORE = 'kv';
const IMG_STORE = 'imgs';   // chart screenshots live here, one record per slot
const KEY = 'journal';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(IMG_STORE)) db.createObjectStore(IMG_STORE);
    };
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
// ---- image records, kept out of the journal blob -------------------------
// A chart screenshot is ~200 KB. Holding them inside the journal meant every
// autosave — every keystroke in a notes field — rewrote every image ever taken:
// at 400 charts that is a 94 MB write, and it grows forever. Each image now has
// its own record, so saving a trade writes only the text (a few hundred KB) and
// only images that actually changed are touched.
async function imgReadAll() {
  const db = await openDB();
  return new Promise((resolve) => {
    const out = {};
    try {
      const tx = db.transaction(IMG_STORE, 'readonly');
      const st = tx.objectStore(IMG_STORE);
      const rq = st.openCursor();
      rq.onsuccess = () => {
        const c = rq.result;
        if (!c) { resolve(out); return; }
        if (typeof c.value === 'string' && c.value) out[c.key] = c.value;
        c.continue();
      };
      rq.onerror = () => resolve(out);
    } catch (e) { resolve(out); }
  });
}
// write only what changed; drop what the journal no longer references
async function imgSync(images) {
  const db = await openDB();
  const want = images || {};
  // Deleting is the only irreversible thing this file does, so refuse the one case that is
  // almost never a real instruction: "keep nothing". An empty map next to a populated store
  // means the journal failed to load (or has not loaded yet) — writing that through would
  // erase every screenshot the user has. A genuine wipe still happens trade-by-trade.
  const wantEmpty = Object.keys(want).length === 0;
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(IMG_STORE, 'readwrite');
      const st = tx.objectStore(IMG_STORE);
      const keysRq = st.getAllKeys();
      keysRq.onsuccess = () => {
        const have = new Set(keysRq.result || []);
        Object.keys(want).forEach(k => {
          const v = want[k];
          if (typeof v !== 'string' || !v) return;
          // fingerprint avoids re-writing an unchanged 200 KB string
          if (!have.has(k) || imgFp.get(k) !== fp(v)) { st.put(v, k); imgFp.set(k, fp(v)); }
          have.delete(k);
        });
        if (wantEmpty && have.size) {
          console.warn('[local imgSync] refusing to delete ' + have.size + ' stored images for an empty set');
          return;
        }
        have.forEach(k => { st.delete(k); imgFp.delete(k); });   // slot cleared / trade deleted
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    } catch (e) { reject(e); }
  });
}
const imgFp = new Map();
const fp = (v) => v.length + ':' + v.slice(0, 24) + v.slice(-16);

const idbOK = (typeof indexedDB !== 'undefined');
const LS_KEY = 'rtm_local_journal';

// Load / save the whole journal as one JSON blob.
// Primary: IndexedDB (no practical size limit). Fallback: localStorage (small,
// but keeps a browser that blocks IDB on file:// usable). Either way the app's
// own Backup / Restore-from-file gives a bulletproof, portable copy.
export async function loadJournal() {
  if (idbOK) {
    try {
      const v = await idbGet(KEY);
      if (v) {
        const imgs = await imgReadAll();
        // Journals written before images were split still carry them inline. Adopt those on
        // first load and let the next save move them across, so nobody loses a screenshot.
        const inline = v.images && typeof v.images === 'object' ? v.images : {};
        const images = Object.keys(imgs).length ? { ...inline, ...imgs } : inline;
        Object.keys(images).forEach(k => { const x = images[k]; if (typeof x === 'string' && x) imgFp.set(k, fp(x)); });
        if (Object.keys(inline).length) {
          // Move them across now rather than waiting for the user's next edit — otherwise a
          // journal that is only ever read keeps carrying its images in the blob.
          try { const { images: _drop, ...rest } = v; await imgSync(images); await idbPut(KEY, rest); }
          catch (e) { console.error('[local image migration]', e); }
        }
        return { ...v, images };
      }
    } catch (e) { console.error('[local loadJournal idb]', e); }
  }
  try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; }
  catch (e) { return null; }
}
export async function saveJournal(blob) {
  if (idbOK) {
    try {
      // images go to their own records; the journal keeps everything else and stays small
      const { images, ...rest } = blob || {};
      await imgSync(images);
      await idbPut(KEY, rest);
      return;
    } catch (e) { console.error('[local saveJournal idb]', e); }
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
    const imgs = idbOK ? await imgReadAll() : (((await loadJournal()) || {}).images || {});
    let bytes = 0, count = 0;
    for (const k in imgs) {
      const v = imgs[k];
      if (typeof v === 'string' && v) { count++; bytes += Math.round(v.length * 0.75); }
    }
    return { bytes, count };
  } catch (e) { return { bytes: 0, count: 0 }; }
}
