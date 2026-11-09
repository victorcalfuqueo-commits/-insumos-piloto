/* Sincronización con la planilla compartida (Google Apps Script). Un solo intercambio por vez: envía lo pendiente y recibe lo que falta. */
(function (root) {
  const TOPE = 150;
  /* red(url, cuerpo) -> Promise<objeto JSON>. Se inyecta para poder probar sin internet. */
  async function ronda(o) {
    const pend = o.eventos.filter(e => !o.enviados.has(e.id));
    const lote = pend.slice(0, TOPE);
    let r;
    try { r = await o.red(o.cfg.url, JSON.stringify({ clave: o.cfg.clave, desde: o.desde, eventos: lote })); }
    catch (e) { return { ok: false, tipo: 'red', error: 'Sin conexión', pendientes: pend.length }; }
    if (!r || r.ok !== true) return { ok: false, tipo: r && r.error === 'clave' ? 'clave' : 'servidor', error: r && r.error === 'clave' ? 'La clave no coincide con la de la planilla.' : 'La planilla respondió con un error.', pendientes: pend.length };
    const idsEnviados = lote.map(e => e.id);
    const conocidos = new Set(o.eventos.map(e => e.id));
    const f = o.fusionar(o.eventos, r.nuevos || [], o.cods);
    const recibidosIds = (r.nuevos || []).map(e => e && e.id).filter(Boolean);
    return { ok: true, nuevos: f.nuevos, seq: Math.max(Number(r.seq) || 0, o.desde), enviadosIds: idsEnviados.concat(recibidosIds), pendientes: pend.length - lote.length, masPorEnviar: pend.length > lote.length, invalidos: f.invalidos, yaTenia: recibidosIds.filter(i => conocidos.has(i)).length };
  }
  /* fetch real: text/plain evita la consulta previa (preflight) que Apps Script no responde. */
  async function redReal(url, cuerpo) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null; const t = ctl ? setTimeout(() => ctl.abort(), 20000) : null;
    try { const r = await fetch(url, { method: 'POST', body: cuerpo, redirect: 'follow', signal: ctl ? ctl.signal : undefined }); return await r.json(); }
    finally { if (t) clearTimeout(t); }
  }
  async function probar(cfg, fetchFn) {
    try { const r = await (fetchFn || fetch)(cfg.url + (cfg.url.includes('?') ? '&' : '?') + 'clave=' + encodeURIComponent(cfg.clave), { redirect: 'follow' }); const j = await r.json(); return j.ok ? { ok: true, filas: j.filas } : { ok: false, error: j.error === 'clave' ? 'La clave no coincide con la de la planilla.' : 'Respuesta inesperada.' }; }
    catch (e) { return { ok: false, error: 'No se pudo conectar. Revise la dirección y la conexión a internet.' }; }
  }
  const api = { ronda, redReal, probar, TOPE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Sync = api;
})(typeof self !== 'undefined' ? self : this);
