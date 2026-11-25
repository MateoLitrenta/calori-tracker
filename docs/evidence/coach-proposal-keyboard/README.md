# Coach: teclado al editar una propuesta

Fecha: 25 de noviembre de 2026. Base: `c74bbe2656d041e2d82469b9a9163243f9b5895d`, merge del PR #96.

## Problema observado

El video de revisión muestra la edición de un registro propuesto dentro del chat. Entre aproximadamente 2,8 y 3,8 segundos, el teclado numérico abre y la barra Inicio/Coach/Datos/Perfil permanece encima de él. Los campos del editor quedan fuera del área de lectura y se ven las acciones de la propuesta. Cerca de los 7 segundos se repite con teclado alfabético. Cerrar el teclado recupera el formulario.

El video no muestra un código de versión verificable. La reproducción se relaciona con el código de la base indicada por inspección y por las regresiones del lector. No se publica el video ni imágenes de la cuenta personal.

## Causa y alcance del cambio

1. `followCoachViewport` solo reconocía el textarea del compositor. El editor de la propuesta usa inputs, select y textarea propios; el compositor está deshabilitado mientras hay una propuesta pendiente.
2. El `ResizeObserver` del lector seguía el final cuando la persona estaba cerca de él. Al reducirse la altura, podía desplazar el campo activo por encima del lector.

El candidato reconoce los campos editables de la propuesta, conserva el origen del teclado durante el cambio de foco a una acción y elimina la reserva de navegación con el mismo mecanismo ya utilizado por el compositor. Mientras se escribe en una propuesta, la observación y el compositor deshabilitado dejan de ocupar espacio; siguen montados y vuelven al recuperar altura.

El campo activo tiene prioridad sobre el seguimiento del último mensaje. Solo se desplaza el lector, no la página completa. Los textareas se limitan al espacio disponible y conservan su desplazamiento interno nativo. Un `pointerdown` táctil sobre las acciones evita que el blur mueva el botón antes del clic; la confirmación/cancelación siguen ejecutándose exclusivamente mediante el clic.

No se modifica el formulario independiente de Inicio, el protocolo de guardado, la estimación de IA ni el día del registro.

## Validación disponible

Ejecutado localmente:

```bash
node --test tests/coach-viewport.test.mjs tests/coach-store-sync.test.mjs tests/chat-view.test.mjs tests/coach-proactive-flow.test.mjs
npm run lint
npm run build
git diff --check
```

Resultado: **67/67 pruebas focalizadas**, sin omisiones. TypeScript, build y diff aprobados. Lint: cero errores y las diez advertencias de la base. Vite conserva el aviso del bundle principal mayor de 500 kB.

La primera CI sobre `124a0472` encontró una importación sin extensión que impedía cargar dos archivos de pruebas mediante Node ESM. Se explicitó `.ts` en la importación del helper y se completó `ownerDocument.activeElement` en el lector simulado de la prueba de anclaje. Se mantienen todas sus aserciones. Los cuatro archivos afectados ahora ejecutan sus 67 casos en local; la regresión completa debe aprobar sobre el HEAD actualizado del PR.

| Cobertura | Resultado de la prueba |
| --- | --- |
| Apertura directa en Nombre, Calorías, Hora, Tipo y Detalles | Se reconoce el teclado con el compositor deshabilitado; el foco solo no oculta la navegación. |
| Barras del navegador, zoom, puntero fino y controles no editables | No se interpretan como apertura de teclado en una propuesta. |
| Cierre y reapertura manteniendo foco | Se retira y restablece el estado del teclado y su origen. |
| Rotación y cruce 767/768 px | La detección conserva el teclado hasta recuperar altura. Geometría simulada. |
| Propuesta real React → Editar → Calorías | La reducción del lector conserva campo, etiqueta, valor y foco. Dos clics inmediatos en Confirmar escriben una sola comida con 725 kcal y la fecha/cuenta correctas. |
| Propuesta real React → Editar → Detalles | Conserva texto multilínea y posición de selección; Cancelar retira la propuesta sin escribir registros. |
| Seguimiento del lector | La visibilidad se comprueba inmediatamente en el callback de ResizeObserver, antes del RAF posterior. La página exterior conserva su desplazamiento. |
| Lectura de conversaciones existentes | La regresión de seguimiento del final y conservación de lectura en escritorio sigue pasando. |

Estas pruebas usan JSDOM y geometría explícita; no renderizan Safari ni un teclado nativo. El navegador conectado no estaba disponible y el navegador remoto no pudo abrir el servidor local. **No hay una matriz visual nueva ni capturas de navegador aprobadas en esta entrega.** La CI del PR verifica el commit publicado; su resultado y enlace se entregan junto con la Preview.

## Aceptación en Safari de iPhone — pendiente

1. Verificar en Perfil el código de la nueva Preview indicado en el PR.
2. En Coach, pedir una propuesta de comida y tocar Editar con el teclado cerrado. Abrir Calorías directamente, modificar el número y pasar a Nombre/Detalles usando las flechas del teclado.
3. Escribir varias líneas en Detalles, mover el cursor a una línea intermedia, cerrar y reabrir el teclado sin abandonar la propuesta.
4. Repetir con una propuesta de ejercicio: Duración, Calorías, Distancia y Detalles. Probar también Hora y el selector Tipo en comida.
5. Desplazar el formulario hasta Confirmar o Cancelar. La primera pulsación debe funcionar; cancelar no debe guardar y confirmar debe crear un único registro con los valores editados.
6. Girar con el teclado abierto, volver a vertical y cerrarlo con el campo aún enfocado.

**Criterios:** la navegación inferior no ocupa el área del teclado; el campo y la línea que se edita permanecen visibles; el borrador y el cursor se conservan; las acciones son alcanzables mediante el desplazamiento del lector y actúan al primer toque; al cerrar el teclado reaparece la navegación. Una propuesta requiere confirmar para guardar.

La aceptación física, las barras reales de Safari y la geometría del cursor multilínea no quedan certificadas por las pruebas sintéticas. Si el servicio de IA de Preview no está habilitado, no puede darse por probado este recorrido completo hasta disponer de una propuesta real.
