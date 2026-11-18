# Campo Hora · ajuste del PR #83

Referencia `adb2a25`, misma cuenta y fecha sintéticas en las dos pasadas. Se usó Chromium en Windows con un control nativo de 12 horas en configuración de prueba `en-US`. El valor fijo `19:54` se presenta como `07:54 PM`. Medimos el texto y el icono del selector en el árbol interno de Chromium mediante CDP. La reserva para `a. m.` y `p. m.` usa el ancho de esos caracteres con la fuente del campo. La revisión original de Chrome Mac observó el recorte con el sufijo en español. Esa plataforma y el selector táctil de iOS quedan pendientes de comprobación.

| Hallazgo | Cambio | Prueba y resultado |
| --- | --- | --- |
| UX-06 · En el alta y edición de comida a 375 px, el editor nativo asignaba 65,6 px a un texto de 71,7 px. | El campo compartido reserva más ancho para hora, minutos y sufijo. «Ahora» baja una línea cuando el campo y el botón juntos superan el ancho de la fila. | El ancho del input sube de 122,4 a 186,9 px en ambos formularios de comida a 375 px. El texto nativo entra y quedan 47,2 px al considerar el sufijo en español. |
| UX-06 · En edición, «Ahora» podía entregar un valor localizado que el input dejaba vacío. | Las ediciones usan la misma representación `HH:mm` de las altas. El control nativo decide cómo mostrarla. | El navegador y la prueba focalizada verifican «Ahora» en los cuatro formularios, incluso al simular una representación localizada de 12 horas. |
| UX-05 · La fila de hora comparte formulario con notas y acciones. | Se conserva el área desplazable de los campos y el pie fijo del formulario. | 24 casos de referencia y 24 del candidato. Tres anchos (320, 375, 1440), Claro/Oscuro y cuatro formularios con notas llenas. Guardar visible y selector nativo disponible en todos los casos del candidato. |

| Vista | Antes | Después |
| --- | --- | --- |
| Alta comida · 375 px oscuro | [Captura](before/375-dark-add-meal.jpg) | [Captura](after/375-dark-add-meal.jpg) |
| Edición comida · 375 px oscuro | [Captura](before/375-dark-edit-meal.jpg) | [Captura](after/375-dark-edit-meal.jpg) |
| Alta ejercicio · 375 px oscuro | [Captura](before/375-dark-add-workout.jpg) | [Captura](after/375-dark-add-workout.jpg) |
| Edición ejercicio · 375 px oscuro | [Captura](before/375-dark-edit-workout.jpg) | [Captura](after/375-dark-edit-workout.jpg) |
| Alta comida · 320 px claro | [Captura](before/320-light-add-meal.jpg) | [Captura](after/320-light-add-meal.jpg) |
| Alta comida · 1440 px oscuro | [Captura](before/1440-dark-add-meal.jpg) | [Captura](after/1440-dark-add-meal.jpg) |

[Mediciones de referencia](before/results.json) y [mediciones del candidato](after/results.json). Con el servidor sintético local `node scripts/home-mobile/serve-qa.mjs --stage2`, ejecutar `node scripts/ux-stage2/time-layout.mjs`. La opción `--before` comprueba la reproducción cuando el servidor monta los componentes de la referencia `adb2a25`. No usarla con la referencia original de la etapa 2.
