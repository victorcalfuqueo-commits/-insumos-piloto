/* Almacenamiento local: IndexedDB (con respaldo en localStorage). Solo se agregan eventos; no hay borrado individual. */
(function (root) {
  const DB = 'inv_piloto', LS = 'inv_piloto_ls';
  let db = null, modo = 'idb';
  const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS)) || { eventos: [], meta: {} }; } catch (e) { return { eventos: [], meta: {} }; } };
  const lsSet = (d) => { try { localStorage.setItem(LS, JSON.stringify(d)); } catch (e) { /* sin espacio o bloqueado */ } };
  const req = (r) => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  async function abrir() {
    if (db || modo === 'ls') return;
    if (!root.indexedDB) { modo = 'ls'; return; }
    try {
      db = await new Promise((ok, no) => { const o = indexedDB.open(DB, 1); o.onupgradeneeded = () => { const d = o.result; d.createObjectStore('eventos', { keyPath: 'id' }); d.createObjectStore('meta'); }; o.onsuccess = () => ok(o.result); o.onerror = () => no(o.error); o.onblocked = () => no(new Error('bloqueado')); });
    } catch (e) { modo = 'ls'; }
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
  }
  const tx = (store, m = 'readonly') => db.transaction(store, m).objectStore(store);
  const api = {
    modo: () => modo,
    async todos() { await abrir(); if (modo === 'ls') return lsGet().eventos; return req(tx('eventos').getAll()); },
    async agregar(lista) {
      await abrir(); if (!lista.length) return;
      if (modo === 'ls') { const d = lsGet(); const ids = new Set(d.eventos.map(e => e.id)); for (const e of lista) if (!ids.has(e.id)) d.eventos.push(e); lsSet(d); return; }
      await new Promise((ok, no) => { const t = db.transaction('eventos', 'readwrite'); const s = t.objectStore('eventos'); for (const e of lista) s.add(e).onerror = (ev) => ev.preventDefault(); t.oncomplete = ok; t.onerror = () => no(t.error); t.onabort = () => no(t.error); });
    },
    async meta(k) { await abrir(); if (modo === 'ls') return lsGet().meta[k]; return req(tx('meta').get(k)); },
    async fijarMeta(k, v) { await abrir(); if (modo === 'ls') { const d = lsGet(); d.meta[k] = v; lsSet(d); return; } await req(tx('meta', 'readwrite').put(v, k)); },
    async borrarTodo() { await abrir(); if (modo === 'ls') { lsSet({ eventos: [], meta: lsGet().meta }); return; } await req(tx('eventos', 'readwrite').clear()); }
  };
  root.Store = api;
})(self);
