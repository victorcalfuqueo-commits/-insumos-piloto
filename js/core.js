/* Núcleo del inventario: lógica pura, sin DOM. Se prueba con node (tests/core.test.js).
   Modelo: registro de eventos que solo se agrega. Nada se borra; un error se corrige con "Anulación".
   El estado (saldos, KPI, alertas) se calcula siempre a partir de los eventos. */
(function (root) {
  const TIPOS_STOCK = { Ingreso: 1, 'Devolución': 1, Salida: -1, Ajuste: 1 };
  const TOL = 0.02;            // tolerancia del conteo (±2 %), según el informe
  const META = { kpi1: 0.95, kpi2min: 90, kpi2dias: 2, kpi3: 2.0 };
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
    const ped = st.vivos.filter(e => e.tipo === 'Pedido');
    const dia = ped.filter(e => e.modal === 'Diario'), nd = dia.length, kpi2Min = nd ? dia.reduce((x, e) => x + (new Date(e.fin) - new Date(e.ini)) / 6e4, 0) / nd : null;
    const sem = ped.filter(e => e.modal === 'Semanal'), kpi2Dias = sem.length ? sem.reduce((a, e) => a + (new Date(e.fin) - new Date(e.ini)) / 864e5, 0) / sem.length : null;
    const aTiempo = sem.filter(e => e.fin.slice(0, 10) <= e.comp).length;
    const venc = [];
    for (const f of filas) for (const l of lotes(st, f.cod)) if (l.venc && l.cant > 0) { const d = diasEntre(hoy, l.venc); if (d <= DIAS_VENC) venc.push({ cod: f.cod, desc: f.desc, lote: l.lote, venc: l.venc, cant: l.cant, dias: d }); }
    venc.sort((a, b) => a.dias - b.dias);
    return { filas, contados: contados.length, coinciden: coin.length, kpi1: contados.length ? coin.length / contados.length : null, kpi3: prom, kpi3Antes: antes, nBusquedas: bus.length, kpi2Min, kpi2Dias, nDiarias: nd, diasMedidos: new Set(dia.map(e => e.ini.slice(0, 10))).size, nSemanales: sem.length, semATiempo: aTiempo,
      alertas: filas.filter(f => f.est === 'rep' || f.est === 'max').length, venc };
  }

  /* ---- Validación (devuelve lista de errores; vacía = válido) ---- */
  function validar(st, m) {
    const err = [];
    if (m.tipo === 'Pedido') {
      if (m.modal !== 'Diario' && m.modal !== 'Semanal') err.push('Elija si es solicitud diaria o pedido semanal.');
      if (!m.serv || !String(m.serv).trim()) err.push('Falta el servicio o área que pidió.');
      const a = new Date(m.ini), b = new Date(m.fin);
      if (!m.ini || isNaN(a)) err.push('Falta la fecha y hora en que llegó la solicitud.');
      if (!m.fin || isNaN(b)) err.push('Falta la fecha y hora en que salió el despacho.');
      if (!isNaN(a) && !isNaN(b) && b < a) err.push('El despacho no puede ser anterior a la solicitud.');
      if (m.modal === 'Semanal' && !m.comp) err.push('Un pedido semanal necesita la fecha comprometida de entrega.');
      if (!m.resp || !String(m.resp).trim()) err.push('Falta el responsable.');
      return err;
    }
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
      if (!e || typeof e !== 'object' || !e.id || !e.tipo || !Number.isFinite(e.ts) || (e.tipo !== 'Anulación' && e.tipo !== 'Pedido' && !catalogoCods.includes(e.cod))) { invalidos++; continue; }
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
      st.evs.filter(e => e.tipo !== 'Config' && e.tipo !== 'Anulación' && e.tipo !== 'Pedido').map(e => [e.fecha, new Date(e.ts).toTimeString().slice(0, 5), e.cod, e.tipo, e.cant, e.lote, e.venc, e.doc, e.resp, e.aut, e.obs, st.anuladas.has(e.id) ? 'Sí' : '', e.dev, e.id]));
  }
  function csvPedidos(st) {
    const f = (e) => { const a = new Date(e.ini), b = new Date(e.fin); return e.modal === 'Diario' ? Math.round((b - a) / 6e4) : Math.round((b - a) / 864e5 * 100) / 100; };
    return csv(['Modalidad', 'Servicio o área', 'Llegó la solicitud', 'Salió el despacho', 'Duración (min si es diaria, días si es semanal)', 'Fecha comprometida', 'Entregado a tiempo', 'Nº de ítems', 'Responsable', 'Observación', 'Anulado', 'ID'],
      st.evs.filter(e => e.tipo === 'Pedido').map(e => [e.modal, e.serv, e.ini.replace('T', ' '), e.fin.replace('T', ' '), f(e), e.comp || '', e.modal === 'Semanal' ? (e.fin.slice(0, 10) <= e.comp ? 'Sí' : 'No') : '', e.n == null ? '' : e.n, e.resp, e.obs, st.anuladas.has(e.id) ? 'Sí' : '', e.id]));
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

  /* ---- Parámetros en bloque (plantilla CSV para llenar en Excel) ---- */
  const COLS_PARAM = ['Código', 'Descripción', 'Ubicación', 'Unidad', 'Saldo inicial', 'Stock mínimo', 'Stock máximo', 'Consumo diario', 'Plazo de reposición (días)'];
  /* Ubicación sugerida: macrozona A (alta rotación) - sección de origen - estantería 01 - nivel - posición (5 por nivel). */
  function ubicacionSugerida(cod, i) { return 'A-' + cod.split('-')[0] + '-01-N' + (Math.floor(i / 5) + 1) + '-' + String((i % 5) + 1).padStart(2, '0'); }
  function csvParametros(st, sugerir) {
    return csv(COLS_PARAM, st.catalogo.map((ci, i) => { const c = st.cfg[ci.cod]; return [ci.cod, ci.desc, c.ubic || (sugerir ? ubicacionSugerida(ci.cod, i) : ''), c.uni, c.ini || 0, c.min == null ? '' : c.min, c.max == null ? '' : c.max, c.cons == null ? '' : c.cons, c.plazo == null ? '' : c.plazo]; }));
  }
  function parseCsv(texto) {
    const t = String(texto).replace(/^﻿/, ''); const primera = t.split(/\r?\n/)[0] || ''; const d = (primera.match(/;/g) || []).length >= (primera.match(/,/g) || []).length ? ';' : ',';
    const filas = []; let f = [], c = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
      else if (ch === '"') q = true; else if (ch === d) { f.push(c); c = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; f.push(c); filas.push(f); f = []; c = ''; }
      else c += ch;
    }
    if (c !== '' || f.length) { f.push(c); filas.push(f); }
    return filas.filter(r => r.some(x => String(x).trim() !== ''));
  }
  const norm = (x) => String(x).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  /* Devuelve {cambios:[{cod,campos}], errores:[texto], sinCambio:n} comparando con la configuración vigente. */
  function leerParametros(texto, st) {
    const filas = parseCsv(texto); const errores = [], cambios = []; let sinCambio = 0;
    if (filas.length < 2) return { cambios, errores: ['El archivo no tiene filas de datos.'], sinCambio };
    const cab = filas[0].map(norm); const idx = (...n) => cab.findIndex(h => n.some(x => h.startsWith(x)));
    const I = { cod: idx('codigo'), ubic: idx('ubicacion'), uni: idx('unidad'), ini: idx('saldo inicial'), min: idx('stock minimo', 'minimo'), max: idx('stock maximo', 'maximo'), cons: idx('consumo'), plazo: idx('plazo') };
    if (I.cod < 0) return { cambios, errores: ['Falta la columna «Código». Use la plantilla que descarga la app.'], sinCambio };
    filas.slice(1).forEach((r, k) => {
      const cod = (r[I.cod] || '').trim(); const lin = k + 2;
      if (!cod) return;
      const ci = st.catalogo.find(x => x.cod.toLowerCase() === cod.toLowerCase());
      if (!ci) { errores.push(`Fila ${lin}: el código ${cod} no está en el catálogo.`); return; }
      const cur = st.cfg[ci.cod], campos = {}; let malo = false;
      const numero = (col, nombre, min0) => { if (I[col] < 0) return undefined; const raw = (r[I[col]] || '').trim(); if (raw === '') return null; const n = num(raw); if (n === null || (min0 && n < 0)) { errores.push(`Fila ${lin} (${ci.cod}): ${nombre} «${raw}» no es un número válido.`); malo = true; return undefined; } return n; };
      const nuevo = {};
      if (I.ubic >= 0) nuevo.ubic = (r[I.ubic] || '').trim();
      if (I.uni >= 0) nuevo.uni = (r[I.uni] || '').trim() || 'UN';
      const ini = numero('ini', 'el saldo inicial', true); if (ini !== undefined) nuevo.ini = ini === null ? 0 : ini;
      for (const [col, nom] of [['min', 'el stock mínimo'], ['max', 'el stock máximo'], ['cons', 'el consumo diario'], ['plazo', 'el plazo']]) { const v = numero(col, nom, true); if (v !== undefined) nuevo[col] = v; }
      if (malo) return;
      if (nuevo.min != null && nuevo.max != null && nuevo.max < nuevo.min) { errores.push(`Fila ${lin} (${ci.cod}): el máximo no puede ser menor que el mínimo.`); return; }
      for (const k2 in nuevo) if (nuevo[k2] !== cur[k2] && !(nuevo[k2] === '' && (cur[k2] === '' || cur[k2] == null))) campos[k2] = nuevo[k2];
      if (Object.keys(campos).length) cambios.push({ cod: ci.cod, campos }); else sinCambio++;
    });
    return { cambios, errores, sinCambio };
  }

  const paquete = (eventos, dev, usuario) => JSON.stringify({ app: 'inventario-piloto-hcsba', v: 1, exportado: new Date().toISOString(), dispositivo: dev, usuario, eventos });

  const api = { TIPOS_STOCK, TOL, META, DIAS_VENC, num, hoyISO, diasEntre, build, lotes, saldo, fefo, ultimoConteo, resultadoConteo, puntoReorden, estado, resumen, validar, fusionar, leerCodigo, textoEtiqueta, csvMovimientos, csvSaldo, csvLotes, csvPedidos, csvParametros, leerParametros, parseCsv, ubicacionSugerida, paquete };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Core = api;
})(typeof self !== 'undefined' ? self : this);
