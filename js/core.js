/* Núcleo del inventario: lógica pura, sin DOM. Se prueba con node (tests/core.test.js).
   Modelo: registro de eventos que solo se agrega. Nada se borra; un error se corrige con "Anulación".
   El estado (saldos, KPI, alertas) se calcula siempre a partir de los eventos. */
(function (root) {
  const TIPOS_STOCK = { Ingreso: 1, 'Devolución': 1, Salida: -1, Ajuste: 1 };
  const TOL = 0.02;            // tolerancia del conteo (±2 %), según el informe
  const META = { kpi1: 0.95, kpi3: 2.0 };
  const DIAS_VENC = 60;

  const num = (v) => { if (v === null || v === undefined || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const hoyISO = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const diasEntre = (aISO, bISO) => Math.round((Date.UTC(...bISO.split('-').map((x, i) => i === 1 ? +x - 1 : +x)) - Date.UTC(...aISO.split('-').map((x, i) => i === 1 ? +x - 1 : +x))) / 864e5);

  /* ---- Estado a partir de eventos ---- */
  function build(catalogo, eventos) {
    const evs = eventos.slice().sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
    const anuladas = new Set(evs.filter(e => e.tipo === 'Anulación').map(e => e.ref));
    const cfg = {}; for (const c of catalogo) cfg[c.cod] = { ubic: '', uni: 'UN', ini: 0, min: null, max: null, cons: null, plazo: 5 };
    for (const e of evs) if (e.tipo === 'Config' && cfg[e.cod] && !anuladas.has(e.id)) Object.assign(cfg[e.cod], e.campos);
    const vivos = evs.filter(e => !anuladas.has(e.id) && e.tipo !== 'Anulación' && e.tipo !== 'Config');
    return { catalogo, cfg, evs, vivos, anuladas };
  }
  const info = (st, cod) => st.catalogo.find(c => c.cod === cod);
  const existe = (st, cod) => !!st.cfg[cod];

  /* Saldo por lote. El saldo inicial no tiene lote ("" = sin lote). */
  function lotes(st, cod, hastaTs) {
    const m = new Map(); const add = (lote, venc, q) => { const k = lote || ''; const o = m.get(k) || { lote: k, venc: '', cant: 0 }; o.cant += q; if (venc && !o.venc) o.venc = venc; m.set(k, o); };
    if (!st.cfg[cod]) return [];
    if (st.cfg[cod].ini) add('', '', st.cfg[cod].ini);
    for (const e of st.vivos) {
      if (e.cod !== cod || !(e.tipo in TIPOS_STOCK)) continue; if (hastaTs != null && e.ts > hastaTs) continue;
      add(e.lote, e.venc, TIPOS_STOCK[e.tipo] * e.cant);
    }
    return [...m.values()];
  }
  const saldo = (st, cod, hastaTs) => lotes(st, cod, hastaTs).reduce((a, l) => a + l.cant, 0);
  /* FEFO: lotes con stock ordenados por vencimiento más próximo; sin vencimiento al final. */
  const fefo = (st, cod) => lotes(st, cod).filter(l => l.cant > 0).sort((a, b) => (a.venc || '9999') < (b.venc || '9999') ? -1 : (a.venc || '9999') > (b.venc || '9999') ? 1 : 0);

  function ultimoConteo(st, cod) { let b = null; for (const e of st.vivos) if (e.cod === cod && e.tipo === 'Conteo' && (!b || e.ts >= b.ts)) b = e; return b; }
  function resultadoConteo(st, e) { const sp = saldo(st, e.cod, e.ts - 1); const dif = e.cant - sp; const ok = sp === 0 ? e.cant === 0 : Math.abs(dif) / Math.abs(sp) <= TOL; return { sp, dif, ok }; }
  const puntoReorden = (c) => (c.min != null && c.cons != null) ? c.min + c.cons * (c.plazo || 0) : (c.min != null ? c.min : null);
  function estado(sal, c) { const ro = puntoReorden(c); if (ro != null && sal <= ro) return 'rep'; if (c.max != null && sal > c.max) return 'max'; return (ro != null || c.max != null) ? 'ok' : 'na'; }

  function resumen(st, hoy = hoyISO()) {
    const filas = st.catalogo.map(ci => {
      const c = st.cfg[ci.cod], sal = saldo(st, ci.cod), lc = ultimoConteo(st, ci.cod);
      const rc = lc ? resultadoConteo(st, lc) : null;
      return { cod: ci.cod, desc: ci.desc, antes: ci.antes, c, sal, ro: puntoReorden(c), est: estado(sal, c), conteo: lc, rc };
    });
    const contados = filas.filter(f => f.rc), coin = contados.filter(f => f.rc.ok);
    const bus = st.vivos.filter(e => e.tipo === 'Búsqueda');
    const prom = bus.length ? bus.reduce((a, e) => a + e.cant, 0) / bus.length : null;
    const conAntes = st.catalogo.filter(c => c.antes != null);
    const antes = conAntes.length ? conAntes.reduce((a, c) => a + c.antes, 0) / conAntes.length : null;
    const venc = [];
    for (const f of filas) for (const l of lotes(st, f.cod)) if (l.venc && l.cant > 0) { const d = diasEntre(hoy, l.venc); if (d <= DIAS_VENC) venc.push({ cod: f.cod, desc: f.desc, lote: l.lote, venc: l.venc, cant: l.cant, dias: d }); }
    venc.sort((a, b) => a.dias - b.dias);
    return { filas, contados: contados.length, coinciden: coin.length, kpi1: contados.length ? coin.length / contados.length : null, kpi3: prom, kpi3Antes: antes, nBusquedas: bus.length,
      alertas: filas.filter(f => f.est === 'rep' || f.est === 'max').length, venc };
  }

  /* ---- Validación (devuelve lista de errores; vacía = válido) ---- */
  function validar(st, m) {
    const err = [];
    if (!existe(st, m.cod)) err.push('El código no está en el catálogo del piloto.');
    if (!m.resp || !String(m.resp).trim()) err.push('Falta el responsable.');
    if (m.tipo in TIPOS_STOCK || m.tipo === 'Conteo' || m.tipo === 'Búsqueda') {
      if (m.cant == null || !Number.isFinite(m.cant)) err.push('Falta la cantidad.');
      else if (m.tipo === 'Ajuste') { if (m.cant === 0) err.push('El ajuste no puede ser 0.'); if (!m.obs) err.push('Un ajuste necesita una observación que explique el motivo.'); }
      else if (m.cant < 0 || (m.cant === 0 && m.tipo !== 'Conteo')) err.push(m.tipo === 'Conteo' ? 'El conteo no puede ser negativo.' : 'La cantidad debe ser mayor que 0.');
    }
    if (m.tipo === 'Devolución') {
      if (m.verificada !== true) err.push('No se recibe: la cantidad, el lote o el vencimiento no coinciden con lo informado por el servicio. Se aclara con el servicio antes de registrar.');
      if (!m.aut || !String(m.aut).trim()) err.push('Falta quién autoriza (jefe de bodega).');
      if (!m.lote) err.push('Una devolución debe indicar el lote.');
      if (!m.venc) err.push('Una devolución debe indicar el vencimiento.');
    }
    if (m.tipo === 'Ingreso' && !!m.lote !== !!m.venc) err.push('Si indica lote debe indicar también el vencimiento (y al revés).');
    if (m.tipo === 'Salida' && existe(st, m.cod)) {
      const disp = lotes(st, m.cod).find(l => l.lote === (m.lote || ''));
      const dispQ = disp ? disp.cant : 0;
      if (m.cant > dispQ) err.push(`No hay stock suficiente${m.lote ? ' en el lote ' + m.lote : ''}: disponible ${dispQ}.`);
    }
    return err;
  }

  /* ---- Fusión de registros (importar archivos de otros usuarios) ---- */
  function fusionar(locales, entrantes, catalogoCods) {
    const ids = new Set(locales.map(e => e.id)); const nuevos = []; let repetidos = 0, invalidos = 0;
    for (const e of entrantes) {
      if (!e || typeof e !== 'object' || !e.id || !e.tipo || !Number.isFinite(e.ts) || (e.tipo !== 'Anulación' && !catalogoCods.includes(e.cod))) { invalidos++; continue; }
      if (ids.has(e.id)) { repetidos++; continue; }
      ids.add(e.id); nuevos.push(e);
    }
    return { nuevos, repetidos, invalidos };
  }

  /* ---- Lectura de códigos de etiqueta ("222-3924" o "222-3924|M1-S222-E01-N2-P03") ---- */
  function leerCodigo(texto, catalogo) {
    const t = String(texto || '').trim(); if (!t) return null;
    const [cod, ubic] = t.split('|').map(x => x.trim());
    const c = catalogo.find(x => x.cod.toLowerCase() === cod.toLowerCase());
    return c ? { cod: c.cod, ubic: ubic || '' } : null;
  }
  const textoEtiqueta = (cod, ubic) => ubic ? cod + '|' + ubic : cod;

  /* ---- Exportaciones ---- */
  const csvCelda = (v) => { v = v == null ? '' : String(v); return /[;"\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const csv = (cab, filas) => '﻿' + [cab.join(';')].concat(filas.map(f => f.map(csvCelda).join(';'))).join('\r\n') + '\r\n';
  function csvMovimientos(st) {
    return csv(['Fecha', 'Hora', 'Código', 'Tipo', 'Cantidad', 'Lote', 'Vencimiento', 'Documento', 'Responsable', 'Autorizado por', 'Observación', 'Anulado', 'Dispositivo', 'ID'],
      st.evs.filter(e => e.tipo !== 'Config' && e.tipo !== 'Anulación').map(e => [e.fecha, new Date(e.ts).toTimeString().slice(0, 5), e.cod, e.tipo, e.cant, e.lote, e.venc, e.doc, e.resp, e.aut, e.obs, st.anuladas.has(e.id) ? 'Sí' : '', e.dev, e.id]));
  }
  function csvSaldo(st) {
    const r = resumen(st); const E = { rep: 'Reponer', max: 'Sobre máximo', ok: 'En rango', na: 'Sin parámetros' };
    return csv(['Código', 'Descripción', 'Ubicación', 'Unidad', 'Saldo según planilla', 'Punto de reorden', 'Stock máximo', 'Estado', 'Conteo físico', 'Diferencia', 'Coincide (±2 %)'],
      r.filas.map(f => [f.cod, f.desc, f.c.ubic, f.c.uni, f.sal, f.ro == null ? '' : f.ro, f.c.max == null ? '' : f.c.max, E[f.est], f.conteo ? f.conteo.cant : '', f.rc ? f.rc.dif : '', f.rc ? (f.rc.ok ? 'Sí' : 'No') : '']));
  }
  function csvLotes(st) {
    const filas = []; for (const ci of st.catalogo) for (const l of lotes(st, ci.cod)) if (l.cant !== 0) filas.push([ci.cod, ci.desc, l.lote || '(sin lote)', l.venc, l.cant]);
    return csv(['Código', 'Descripción', 'Lote', 'Vencimiento', 'Saldo'], filas);
  }
  const paquete = (eventos, dev, usuario) => JSON.stringify({ app: 'inventario-piloto-hcsba', v: 1, exportado: new Date().toISOString(), dispositivo: dev, usuario, eventos });

  const api = { TIPOS_STOCK, TOL, META, DIAS_VENC, num, hoyISO, diasEntre, build, lotes, saldo, fefo, ultimoConteo, resultadoConteo, puntoReorden, estado, resumen, validar, fusionar, leerCodigo, textoEtiqueta, csvMovimientos, csvSaldo, csvLotes, paquete };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Core = api;
})(typeof self !== 'undefined' ? self : this);
