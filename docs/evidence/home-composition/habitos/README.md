# Hábitos en Inicio

Comparación con el candidato revisado del PR #90, `8bb158d46a703f321dddbb2aac608477c355cc96`. Las capturas usan el mismo día, las mismas comidas y los mismos valores sintéticos en las dos versiones.

## Composición

| Viewport y escenario | Ancho útil | Altura anterior → actual, con título | Distribución actual | Capturas |
| --- | ---: | ---: | --- | --- |
| 320 px · vacío | 288 px | 345 → 223 px | Tres filas | [Antes](before/320-light-cero.jpg) · [Después](after/320-light-cero.jpg) |
| 375 px · cinco registros | 343 px | 290 → 167 px | Tres columnas | [Antes](before/375-dark-varios.jpg) · [Después](after/375-dark-varios.jpg) |
| 1280 px · cinco registros | 402 px | 290 → 167 px | Tres columnas | [Antes](before/1280-light-varios.jpg) · [Después](after/1280-light-varios.jpg) |
| 1440 px · una comida | 470 px | 290 → 167 px | Tres columnas | [Antes](before/1440-dark-uno.jpg) · [Después](after/1440-dark-uno.jpg) |

Los botones de ajuste miden al menos 44 × 44 px y dejan 6 px entre restar y sumar. A 1280 px se midió el espacio real que queda a la izquierda de Registros. El skeleton usa el mismo umbral de ancho que la banda de lectura. Cuando se necesita más espacio, los controles se redistribuyen para conservar los pares y la edición directa. El peso ausente ofrece «Registrar peso» y el registrado, «Editar». [Texto al 200 % antes](before/375-light-largos-200.jpg) · [Texto al 200 % después](after/375-light-largos-200.jpg)

## Feedback de Agua y Pasos

La región de estado permanece junto al encabezado. Al modificar una cantidad muestra «Guardando…». El controlador registra la hora y el identificador de la confirmación que deja el día sin ajustes pendientes. El aviso «✓ Guardado» vence 3.000 ms después de esa hora. La vigencia se conserva al navegar y el foco permanece en el control utilizado. Un error o conflicto mantiene el borrador y la acción para recuperarlo.

En el recorrido grabado, el navegador retiró el aviso 3.017 ms después del acuse. El texto estuvo visible 2.912 ms desde la actualización observada del DOM. La altura de la banda y la posición de los controles tuvieron una variación de 0 px. [Video de guardado](after/guardado.webm) · [Secuencia medida](after/guardado.json)

## Validaciones

| Caso | Prueba y resultado |
| --- | --- |
| Cero, uno y cinco registros | 24 combinaciones por versión en 320, 375, 1280 y 1440 px, en claro y oscuro. Con cinco entradas se ven cuatro y el botón de expansión. [Medidas anteriores](before/mediciones.json) · [Medidas actuales](after/mediciones.json) |
| Cifras largas y edición | Se probó la lectura y edición de 1.234.567 ml y 12.345.678 pasos con texto al 100 % y al 200 %, en los cuatro anchos y ambos temas. Las 32 ediciones conservaron todos los dígitos. A 320 px con texto al 200 %, los ocho dígitos de Pasos ocuparon 224 de los 228 px disponibles después de reservar 16 px para el selector numérico. |
| Confirmaciones sucesivas y recuperación | El recorrido retuvo una escritura pendiente al vencer el aviso anterior, dio plazo propio a la siguiente confirmación y conservó las acciones de reintento y revisión de conflicto. Cambiar de día y volver a Inicio respetó la fecha original de vencimiento. Los tests de componente verifican además el límite exacto con reloj controlado y el aislamiento por cuenta. |
| Regresión del resto de Inicio | 72 combinaciones sobre el candidato con seis estados y ambos temas. Doce comprobaciones de carga y doce de texto al 200 %, foco, contraste y geometría. «Ver registro» volvió a enfocar la sexta entrada entre dos comidas homónimas. Al ajustar el agua, la lista siguió expandida. El editor conservó fecha, foto, foco y error recuperable al cruzar 768 px y cambiar el tema del sistema. |

Pasaron 126 pruebas focalizadas de hábitos, diario, navegación entre vistas, skeleton y estilos. La prueba del temporizador comprobó el aviso a los 2.999 ms y su retirada al llegar a los 3.000 ms.

La evidencia funcional proviene de Chrome de escritorio con tamaños de pantalla simulados y servicios locales. El texto al 200 % se simuló duplicando el tamaño computado con viewport fijo. La CI Linux, el enlace a la Preview y el identificador disponible en Perfil figuran en el [PR #90](https://github.com/MateoLitrenta/calori-tracker/pull/90). Queda pendiente la revisión en un teléfono físico.

## Reproducción

Iniciar una instancia por versión desde la raíz del repositorio. La base se extrae de Git y el servidor escucha en localhost.

```sh
node scripts/home-mobile/serve-qa.mjs --compact-habits --before --port=5193
node scripts/home-mobile/serve-qa.mjs --compact-habits --port=5194
```

Con Playwright y su FFmpeg disponibles, ejecutar en secuencia.

```sh
node scripts/fitness-global/compact-habits.mjs --before
node scripts/fitness-global/compact-habits.mjs
```
