# Ajustes de iPhone del 25 de noviembre · Coach y registros

Referencia `e76a468eb3f02a4ca30dfa4f92329df090088c19` (PR #95). Las comparativas usan perfiles y registros sintéticos. En Registros, la fecha es el 25/11/2026, el reloj comienza a las 10:10 de Buenos Aires y la estimación simulada devuelve 450 kcal. Coach se comprueba con la fixture de conversación local y un viewport táctil simulado. Ambos recorridos usan los mismos datos en sus comparativas.

## Matriz de revisión

| Hallazgo | Comportamiento del candidato | Comprobación |
| --- | --- | --- |
| La barra ocupa espacio sobre el teclado de Coach | Se oculta y libera su reserva durante la reducción táctil del viewport con el compositor activo. La recuperación del viewport restaura la barra, incluso al cerrar el teclado sin perder el foco. | Escritura multilínea, cierre y reapertura, primer toque en Enviar y respuesta mientras se lee más arriba. Comparar foco sin teclado, barras de navegador, zoom y cambio de ancho. [Antes](antes/coach-375-dark-teclado.jpg) · [Después](despues/coach-375-dark-teclado.jpg) |
| Una alta a las 10:10 muestra Almuerzo | A las 10:10 sugiere Desayuno. La sugerencia acompaña la hora durante el borrador hasta una selección manual. La edición conserva la categoría y Ahora respeta el día de registro. | Casos focalizados en los límites de las cinco franjas, hora vacía, cambios manuales, fallo de guardado, edición y fecha pasada. [Antes](antes/375-dark-alta-1010.jpg) · [Después](despues/375-dark-alta-1010.jpg) |
| El pie del detalle aparece negro en Claro | Superficie, borde y botones usan los colores del tema. | Comida y ejercicio desde Inicio directo y tras Inicio → Coach → Inicio. Se mide el color computado del pie y el contraste de las acciones bajo Claro, Oscuro y Sistema. [Comida antes](antes/375-light-inicio-directo-comida.jpg) · [Comida después](despues/375-light-inicio-directo-comida.jpg) · [Ejercicio antes](antes/375-light-vuelta-coach-ejercicio.jpg) · [Ejercicio después](despues/375-light-vuelta-coach-ejercicio.jpg) |
| Eliminar actúa de inmediato y su aviso tapa el próximo detalle | Confirmación con nombre, fecha y foco inicial en Cancelar. El fallo conserva el registro y permite reintentar. Tras el éxito, el aviso vive en la lista y el foco vuelve a Registros del día. | Cancelación, error, éxito, doble clic, foco y siguiente detalle en builds compilados. Las pruebas de componente cubren también fecha, cuenta, tipo e ID, datos concurrentes y desaparición del registro. [Antes](antes/375-light-borrado-detalle-siguiente.jpg) · [Confirmación](despues/375-light-confirmar-eliminacion.jpg) · [Error y reintento](despues/375-light-fallo-eliminacion.jpg) · [Siguiente detalle](despues/375-light-borrado-detalle-siguiente.jpg) |
| Reclasificar genera una alerta sobre los datos y cambia la procedencia | El resumen conserva el valor principal y explica que se usan las kcal de la categoría enviada. El recibo identifica esa categoría. | Estimación de Almuerzo, cambio exclusivo a Desayuno, 450 kcal y una sola petición explícita. Pruebas focalizadas cubren además el cambio de categoría, kcal, descripción, foto, sesión de edición, día y cuenta durante la espera. [Antes](antes/375-dark-reclasificacion.jpg) · [Después](despues/375-dark-reclasificacion.jpg) · [Recibo](despues/375-dark-recibo-reclasificacion.jpg) |

La política usa la hora local del registro. Snack de 00:00 a 04:59, Desayuno de 05:00 a 11:59, Almuerzo de 12:00 a 15:59, Merienda de 16:00 a 19:59 y Cena de 20:00 a 23:59. La etiqueta del recibo describe esa estimación durante el guardado de la comida.

## Reproducción del detalle compilado, alta y eliminación

Ejecutar `npm ci` y `npm run build` en un checkout de referencia y en el candidato. Servir la referencia en 5203 y el candidato en 5204 con `npm run preview -- --host 127.0.0.1 --strictPort --port NÚMERO`. Usar Chrome con Playwright instalado en `../qa-tools/node_modules/playwright/index.mjs` o indicar la ruta con `PLAYWRIGHT_MODULE`.

```sh
node scripts/fitness-global/iphone-records-compiled.mjs --before
node scripts/fitness-global/iphone-records-compiled.mjs
```

El recorrido mide el detalle a 320, 375 y 1440 px, en Claro y Oscuro. Incluye Sistema con el diálogo abierto, texto al 200 % a 320 px y movimiento reducido. El mismo script verifica los estilos del despliegue al indicar `CALORI_PREVIEW_URL` con la Preview exacta y pasar `--details-only`. Solo se solicitan recursos estáticos de ese origen. Autenticación, lectura de registros, escritura y estimación se simulan en el navegador, sin peticiones a Supabase ni Gemini.

El build de referencia mostró `#191c1f` detrás de las acciones en Claro. En el candidato, los fondos computados son `#fffefa` en Claro y `#1a211f` en Oscuro. El contraste mínimo medido para Editar y Eliminar fue de 12,64:1 y 6,11:1, respectivamente. A 320 px con texto al 200 %, ambas acciones pasaron a filas independientes sin desbordamiento horizontal.

En la prueba de concurrencia del ejercicio, el primer intento recibió un conflicto porque otra escritura aumentó el agua a 2200 ml. Tras publicar los datos más recientes, el reintento eliminó el ejercicio y conservó el agua y la comida.

[Mediciones de referencia](antes/registros-compilado.json) · [Mediciones del candidato](despues/registros-compilado.json)

## Reproducción de Coach

```sh
node scripts/home-mobile/serve-qa.mjs --history-data --iphone-noviembre --before --port=5193
node scripts/home-mobile/serve-qa.mjs --history-data --iphone-noviembre --port=5194
```

Con los servidores listos, ejecutar los recorridos de Coach. Para WebKit, instalar el navegador de Playwright o indicar su ubicación con `PLAYWRIGHT_BROWSERS_PATH`.

```sh
node scripts/fitness-global/coach-iphone-keyboard.mjs --before
node scripts/fitness-global/coach-iphone-keyboard.mjs
node scripts/fitness-global/coach-iphone-keyboard.mjs --webkit
```

En Chrome, a 375 px la conversación pasó de 160 a 224 px visibles con teclado simulado. A 320 px pasó de 20 a 71 px y Enviar quedó dentro del viewport. Los cuatro recorridos móviles del candidato mantuvieron la posición de lectura de 240 px al llegar la respuesta y registraron una sola petición simulada por toque. WebKit repitió los cuatro casos móviles después de ajustar el foco del compositor al tocar Enviar.

[Coach de referencia en Chrome](antes/coach-chromium.json) · [Coach del candidato en Chrome](despues/coach-chromium.json) · [Coach del candidato en WebKit](despues/coach-webkit.json)

## Comprobación en Safari de iPhone

1. Con la Preview del PR, comprobar el código en Perfil. En Coach escribir dos líneas, cerrar y reabrir el teclado, y tocar Enviar una vez en una cuenta de prueba autorizada para IA. Comprobar que la barra deja espacio mientras se escribe y vuelve al cerrar el teclado. Con una conversación larga, subir antes de que llegue la respuesta y observar si se conserva el lugar de lectura.
2. En Inicio, abrir una comida nueva. Cambiar la hora manualmente para cruzar dos franjas, elegir una categoría manual y pulsar Ahora. Repetir en un día pasado y editar un registro con una categoría diferente de la sugerida.
3. En Claro, abrir una comida y un ejercicio desde Inicio y repetir al volver de Coach. Con Sistema seleccionado, cambiar el tema de iOS con el detalle abierto. El pie debe acompañar al resto del diálogo.
4. Con registros sintéticos, cancelar una eliminación y confirmar después. Abrir enseguida otro detalle y comprobar que sus kcal quedan visibles. Para probar el error y reintento, usar el fallo simulado del recorrido automatizado.
5. Con una estimación autorizada o simulada, cambiar solo la categoría y comprobar que el resumen y el recibo conservan la cifra y su procedencia. Probar también editar la descripción y las kcal antes de guardar.

La emulación comprueba la geometría reportada al código y la interacción de los controles. El teclado, las barras de Safari, la rotación nativa y el primer toque con el teclado nativo en pantalla quedan para la revisión en iPhone.
