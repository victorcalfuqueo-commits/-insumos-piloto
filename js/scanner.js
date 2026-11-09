/* Lectura de códigos con la cámara usando BarcodeDetector (Chrome y Edge en Android, Samsung Internet).
   Si el navegador no lo ofrece, la app sigue funcionando con el código digitado. */
(function (root) {
  const FORMATOS = ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'qr_code', 'itf', 'codabar', 'data_matrix'];
  async function disponible() {
    if (!('BarcodeDetector' in root) || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !root.isSecureContext) return false;
    try { const s = await BarcodeDetector.getSupportedFormats(); return s.includes('code_128') || s.includes('qr_code'); } catch (e) { return false; }
  }
  /* abrir(video, onTexto) -> { cerrar } ; onTexto(texto) devuelve true para detener. */
  async function abrir(video, onTexto, onError) {
    let stream = null, activo = true, ultimo = '', tUlt = 0;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      video.srcObject = stream; video.setAttribute('playsinline', ''); await video.play();
      const soportados = await BarcodeDetector.getSupportedFormats();
      const det = new BarcodeDetector({ formats: FORMATOS.filter(f => soportados.includes(f)) });
      const ciclo = async () => {
        if (!activo) return;
        try {
          const r = await det.detect(video);
          if (r.length) { const t = r[0].rawValue, ahora = Date.now(); if (t !== ultimo || ahora - tUlt > 1500) { ultimo = t; tUlt = ahora; if (navigator.vibrate) navigator.vibrate(60); if (onTexto(t) === true) { cerrar(); return; } } }
        } catch (e) { /* cuadro sin código */ }
        setTimeout(ciclo, 150);
      };
      ciclo();
    } catch (e) { cerrar(); onError && onError(e); }
    function cerrar() { activo = false; if (stream) stream.getTracks().forEach(t => t.stop()); video.srcObject = null; }
    return { cerrar };
  }
  root.Scanner = { disponible, abrir };
})(self);
