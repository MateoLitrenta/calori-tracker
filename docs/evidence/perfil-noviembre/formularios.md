# Formularios diarios · Noviembre

Las comparaciones usan el 13/11/2026 y el mismo perfil sintético en Chrome de Windows. La base es el merge `1fb0e34efd7a82bfd35913a462e77bb5de3f4cab`. El recorrido de escritura consulta y guarda en el día previo (12/11).

| Recorrido | Base | Candidato |
| --- | --- | --- |
| Agregar comida a 375 px | [Antes](antes/diario-375-dark-add-meal.jpg) | [Después](despues/diario-375-dark-add-meal.jpg) |
| Agregar ejercicio a 375 px | [Antes](antes/diario-375-dark-add-workout.jpg) | [Después](despues/diario-375-dark-add-workout.jpg) |
| Editar comida y ejercicio | [Comida](antes/diario-375-light-edit-meal.jpg) · [Ejercicio](antes/diario-375-light-edit-workout.jpg) | [Comida](despues/diario-375-light-edit-meal.jpg) · [Ejercicio](despues/diario-375-light-edit-workout.jpg) |
| Peso diario | [Móvil](antes/diario-375-light-peso.jpg) · [Escritorio](antes/diario-1440-dark-peso.jpg) | [Móvil](despues/diario-375-light-peso.jpg) · [Escritorio](despues/diario-1440-dark-peso.jpg) |

## Comprobaciones

| Comportamiento | Resultado |
| --- | --- |
| Hora y Ahora | 32 escenarios por versión: altas y ediciones de comida y ejercicio a 320, 375, 768 y 1440 px, en Claro y Oscuro. La separación efectiva pasó de 4 a 8 px. Las ediciones conservaron las 08:30 y las 10:00 de las fixtures. El recorrido cambió la hora a 19:54 y después activó Ahora con Enter. |
| Selector nativo | Chrome mostró 07:54 PM. Se midieron los segmentos reales del selector y el icono del reloj en su árbol nativo. El cálculo de espacio para «a. m.» y «p. m.» usa el ancho de esos textos con la misma fuente. Con texto al 200 % a 320 px, Hora y Ahora quedaron en filas sucesivas, el input midió 296 px y la reserva mínima tras descontar el ancho del sufijo español fue de 62,69 px. |
| Campos y pie | Calorías en kcal, duración en minutos, distancia decimal 2,35 km y peso decimal 72,6 kg. A 320 px con texto al 200 % las acciones permanecieron separadas 8 px y en pantalla. El documento y cada formulario conservaron su ancho; también se comprobaron los límites horizontales de los dos controles de hora. |
| Error y reintento | En el día 12 se introdujeron una descripción larga, 482 kcal y la hora manual. El cambio a escritorio y de tema conservó el mismo campo enfocado, el borrador y la hora. Durante la espera de la escritura apareció «Guardando…»; el fallo sintético mantuvo los datos, el reintento guardó una vez y «Ver registro» enfocó su propia fila. |
| Descarte | Cancelar una edición modificada abrió la confirmación. «Seguir editando» recibió foco y conservó la hora; descartar cerró el formulario. |
| Teclado y viewport simulados | WebKit automatizado registró 114 estados a 320, 375 y 1440 px en ambos temas. Cubrió el encabezado y sus botones, posición de la línea activa, actividad, calorías, notas y distancia, peso diario, inercia del fondo, pulsación de «Estimar con IA» con servicio simulado, cierre del teclado y edición desde «Ver registro». |

[Mediciones de base](antes/diario-mediciones.json) · [Mediciones del candidato y colores computados](despues/diario-mediciones.json) · [Escritura y reflujo al 200 %](despues/diario-recorrido.json) · [Geometría en WebKit](despues/diario-webkit.json)

## Contraste de los controles diarios

En estado normal, Guardar usa `#241b14` sobre `#ff9a53` (8,05:1) en ambos temas. Hora midió 15,56:1 en Claro y 14,87:1 en Oscuro. Ahora y Cancelar midieron 13,20:1 y 12,64:1 respectivamente por tema. En hover, Ahora midió 5,91:1 en Claro y 7,56:1 en Oscuro. En las mediciones de foco los cuatro controles mantuvieron el contraste de texto del estado normal. En estado ocupado, Guardar y Cancelar usaron `#505d55` sobre `#ebece4` en Claro (5,81:1) y `#bac4bd` sobre `#262e2b` en Oscuro (7,77:1). En la confirmación modal, «Seguir editando» midió 13,20:1 en Claro y 12,64:1 en Oscuro; «Descartar cambios» midió 6,11:1 y 7,79:1. El JSON incluye los pares por control y estado.

## Reproducción

1. Iniciar las dos instancias de fixtures de la etapa indicadas en el informe general. El puerto 5193 sirve la base congelada y el 5194, el candidato.
2. Ejecutar `node scripts/fitness-global/daily-november.mjs --before` y luego `node scripts/fitness-global/daily-november.mjs`. Para el recorrido de escritura y texto al 200 %, ejecutar `node scripts/fitness-global/daily-november-flow.mjs`.
3. Con WebKit y ffmpeg instalados para Playwright, indicar su directorio en `PLAYWRIGHT_BROWSERS_PATH`. Asignar un directorio temporal a `CALORI_QA_OUTPUT_DIR` y ejecutar `node scripts/fitness-global/safari-forms.mjs --webkit --pan`. El archivo `geometria.json` de esa ejecución se incluye aquí como `diario-webkit.json`.

## Revisión en iPhone

En Safari con formato de doce horas, abrir una comida con fecha de ayer, escribir una descripción de varias líneas y tocar Calorías con el teclado presente. Alternar entre texto y números, abrir Hora, seleccionar una hora manual y después tocar Ahora. Desplegar notas, cerrar el teclado y revisar el día del registro. Repetir en una edición de ejercicio con distancia decimal y comprobar el regreso a la fila al guardar. La barra del navegador, el teclado nativo y la lectura del sufijo en iOS requieren esta comprobación en teléfono físico.
