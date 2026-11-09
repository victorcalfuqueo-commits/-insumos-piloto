/* Interfaz. Toda la lógica de negocio está en core.js; aquí solo se dibuja y se leen formularios. */
(function () {
  'use strict';
  const C = self.Core, CAT = self.CATALOGO;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => n == null ? '—' : (Math.round(n * 100) / 100).toLocaleString('es-CL');
  const TABS = [['inicio', 'Inicio', '▦'], ['reg', 'Registrar', '＋'], ['conteo', 'Conteo', '✓'], ['tiempos', 'Tiempos', '◷'], ['etiquetas', 'Etiquetas', '▮▯'], ['datos', 'Datos', '⇄']];
  const P = { eventos: [], dev: '', user: '', tab: 'inicio', msg: null, edit: null, anular: null, tipo: 'Salida', sel: { reg: '', conteo: '', tiempos: '' }, ultExport: 0, instalar: null, scanOk: false, ult: '' };
  let ST = null;

  const nuevoId = () => P.dev + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const recalcular = () => { ST = C.build(CAT, P.eventos); };
  async function registrar(e) {
    e.id = nuevoId(); e.ts = Date.now(); e.dev = P.dev; if (!e.fecha) e.fecha = C.hoyISO(); e.resp = e.resp || P.user;
    await self.Store.agregar([e]); P.eventos.push(e); recalcular(); return e;
  }
  const aviso = (t, k = 'ok') => { P.msg = { t, k }; };
  const msgHtml = () => P.msg ? `<div class="msg ${P.msg.k}" role="${P.msg.k === 'bad' ? 'alert' : 'status'}">${esc(P.msg.t)}</div>` : '';
  const pill = (e) => ({ rep: '<span class="pill bad">Reponer</span>', max: '<span class="pill warn">Sobre máximo</span>', ok: '<span class="pill ok">En rango</span>', na: '<span class="pill na">Sin parámetros</span>' }[e]);

  /* ---------- selector de insumo con escáner ---------- */
  function selector(id, valor) {
    const c = valor && ST.cfg[valor] ? CAT.find(x => x.cod === valor) : null;
    return `<label for="${id}-t">Código del insumo</label>
    <div class="inline"><input type="text" id="${id}-t" value="${esc(valor)}" placeholder="Escanee o digite el código" autocomplete="off" autocapitalize="off" inputmode="text">
    ${P.scanOk ? `<button type="button" class="btn sec" data-act="scan" data-id="${id}" aria-label="Escanear con la cámara">Escanear</button>` : ''}</div>
    <label for="${id}-s">o elija de la lista</label>
    <select id="${id}-s"><option value="">Elegir insumo…</option>${CAT.map(x => `<option value="${esc(x.cod)}"${x.cod === valor ? ' selected' : ''}>${esc(x.cod)} · ${esc(x.desc.slice(0, 50))}</option>`).join('')}</select>
    ${c ? `<div class="chosen"><b>${esc(c.cod)}</b> ${esc(c.desc)}<br><span class="muted">Ubicación: ${esc(ST.cfg[c.cod].ubic || 'sin asignar')} · Saldo: <b>${fmt(C.saldo(ST, c.cod))} ${esc(ST.cfg[c.cod].uni)}</b></span></div>` : ''}`;
  }
  function elegir(vista, cod) { P.sel[vista] = cod; render(); const f = $('#f-cant'); if (f) f.focus(); }

  /* ---------- vistas ---------- */
  function vInicio() {
    const r = C.resumen(ST), k1 = r.kpi1, hace = P.ultExport ? (Date.now() - P.ultExport) / 36e5 : Infinity;
    const nMov = ST.vivos.length;
    let h = msgHtml();
    if (nMov && hace > 24) h += `<div class="msg warn">No ha exportado sus registros en las últimas 24 horas. Vaya a Datos y exporte antes de terminar el turno.</div>`;
    h += `<div class="tiles">
    <div class="tile"><small>Exactitud del inventario (KPI1)</small><strong class="${k1 == null ? '' : k1 >= C.META.kpi1 ? 'g' : 'r'}">${k1 == null ? '—' : Math.round(k1 * 100) + ' %'}</strong><span>${r.contados ? r.coinciden + ' de ' + r.contados + ' contados coinciden · meta ≥ 95 %' : 'Aún sin conteos'}</span></div>
    <div class="tile"><small>Tiempo de búsqueda (KPI3)</small><strong class="${r.kpi3 == null ? '' : r.kpi3 <= C.META.kpi3 ? 'g' : 'r'}">${r.kpi3 == null ? '—' : fmt(r.kpi3) + ' min'}</strong><span>Antes ${fmt(r.kpi3Antes)} min · meta ≤ 2,0</span></div>
    <div class="tile"><small>Alertas de stock</small><strong>${r.alertas}</strong><span>${r.alertas ? 'Reponer o sobre el máximo' : 'Sin alertas'}</span></div>
    <div class="tile"><small>Movimientos</small><strong>${nMov}</strong><span>En este celular</span></div></div>
    <h2>Saldo por insumo</h2><p class="muted">Toque un insumo para ver sus lotes y editar ubicación y parámetros.</p>
    <div class="tw"><table><thead><tr><th>Código</th><th>Descripción</th><th>Ubicación</th><th class="n">Saldo</th><th class="n">Reorden</th><th class="n">Máx.</th><th>Estado</th><th>Conteo</th></tr></thead><tbody>
    ${r.filas.map(f => `<tr class="click" tabindex="0" data-act="edit" data-cod="${esc(f.cod)}"><td class="code">${esc(f.cod)}</td><td class="d">${esc(f.desc)}</td><td class="code">${esc(f.c.ubic || '—')}</td><td class="n"><b>${fmt(f.sal)}</b></td><td class="n">${fmt(f.ro)}</td><td class="n">${fmt(f.c.max)}</td><td>${pill(f.est)}</td><td>${f.rc ? (f.rc.ok ? '<span class="pill ok">Coincide</span>' : `<span class="pill bad">${f.rc.dif > 0 ? '+' : ''}${fmt(f.rc.dif)}</span>`) : '<span class="pill na">Sin conteo</span>'}</td></tr>`).join('')}</tbody></table></div>`;
    if (r.venc.length) h += `<h2>Lotes que vencen en 60 días o menos</h2><div class="tw"><table><thead><tr><th>Código</th><th>Lote</th><th>Vence</th><th class="n">Cantidad</th><th class="n">Días</th></tr></thead><tbody>${r.venc.map(v => `<tr><td class="code">${esc(v.cod)}</td><td>${esc(v.lote || '—')}</td><td>${esc(v.venc)}</td><td class="n">${fmt(v.cant)}</td><td class="n">${v.dias < 0 ? '<span class="pill bad">Vencido</span>' : v.dias}</td></tr>`).join('')}</tbody></table></div>`;
    if (P.edit) h += formEditar(P.edit);
    h += `<h2>Últimos movimientos</h2>${tablaMov(ST.vivos.filter(e => e.tipo !== 'Búsqueda').slice(-10).reverse(), true)}`;
    if (P.anular) h += formAnular(P.anular);
    return h;
  }
  function formEditar(cod) {
    const c = ST.cfg[cod], ci = CAT.find(x => x.cod === cod), ls = C.lotes(ST, cod).filter(l => l.cant !== 0);
    return `<div class="card" id="editar"><h2 style="margin-top:0">${esc(cod)}</h2><p>${esc(ci.desc)}</p>
    ${ls.length ? `<div class="tw"><table><thead><tr><th>Lote</th><th>Vence</th><th class="n">Saldo</th></tr></thead><tbody>${ls.map(l => `<tr><td>${esc(l.lote || '(sin lote)')}</td><td>${esc(l.venc || '—')}</td><td class="n">${fmt(l.cant)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sin existencias registradas.</p>'}
    <label for="e-ub">Ubicación (MACROZONA-SECCIÓN-ESTANTERÍA-NIVEL-POSICIÓN)</label><input type="text" id="e-ub" value="${esc(c.ubic)}" placeholder="Ej.: M1-S222-E01-N2-P03">
    <div class="row"><div><label for="e-un">Unidad</label><input type="text" id="e-un" value="${esc(c.uni)}"></div><div><label for="e-in">Saldo inicial (sin lote)</label><input type="number" inputmode="decimal" id="e-in" value="${c.ini || 0}" min="0" step="any"></div></div>
    <div class="row"><div><label for="e-mi">Stock mínimo</label><input type="number" inputmode="decimal" id="e-mi" value="${c.min == null ? '' : c.min}" min="0" step="any"></div><div><label for="e-ma">Stock máximo</label><input type="number" inputmode="decimal" id="e-ma" value="${c.max == null ? '' : c.max}" min="0" step="any"></div></div>
    <div class="row"><div><label for="e-co">Consumo diario promedio</label><input type="number" inputmode="decimal" id="e-co" value="${c.cons == null ? '' : c.cons}" min="0" step="any"></div><div><label for="e-pl">Plazo de reposición (días)</label><input type="number" inputmode="numeric" id="e-pl" value="${c.plazo == null ? '' : c.plazo}" min="0"></div></div>
    <p class="muted">Punto de reorden = mínimo + consumo diario × plazo. El plazo de 5 días es un supuesto por confirmar con la jefatura.</p>
    <div class="btns"><button class="btn" data-act="edit-ok" data-cod="${esc(cod)}">Guardar</button><button class="btn sec" data-act="edit-no">Cancelar</button></div></div>`;
  }
  function tablaMov(a, conAnular) {
    if (!a.length) return '<p class="muted">Aún no hay movimientos.</p>';
    return `<div class="tw"><table><thead><tr><th>Fecha</th><th>Código</th><th>Tipo</th><th class="n">Cant.</th><th>Lote</th><th>Responsable</th>${conAnular ? '<th></th>' : ''}</tr></thead><tbody>${a.map(m => `<tr><td>${esc(m.fecha)}</td><td class="code">${esc(m.cod)}</td><td>${esc(m.tipo)}</td><td class="n">${fmt(m.cant)}</td><td>${esc(m.lote || '')}</td><td>${esc(m.resp)}</td>${conAnular ? `<td><button class="btn link" data-act="anular" data-id="${esc(m.id)}">Anular</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  }
  function formAnular(id) {
    const m = ST.evs.find(e => e.id === id); if (!m) return '';
    return `<div class="card"><h2 style="margin-top:0">Anular movimiento</h2><p>${esc(m.tipo)} de ${fmt(m.cant)} · ${esc(m.cod)} · ${esc(m.fecha)}. El movimiento no se borra: queda en el registro marcado como anulado.</p>
    <label for="a-mo">Motivo</label><input type="text" id="a-mo" placeholder="Ej.: se digitó mal la cantidad"><div id="a-err"></div>
    <div class="btns"><button class="btn bad" data-act="anular-ok" data-id="${esc(id)}">Anular movimiento</button><button class="btn sec" data-act="anular-no">Cancelar</button></div></div>`;
  }

  function vReg() {
    const t = P.tipo, cod = P.sel.reg, T = ['Ingreso', 'Salida', 'Devolución', 'Ajuste'];
    const fe = cod && t === 'Salida' ? C.fefo(ST, cod) : [];
    let h = msgHtml() + `<div class="card"><label>Tipo de movimiento</label><div class="seg" role="group">${T.map(x => `<button type="button" aria-pressed="${x === t}" data-act="tipo" data-t="${x}">${x === 'Devolución' ? 'Devolución de servicio' : x}</button>`).join('')}</div>
    ${selector('reg', cod)}
    <div class="row"><div><label for="f-cant">${t === 'Ajuste' ? 'Cantidad (use − para restar)' : 'Cantidad'}</label><input type="number" id="f-cant" inputmode="decimal" step="any"></div><div><label for="f-fecha">Fecha</label><input type="date" id="f-fecha" value="${C.hoyISO()}"></div></div>`;
    if (t === 'Salida' && cod) h += `<label for="f-lote">Lote (el primero en vencer va primero)</label><select id="f-lote">${fe.map((l, i) => `<option value="${esc(l.lote)}">${esc(l.lote || '(sin lote)')} · vence ${esc(l.venc || 'sin fecha')} · hay ${fmt(l.cant)}${i === 0 ? ' · sugerido' : ''}</option>`).join('') || '<option value="">Sin stock</option>'}</select>`;
    if (t === 'Ingreso' || t === 'Devolución') h += `<div class="row"><div><label for="f-lote">Lote${t === 'Devolución' ? '' : ' (opcional)'}</label><input type="text" id="f-lote" autocapitalize="characters"></div><div><label for="f-venc">Vencimiento${t === 'Devolución' ? '' : ' (opcional)'}</label><input type="date" id="f-venc"></div></div>`;
    h += `<div class="row"><div><label for="f-doc">${t === 'Devolución' ? 'Memo o correo del servicio' : 'Documento o solicitud'}</label><input type="text" id="f-doc" placeholder="N.º"></div><div><label for="f-resp">Responsable</label><input type="text" id="f-resp" value="${esc(P.user)}" placeholder="Su nombre"></div></div>`;
    if (t === 'Devolución') h += `<label for="f-ver">El jefe de bodega verificó cantidad, lote y vencimiento contra lo informado</label><select id="f-ver"><option value="">Elegir…</option><option value="si">Sí, coincide</option><option value="no">No coincide</option></select><label for="f-aut">Autorizado por (jefe de bodega)</label><input type="text" id="f-aut">`;
    h += `<label for="f-obs">Observación${t === 'Ajuste' ? ' (obligatoria)' : ''}</label><input type="text" id="f-obs"><div id="f-err"></div>
    <div class="btns"><button class="btn" data-act="guardar-mov">Registrar ${t === 'Devolución' ? 'devolución' : t.toLowerCase()}</button></div></div>`;
    return h;
  }
  function vConteo() {
    const r = C.resumen(ST), cod = P.sel.conteo;
    const cont = ST.vivos.filter(e => e.tipo === 'Conteo').slice(-10).reverse();
    return msgHtml() + `<div class="card"><p class="muted">Cuente el insumo físicamente y digite lo que hay. Se compara con el saldo de la planilla; coincide si la diferencia es de ±2 % o menos (KPI1).</p>${selector('conteo', cod)}
    <div class="row"><div><label for="f-cant">Conteo físico</label><input type="number" id="f-cant" inputmode="decimal" min="0" step="any"></div><div><label for="f-resp">Responsable</label><input type="text" id="f-resp" value="${esc(P.user)}"></div></div>
    <label for="f-obs">Observación</label><input type="text" id="f-obs"><div id="f-err"></div><div class="btns"><button class="btn" data-act="guardar-conteo">Guardar conteo</button></div></div>
    <div class="tiles"><div class="tile"><small>Contados</small><strong>${r.contados} de ${CAT.length}</strong></div><div class="tile"><small>Coinciden (±2 %)</small><strong>${r.coinciden}</strong></div><div class="tile"><small>KPI1</small><strong>${r.kpi1 == null ? '—' : Math.round(r.kpi1 * 100) + ' %'}</strong><span>Meta ≥ 95 %</span></div></div>
    <h2>Conteos recientes</h2>${cont.length ? `<div class="tw"><table><thead><tr><th>Fecha</th><th>Código</th><th class="n">Saldo planilla</th><th class="n">Conteo</th><th class="n">Dif.</th><th>Resultado</th></tr></thead><tbody>${cont.map(e => { const x = C.resultadoConteo(ST, e); return `<tr><td>${esc(e.fecha)}</td><td class="code">${esc(e.cod)}</td><td class="n">${fmt(x.sp)}</td><td class="n">${fmt(e.cant)}</td><td class="n">${x.dif > 0 ? '+' : ''}${fmt(x.dif)}</td><td>${x.ok ? '<span class="pill ok">Coincide</span>' : '<span class="pill bad">No coincide</span>'}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">Aún no hay conteos.</p>'}`;
  }
  function ahoraLocal() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
  function vPedidos() {
    const r = C.resumen(ST), m = P.modal || 'Diario', ped = ST.vivos.filter(e => e.tipo === 'Pedido').slice(-10).reverse();
    const a = r.kpi2Min, b = r.kpi2Dias;
    const dur = (e) => { const x = new Date(e.fin) - new Date(e.ini); return e.modal === 'Diario' ? Math.round(x / 6e4) + ' min' : fmt(Math.round(x / 864e5 * 10) / 10) + ' días'; };
    return msgHtml() + `<div class="card"><p class="muted">Registre cada pedido que sale de la bodega. <b>Solicitud diaria:</b> la piden los servicios y debe salir el mismo día. <b>Pedido semanal programado:</b> tiene una fecha comprometida de entrega.</p>
    <label>Tipo de pedido</label><div class="seg" role="group"><button type="button" aria-pressed="${m === 'Diario'}" data-act="modal" data-t="Diario">Solicitud diaria</button><button type="button" aria-pressed="${m === 'Semanal'}" data-act="modal" data-t="Semanal">Pedido semanal programado</button></div>
    <label for="p-serv">Servicio o área que pide</label><input type="text" id="p-serv" placeholder="Ej.: UCI, Pabellón, Urgencia">
    <div class="row"><div><label for="p-ini">Llegó la solicitud</label><input type="datetime-local" id="p-ini" value="${ahoraLocal()}"></div><div><label for="p-fin">Salió el despacho</label><input type="datetime-local" id="p-fin" value="${ahoraLocal()}"></div></div>
    ${m === 'Semanal' ? '<label for="p-comp">Fecha comprometida de entrega</label><input type="date" id="p-comp">' : ''}
    <div class="row"><div><label for="p-n">Nº de ítems (opcional)</label><input type="number" id="p-n" inputmode="numeric" min="0"></div><div><label for="f-resp">Responsable</label><input type="text" id="f-resp" value="${esc(P.user)}"></div></div>
    <label for="f-obs">Observación</label><input type="text" id="f-obs"><div id="f-err"></div>
    <div class="btns"><button class="btn" data-act="guardar-pedido">Guardar pedido</button></div></div>
    <div class="tiles"><div class="tile"><small>Solicitud diaria (promedio)</small><strong>${a == null ? '—' : Math.round(a) + ' min'}</strong><span>Meta ≤ ${C.META.kpi2min} · antes 123 · ${r.nDiarias} solicitudes en ${r.diasMedidos} días</span></div><div class="tile"><small>Pedidos semanales</small><strong>${b == null ? '—' : fmt(Math.round(b * 10) / 10) + ' días'}</strong><span>Meta ≤ ${C.META.kpi2dias} · antes 2,6 · ${r.nSemanales} pedidos</span></div><div class="tile"><small>Semanales a tiempo</small><strong>${r.nSemanales ? r.semATiempo + ' de ' + r.nSemanales : '—'}</strong><span>según fecha comprometida</span></div></div>
    <h2>Últimos pedidos</h2>${ped.length ? `<div class="tw"><table><thead><tr><th>Tipo</th><th>Servicio</th><th>Llegó</th><th class="n">Duración</th><th>¿A tiempo?</th></tr></thead><tbody>${ped.map(e => `<tr><td>${e.modal === 'Diario' ? 'Diaria' : 'Semanal'}</td><td>${esc(e.serv)}</td><td>${esc(e.ini.replace('T', ' '))}</td><td class="n">${dur(e)}</td><td>${e.modal === 'Semanal' ? (e.fin.slice(0, 10) <= e.comp ? '<span class="pill ok">Sí</span>' : '<span class="pill bad">No</span>') : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aún no hay pedidos registrados.</p>'}`;
  }
  function vTiempos() {
    const sub = P.sub || 'busq';
    const sw = `<div class="seg" role="group" style="margin-bottom:12px"><button type="button" aria-pressed="${sub === 'busq'}" data-act="sub" data-t="busq">Búsqueda de insumo (KPI3)</button><button type="button" aria-pressed="${sub === 'ped'}" data-act="sub" data-t="ped">Pedidos (KPI2)</button></div>`;
    return sw + (sub === 'ped' ? vPedidos() : vBusqueda());
  }
  function vBusqueda() {
    const r = C.resumen(ST), cod = P.sel.tiempos, k = r.kpi3;
    return msgHtml() + `<div class="card"><p class="muted">Mida cuántos minutos tardó en encontrar el insumo desde que recibió la solicitud (KPI3). Meta: 2,0 minutos o menos.</p>${selector('tiempos', cod)}
    <div class="row"><div><label for="f-cant">Minutos</label><input type="number" id="f-cant" inputmode="decimal" min="0" step="any"></div><div><label for="f-resp">Responsable</label><input type="text" id="f-resp" value="${esc(P.user)}"></div></div><div id="f-err"></div>
    <div class="btns"><button class="btn" data-act="guardar-tiempo">Guardar tiempo</button></div></div>
    <div class="tiles"><div class="tile"><small>Promedio actual</small><strong>${k == null ? '—' : fmt(k) + ' min'}</strong><span>${r.nBusquedas} mediciones</span></div><div class="tile"><small>Promedio antes (26/10)</small><strong>${fmt(r.kpi3Antes)} min</strong></div><div class="tile"><small>Semáforo</small><strong>${k == null ? '—' : k <= 2 ? 'Verde' : k <= 3 ? 'Amarillo' : 'Rojo'}</strong><span>Meta ≤ 2,0 min</span></div></div>
    <h2>Por insumo</h2><div class="tw"><table><thead><tr><th>Código</th><th>Descripción</th><th class="n">Antes</th><th class="n">Después</th><th>¿Cumple?</th></tr></thead><tbody>${CAT.map(c => { const a = ST.vivos.filter(e => e.tipo === 'Búsqueda' && e.cod === c.cod); const p = a.length ? a.reduce((x, e) => x + e.cant, 0) / a.length : null; return `<tr><td class="code">${esc(c.cod)}</td><td class="d">${esc(c.desc)}</td><td class="n">${fmt(c.antes)}</td><td class="n">${fmt(p)}</td><td>${p == null ? '<span class="pill na">Sin medir</span>' : p <= 2 ? '<span class="pill ok">Sí</span>' : '<span class="pill bad">No</span>'}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  function vEtiquetas() {
    return `<div class="noprint"><p class="muted">Cada etiqueta lleva el código del insumo y su ubicación en un código de barras Code 128. Al escanearla, la app reconoce el insumo. Asigne la ubicación en Inicio antes de imprimir. Use la impresora de etiquetas del hospital o una hoja con la opción «Imprimir».</p>
    <div class="btns"><button class="btn" data-act="imprimir">Imprimir etiquetas</button></div></div>
    <div class="labels">${CAT.map(c => { const u = ST.cfg[c.cod].ubic; const txt = C.textoEtiqueta(c.cod, u); return `<figure class="label">${self.Code128.svg(txt, { module: 2, height: 48, quiet: 12 })}<figcaption><b class="code">${esc(c.cod)}</b> ${u ? `<span class="code">${esc(u)}</span>` : '<span class="muted">sin ubicación</span>'}<br>${esc(c.desc.slice(0, 60))}</figcaption></figure>`; }).join('')}</div>`;
  }
  function vDatos() {
    return msgHtml() + `<div class="card"><h2 style="margin-top:0">Mis datos</h2><label for="u-n">Mi nombre</label><input type="text" id="u-n" value="${esc(P.user)}" placeholder="Su nombre"><p class="muted">Los registros quedan guardados en este celular, aunque se cierre la app o no haya internet. Cada movimiento lleva su nombre, la fecha y la hora, y no se puede borrar: un error se corrige con Anular.</p></div>
    <div class="card"><h2 style="margin-top:0">Enviar mis registros</h2><p class="muted">Al terminar el turno, exporte y entregue el archivo .json a quien consolida. Los .csv se abren en Excel.</p>
    <div class="btns"><button class="btn" data-act="exp-json">Exportar registros (.json)</button><button class="btn sec" data-act="exp-mov">Movimientos (.csv)</button><button class="btn sec" data-act="exp-sal">Saldo (.csv)</button><button class="btn sec" data-act="exp-lot">Lotes (.csv)</button><button class="btn sec" data-act="exp-ped">Pedidos (.csv)</button></div></div>
    <div class="card"><h2 style="margin-top:0">Actualizar con los registros de otros</h2><p class="muted">Quien consolida elige los .json de sus compañeros. Los movimientos repetidos se ignoran y los saldos se recalculan solos.</p>
    <label for="i-f">Archivos .json</label><input type="file" id="i-f" accept=".json,application/json" multiple><div class="btns"><button class="btn" data-act="importar">Importar y actualizar</button></div></div>
    <div class="card"><h2 style="margin-top:0">Cargar parámetros de los 20 insumos</h2><p class="muted">Descargue la plantilla, complétela en Excel (ubicación, saldo inicial, mínimo, máximo, consumo diario y plazo) y súbala aquí. Es más rápido que editar insumo por insumo. La plantilla trae una ubicación sugerida que debe validar la jefatura.</p>
    <div class="btns"><button class="btn sec" data-act="exp-par">Descargar plantilla (.csv)</button></div>
    <label for="p-f">Plantilla completada (.csv)</label><input type="file" id="p-f" accept=".csv,text/csv"><div class="btns"><button class="btn" data-act="imp-par">Cargar parámetros</button></div><div id="p-res"></div></div>
    ${P.instalar ? `<div class="card"><h2 style="margin-top:0">Instalar en el celular</h2><div class="btns"><button class="btn" data-act="instalar">Instalar la app</button></div></div>` : ''}
    <div class="card"><h2 style="margin-top:0">Dejar este celular en blanco</h2><p class="muted">Borra los registros y parámetros de este celular. Úselo solo para quitar datos de prueba o si ya exportó y entregó sus registros. Hoy hay <b>${ST.vivos.length}</b> movimientos${P.ultExport ? '' : ' y nunca se exportó'}.</p>
    <label for="z-t">Para confirmar, escriba BORRAR</label><input type="text" id="z-t" autocomplete="off" autocapitalize="characters"><div class="btns"><button class="btn bad" data-act="reiniciar">Borrar los datos de este celular</button></div><div id="z-res"></div></div>
    <div class="card"><h2 style="margin-top:0">Estado</h2><p class="muted">Almacenamiento: ${self.Store.modo() === 'idb' ? 'IndexedDB' : 'localStorage (respaldo)'} · Dispositivo: <span class="code">${esc(P.dev)}</span> · Cámara: ${P.scanOk ? 'disponible' : 'no disponible en este navegador (digite el código)'} · Registros: ${ST.evs.length}</p></div>`;
  }

  /* ---------- render ---------- */
  function render() {
    $('#nav').innerHTML = TABS.map(t => `<button role="tab" aria-selected="${t[0] === P.tab}" data-act="tab" data-t="${t[0]}"><b>${t[2]}</b>${t[1]}</button>`).join('');
    const V = { inicio: vInicio, reg: vReg, conteo: vConteo, tiempos: vTiempos, etiquetas: vEtiquetas, datos: vDatos }[P.tab];
    $('#main').innerHTML = V();
    const t = $('#reg-t,#conteo-t,#tiempos-t'); // el selector de la vista activa
    if (t) { const vista = t.id.replace('-t', ''); const s = $('#' + vista + '-s');
      t.addEventListener('input', () => { const x = C.leerCodigo(t.value, CAT); if (x) elegir(vista, x.cod); });
      t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const x = C.leerCodigo(t.value, CAT); if (x) elegir(vista, x.cod); else { aviso('Ese código no está en el catálogo del piloto.', 'bad'); render(); } } });
      s.addEventListener('change', () => elegir(vista, s.value)); }
    const u = $('#u-n'); if (u) u.addEventListener('change', async () => { P.user = u.value.trim(); await self.Store.fijarMeta('user', P.user); });
    if (P.edit) { const ed = $('#editar'); ed && ed.scrollIntoView({ block: 'center' }); }
  }
  const msgErr = (a) => { const b = $('#f-err'); if (b) b.innerHTML = `<div class="msg bad" role="alert">${a.map(esc).join('<br>')}</div>`; };
  const val = (id) => { const e = $('#' + id); return e ? e.value.trim() : ''; };

  async function exportar(nombre, texto, mime) {
    let dl = null; try { dl = await self.claude?.use?.('downloads'); } catch (e) { }
    if (dl) { try { await dl.save({ filename: nombre, data: texto }); } catch (e) { aviso('No se guardó el archivo.', 'warn'); render(); return; } }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: mime })); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
    P.ultExport = Date.now(); await self.Store.fijarMeta('ultExport', P.ultExport); aviso('Archivo generado: ' + nombre, 'ok'); render();
  }

  const acciones = {
    tab(el) { P.tab = el.dataset.t; P.msg = null; P.edit = null; P.anular = null; render(); scrollTo(0, 0); },
    sub(el) { P.sub = el.dataset.t; P.msg = null; render(); },
    modal(el) { P.modal = el.dataset.t; P.msg = null; render(); },
    async 'guardar-pedido'() {
      const m = { tipo: 'Pedido', modal: P.modal || 'Diario', serv: val('p-serv'), ini: val('p-ini'), fin: val('p-fin'), resp: val('f-resp'), obs: val('f-obs') };
      const c = $('#p-comp'); if (c) m.comp = c.value; const n = C.num(val('p-n')); if (n != null && !isNaN(n)) m.n = n;
      const err = C.validar(ST, m); if (err.length) return msgErr(err);
      P.user = m.resp; await self.Store.fijarMeta('user', P.user);
      await registrar(m); aviso('Pedido guardado.'); render();
    },
    tipo(el) { P.tipo = el.dataset.t; P.msg = null; render(); },
    edit(el) { P.edit = el.dataset.cod; render(); },
    'edit-no'() { P.edit = null; render(); },
    async 'edit-ok'(el) {
      const cod = el.dataset.cod, c = ST.cfg[cod], n = (id) => C.num($('#' + id).value);
      const nuevo = { ubic: val('e-ub'), uni: val('e-un') || 'UN', ini: n('e-in') || 0, min: n('e-mi'), max: n('e-ma'), cons: n('e-co'), plazo: n('e-pl') };
      const campos = {}; for (const k in nuevo) if (nuevo[k] !== c[k]) campos[k] = nuevo[k];
      if (!P.user) { aviso('Primero escriba su nombre en Datos.', 'bad'); P.edit = null; render(); return; }
      if (Object.keys(campos).length) { await registrar({ tipo: 'Config', cod, campos }); aviso('Datos de ' + cod + ' guardados.'); } else aviso('No hay cambios.', 'warn');
      P.edit = null; render();
    },
    anular(el) { P.anular = el.dataset.id; render(); },
    'anular-no'() { P.anular = null; render(); },
    async 'anular-ok'(el) {
      const mo = val('a-mo'); if (!mo) { $('#a-err').innerHTML = '<div class="msg bad" role="alert">Escriba el motivo.</div>'; return; }
      if (!P.user) { $('#a-err').innerHTML = '<div class="msg bad" role="alert">Primero escriba su nombre en Datos.</div>'; return; }
      const m = ST.evs.find(e => e.id === el.dataset.id);
      await registrar({ tipo: 'Anulación', ref: m.id, cod: m.cod, obs: mo }); P.anular = null; aviso('Movimiento anulado. Queda en el registro.'); render();
    },
    async 'guardar-mov'() {
      const t = P.tipo, cod = P.sel.reg, m = { tipo: t, cod, cant: C.num(val('f-cant')), fecha: val('f-fecha'), doc: val('f-doc'), resp: val('f-resp'), obs: val('f-obs') };
      if (t === 'Salida' || t === 'Ingreso' || t === 'Devolución') { m.lote = val('f-lote'); const v = $('#f-venc'); if (v) m.venc = v.value; }
      if (t === 'Devolución') { m.verificada = val('f-ver') === 'si'; m.aut = val('f-aut'); if (!val('f-ver')) return msgErr(['Indique si el jefe de bodega verificó la devolución.']); }
      if (t === 'Salida' && cod) { const fe = ST.cfg[cod] ? C.lotes(ST, cod).find(l => l.lote === m.lote) : null; if (fe && fe.venc) m.venc = fe.venc; }
      const err = C.validar(ST, m); if (err.length) return msgErr(err);
      P.user = m.resp; await self.Store.fijarMeta('user', P.user);
      await registrar(m); aviso(`Registrado. Saldo de ${cod}: ${fmt(C.saldo(ST, cod))} ${ST.cfg[cod].uni}.`); P.sel.reg = ''; render();
    },
    async 'guardar-conteo'() {
      const cod = P.sel.conteo, m = { tipo: 'Conteo', cod, cant: C.num(val('f-cant')), resp: val('f-resp'), obs: val('f-obs') };
      const err = C.validar(ST, m); if (err.length) return msgErr(err);
      P.user = m.resp; await self.Store.fijarMeta('user', P.user);
      const e = await registrar(m), x = C.resultadoConteo(ST, e);
      aviso(x.ok ? 'Conteo guardado: coincide con la planilla.' : `Conteo guardado: no coincide (planilla ${fmt(x.sp)}, físico ${fmt(e.cant)}). Revise los movimientos antes de ajustar.`, x.ok ? 'ok' : 'warn'); P.sel.conteo = ''; render();
    },
    async 'guardar-tiempo'() {
      const cod = P.sel.tiempos, m = { tipo: 'Búsqueda', cod, cant: C.num(val('f-cant')), resp: val('f-resp') };
      const err = C.validar(ST, m); if (err.length) return msgErr(err);
      P.user = m.resp; await self.Store.fijarMeta('user', P.user);
      await registrar(m); aviso(`Tiempo guardado: ${fmt(m.cant)} min para ${cod}.`); P.sel.tiempos = ''; render();
    },
    'exp-par'() { exportar('plantilla_parametros_' + C.hoyISO() + '.csv', C.csvParametros(ST, true), 'text/csv'); },
    async 'imp-par'() {
      const box = $('#p-res'), f = $('#p-f').files[0], bad = (t) => { box.innerHTML = `<div class="msg bad" role="alert">${esc(t)}</div>`; };
      if (!f) return bad('Elija la plantilla completada (.csv).');
      if (!P.user) return bad('Primero escriba su nombre en Mis datos.');
      const r = C.leerParametros(await f.text(), ST);
      if (r.errores.length) return bad('No se cargó nada. Corrija esto y vuelva a subir: ' + r.errores.join(' '));
      for (const c of r.cambios) await registrar({ tipo: 'Config', cod: c.cod, campos: c.campos });
      aviso(r.cambios.length ? `Parámetros cargados en ${r.cambios.length} insumo(s)${r.sinCambio ? ` (${r.sinCambio} sin cambios)` : ''}.` : 'No había cambios que cargar.', r.cambios.length ? 'ok' : 'warn'); P.tab = 'inicio'; render();
    },
    async reiniciar() {
      if (val('z-t') !== 'BORRAR') { $('#z-res').innerHTML = '<div class="msg bad" role="alert">Escriba BORRAR para confirmar.</div>'; return; }
      await self.Store.borrarTodo(); await self.Store.fijarMeta('ultExport', 0); P.eventos = []; P.ultExport = 0; recalcular(); aviso('Este celular quedó en blanco.', 'ok'); P.tab = 'inicio'; render();
    },
    imprimir() { self.print(); },
    'exp-json'() { exportar(`registros_${(P.user || P.dev).replace(/\W+/g, '_')}_${C.hoyISO()}.json`, C.paquete(P.eventos, P.dev, P.user), 'application/json'); },
    'exp-mov'() { exportar(`movimientos_${C.hoyISO()}.csv`, C.csvMovimientos(ST), 'text/csv'); },
    'exp-sal'() { exportar(`saldo_${C.hoyISO()}.csv`, C.csvSaldo(ST), 'text/csv'); },
    'exp-ped'() { exportar(`pedidos_${C.hoyISO()}.csv`, C.csvPedidos(ST), 'text/csv'); },
    'exp-lot'() { exportar(`lotes_${C.hoyISO()}.csv`, C.csvLotes(ST), 'text/csv'); },
    async importar() {
      const fs = $('#i-f').files; if (!fs.length) { aviso('Elija uno o más archivos .json.', 'bad'); render(); return; }
      let nuevos = 0, rep = 0, inv = 0, mal = 0; const cods = CAT.map(c => c.cod);
      for (const f of fs) {
        let d; try { d = JSON.parse(await f.text()); } catch (e) { mal++; continue; }
        if (!d || d.app !== 'inventario-piloto-hcsba' || !Array.isArray(d.eventos)) { mal++; continue; }
        const r = C.fusionar(P.eventos, d.eventos, cods); await self.Store.agregar(r.nuevos); P.eventos.push(...r.nuevos); nuevos += r.nuevos.length; rep += r.repetidos; inv += r.invalidos;
      }
      recalcular(); aviso(`Se agregaron ${nuevos} registros${rep ? `, ${rep} repetidos ignorados` : ''}${inv ? `, ${inv} inválidos descartados` : ''}${mal ? `. ${mal} archivo(s) no son registros de esta app` : ''}. Saldos actualizados.`, mal && !nuevos ? 'bad' : 'ok');
      P.tab = 'inicio'; render();
    },
    async instalar() { if (P.instalar) { P.instalar.prompt(); P.instalar = null; render(); } },
    async scan(el) {
      const id = el.dataset.id; const ov = $('#scan'); ov.hidden = false; const v = $('#scan video'); $('#scan-msg').textContent = 'Apunte al código de la etiqueta.';
      let h = null;
      const cerrar = () => { if (h) h.cerrar(); ov.hidden = true; };
      $('#scan-x').onclick = cerrar;
      h = await self.Scanner.abrir(v, (t) => { const x = C.leerCodigo(t, CAT); if (!x) { $('#scan-msg').textContent = 'Código no reconocido: ' + t; return false; } cerrar(); elegir(id, x.cod); return true; },
        () => { $('#scan-msg').textContent = 'No se pudo abrir la cámara. Revise el permiso del navegador o digite el código.'; });
    }
  };
  document.addEventListener('click', (e) => { const el = e.target.closest('[data-act]'); if (!el) return; const f = acciones[el.dataset.act]; if (f) f(el); });
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr.click')) { e.preventDefault(); acciones.edit(e.target); } });
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); P.instalar = e; if (P.tab === 'datos') render(); });

  (async function iniciar() {
    P.eventos = await self.Store.todos();
    P.dev = (await self.Store.meta('dev')) || ('d' + Math.random().toString(36).slice(2, 7)); await self.Store.fijarMeta('dev', P.dev);
    P.user = (await self.Store.meta('user')) || ''; P.ultExport = (await self.Store.meta('ultExport')) || 0;
    recalcular(); try { P.scanOk = await self.Scanner.disponible(); } catch (e) { }
    if (!P.user) P.tab = 'datos';
    render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
  })();
})();
