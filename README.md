# Control de Insumos Piloto (HCSBA)

Aplicación web instalable (PWA) para registrar y controlar el inventario de los 20 insumos del piloto de la bodega de insumos clínicos del Hospital Clínico San Borja Arriarán. Proyecto Integrado LOPR01, INACAP Puente Alto, sección 214.

Funciona sin internet, no necesita cuenta ni servidor y guarda los datos en cada celular. Para consolidar, cada usuario exporta un archivo y quien consolida lo importa.

## Qué hace

- **Saldo por insumo y por lote**, con punto de reorden, máximo, alertas y lotes por vencer (60 días). Las salidas sugieren el lote que vence primero (FEFO).
- **Registrar** ingresos, salidas, devoluciones de servicio y ajustes. La devolución sigue el procedimiento acordado: avisa el servicio, el jefe de bodega verifica cantidad, lote y vencimiento y la autoriza; si no coincide, no se recibe.
- **Conteo físico** contra el saldo de la planilla (coincide con ±2 %). Calcula el **KPI1** (exactitud del inventario).
- **Tiempos de búsqueda** por insumo. Calcula el **KPI3** y lo compara con la medición del 26/10.
- **Etiquetas** imprimibles con código de barras Code 128 (código del insumo y ubicación).
- **Escáner con la cámara** (BarcodeDetector) en Chrome, Edge y Samsung Internet para Android. Si el navegador no lo permite, se digita el código.
- **Registro que no se borra.** Cada movimiento guarda quién, cuándo y desde qué dispositivo. Un error se corrige con *Anular* (con motivo); el movimiento queda en el historial.
- **Exportar** registros (.json) y reportes para Excel (.csv: movimientos, saldo y lotes). **Importar** los .json de otros usuarios; los repetidos se ignoran.

## Cómo ponerla en línea (GitHub Pages, gratis)

La cámara y la instalación en el celular exigen una dirección segura (https). Pasos:

1. Cree una cuenta en https://github.com y un repositorio nuevo (público), por ejemplo `insumos-piloto`.
2. Suba **el contenido** de esta carpeta (no la carpeta misma): `index.html`, `sw.js`, `manifest.webmanifest`, y las carpetas `js`, `css`, `icons`. Puede usar el botón *Add file → Upload files*.
3. En el repositorio vaya a *Settings → Pages*. En *Branch* elija `main` y la carpeta `/ (root)`, y guarde.
4. En uno o dos minutos la app queda en `https://SU-USUARIO.github.io/insumos-piloto/`.
5. Abra esa dirección en el celular con Chrome. En el menú elija *Instalar app* o *Agregar a la pantalla de inicio*.

Antes de subirla al hospital, consulte con la jefatura y con TI si pueden alojarla en un servidor propio (basta cualquier hosting de archivos estáticos con https).

**Si cambia algún archivo**, suba la versión nueva y cambie `VERSION` en `sw.js` (por ejemplo a `inv-piloto-v2`) para que los celulares descarguen la actualización.

## Uso diario

1. Cada persona abre *Datos*, escribe su nombre y queda listo.
2. En *Inicio*, toque cada insumo y cargue su ubicación (MACROZONA-SECCIÓN-ESTANTERÍA-NIVEL-POSICIÓN), el saldo inicial y los parámetros (mínimo, máximo, consumo diario). Esto lo hace una persona; luego se comparte con los demás importando su .json.
3. Registre cada movimiento en *Registrar*, los conteos en *Conteo* y los tiempos en *Tiempos*.
4. **Al terminar el turno**, en *Datos*, *Exportar registros (.json)* y entregue el archivo a quien consolida.
5. Quien consolida usa *Importar y actualizar* con los archivos de todos y verá el saldo, el KPI1 y el KPI3 del equipo. Luego exporta los .csv para Excel.

## Límites que conviene conocer

- **No hay saldos compartidos en tiempo real.** Cada celular ve lo suyo más lo que importó. Para ver lo mismo en todos hace falta un servidor (por ejemplo Supabase o Firebase) y la autorización de TI.
- **No hay inicio de sesión ni contraseñas.** El nombre es una declaración; sirve para trazabilidad, no para seguridad. Si se exige control de acceso, hay que agregar un servidor con autenticación.
- **Si se borran los datos del navegador, se pierden los registros no exportados.** Por eso la app avisa si pasan 24 horas sin exportar.
- **No se conecta al sistema de inventario del hospital** (funciona solo en red interna). Es una planilla de control paralela, como la del piloto.
- El escáner de la cámara no funciona en iPhone (Safari no ofrece BarcodeDetector); allí se digita el código.

## Desarrollo

Sin dependencias ni paso de compilación. Los archivos son JavaScript, HTML y CSS planos.

```
js/core.js       lógica pura: saldos, lotes, FEFO, KPI, validación, fusión, CSV
js/code128.js    generador de códigos de barras Code 128
js/store.js      guardado local (IndexedDB, con respaldo en localStorage)
js/scanner.js    lectura con la cámara
js/app.js        interfaz
js/catalogo.js   los 20 insumos del piloto
```

Pruebas (requieren Node.js 18 o superior):

```
node tests/core.test.js
node tests/ui-smoke.js
```

Para cambiar los insumos, edite `js/catalogo.js` (código, descripción y minutos de búsqueda de antes) y suba la versión de `sw.js`.
