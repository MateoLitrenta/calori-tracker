# Regresión funcional del ajuste de Perfil

Los recorridos usan el código y estilos candidatos con una cuenta de prueba sintética. Playwright limita el tráfico al servidor de la fixture. Las respuestas de Coach y la escritura al confirmar una propuesta son simuladas.

## Perfil y accesibilidad

En Chrome y WebKit, a 390 × 844 px, Claro y Oscuro se aplicaron incluso con la preferencia contraria del sistema. Sistema siguió el cambio de Oscuro a Claro en vivo. Al final del scroll se verificó que el centro de cada último control respondiera al hit test y que el panel completo pudiera desplazarse. La prueba de teclado parte del comienzo del scroll y usa Tab desde «Cerrar sesión». El navegador lleva el foco visible a «Gestión de datos» por encima del vidrio.

- **Chrome.** La separación ante la cápsula fue de 18,56 px para «Gestión de datos» plegada y 35,06 px para «Borrar todos los registros» al desplegarla. El foco conservó 18,56 px de separación.
- **WebKit.** Las separaciones correspondientes fueron 19 px y 35 px. El foco conservó 19 px de separación.
- **Áreas seguras emuladas.** Chrome aplicó insets inferior, izquierdo y derecho de 34, 24 y 18 px. El vidrio quedó a 40, 30 y 24 px de esos bordes, respectivamente. El último control abierto siguió visible y alcanzable. El exceso de ancho medido fue 0 px en los dos motores.

[Registro Chrome](gestos-chromium.json) · [Registro WebKit](gestos-webkit.json) · [Contraste y comparativas](visual.md)

## Navegación y Coach

La regresión reutiliza el recorrido horizontal, vertical y diagonal del indicador, clic/toque, cancelación al perder captura o cambiar el marco y cambio de las cuatro secciones. Tab, Enter y Espacio conservan la navegación. Se comprueban el paso entre la cápsula móvil y el lateral de escritorio, el desplazamiento junto a la barra y la transición de 0 s con movimiento reducido. Chromium prueba arrastre táctil emulado. WebKit prueba toque corto emulado y arrastre con mouse.

Coach se comprobó en Claro y Oscuro. El compositor y los campos de edición de propuestas quedaron por encima del teclado simulado. La cápsula y su reserva se retiraron al abrirlo, incluso al girar y cruzar 767/768 px. Se verificaron el borrador, la confirmación, la restauración de lectura y el foco al cerrar formularios. [Coach en Chrome](coach-chromium-funcional.json) · [Coach en WebKit](coach-webkit-funcional.json)

## Reproducción

Iniciá la fixture local y corré los cuatro recorridos en serie. `PLAYWRIGHT_MODULE` indica la ruta del módulo de Playwright. `PLAYWRIGHT_BROWSERS_PATH` indica el directorio de motores instalados.

```sh
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-profile --port=5194
```

```sh
node scripts/fitness-global/liquid-glass-gestures.mjs --glass-profile
node scripts/fitness-global/liquid-glass-gestures.mjs --glass-profile --webkit
node scripts/fitness-global/liquid-glass-coach.mjs --glass-profile
node scripts/fitness-global/liquid-glass-coach.mjs --glass-profile --webkit
```

El arrastre bajo el dedo, las barras dinámicas, las áreas seguras y el teclado de Safari quedan para la revisión en un iPhone físico.
