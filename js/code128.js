/* Generador Code 128 (subconjunto B y C) sin dependencias.
   encode(texto) -> arreglo de anchos de módulos [barra, espacio, barra, ...]. */
(function (root) {
  const P = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232'];
  const STOP = '2331112';
  const START_B = 104, START_C = 105, CODE_C = 99, CODE_B = 100;
  function values(text) {
    const s = String(text);
    for (const ch of s) { const c = ch.charCodeAt(0); if (c < 32 || c > 126) throw new Error('Carácter no permitido en Code 128: ' + ch); }
    const v = [];
    let i = 0, mode = null;
    const digitsAhead = (k) => { let n = 0; while (k + n < s.length && s[k + n] >= '0' && s[k + n] <= '9') n++; return n; };
    while (i < s.length) {
      const run = digitsAhead(i);
      const useC = run >= 4 || (run >= 2 && run === s.length - i && (mode === 'C' || i === 0) && run % 2 === 0);
      if (mode !== 'C' && useC && run >= 2) {
        v.push(mode === null ? START_C : CODE_C); mode = 'C';
      } else if (mode === null) { v.push(START_B); mode = 'B'; }
      if (mode === 'C') {
        if (run >= 2) { v.push(parseInt(s.substr(i, 2), 10)); i += 2; continue; }
        v.push(CODE_B); mode = 'B';
      }
      v.push(s.charCodeAt(i) - 32); i++;
    }
    let sum = v[0];
    for (let k = 1; k < v.length; k++) sum += v[k] * k;
    v.push(sum % 103);
    return v;
  }
  function encode(text) {
    const widths = [];
    for (const val of values(text)) for (const d of P[val]) widths.push(+d);
    for (const d of STOP) widths.push(+d);
    return widths;
  }
  function svg(text, opt) {
    const o = Object.assign({ module: 2, height: 60, quiet: 10 }, opt || {});
    const w = encode(text); let x = o.quiet, bars = '', bar = true;
    for (const n of w) { if (bar) bars += `<rect x="${x}" y="0" width="${n * o.module}" height="${o.height}"/>`; x += n * o.module; bar = !bar; }
    const total = x + o.quiet;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${o.height}" width="${total}" height="${o.height}" role="img" aria-label="Código de barras ${String(text).replace(/[<>&"]/g, '')}" fill="currentColor" shape-rendering="crispEdges">${bars}</svg>`;
  }
  const api = { encode, svg, values, _P: P };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Code128 = api;
})(typeof self !== 'undefined' ? self : this);
