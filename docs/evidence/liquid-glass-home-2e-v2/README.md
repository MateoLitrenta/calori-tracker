# Inicio 2E · Refinamiento de Tu actividad

La segunda iteración del #110 parte de `bc34cbb574434e418ac03eb0b43d9ca0335910bf`. La comparación de Producción 2D usa el árbol de `fb104d6c30832997e85f5e8fa8b211a0fafb162a` en el entorno sintético. Las tres versiones reciben los mismos registros, reloj, temas y dimensiones. [Primera iteración](../liquid-glass-home-2e/README.md)

## Exploración

[Estudio de las tres direcciones en Claro y Oscuro, con y sin datos](exploracion.png)

- **A · Calendario editorial.** Una hoja y divisiones por semana hacen legibles treinta valores. En vacío queda el ritmo de fechas y guiones. El acento al margen daba poco peso a la selección.
- **B · Controles y selección óptica.** Una lente naranja completa crea un punto de referencia en meses densos y vacíos. Una cápsula reúne cada conjunto de controles. La profundidad funciona mejor cuando se concentra en los elementos interactivos. [Materiales HIG](https://developer.apple.com/design/human-interface-guidelines/materials) · [Estructura y continuidad en WWDC25](https://developer.apple.com/videos/play/wwdc2025/356/)
- **C · Actividad visual.** Una línea corta acompaña a la cifra firmada y permite reconocer el balance de un vistazo. En una muestra vacía, la línea se reserva para días con datos. La escala anual usa marcas cronológicas por fecha registrada, con el recuento existente como texto. [Calendario de Apple](https://support.apple.com/en-ie/guide/iphone/iphfd1054569/ios) · [Marcadores de Garmin Connect](https://support.garmin.com/en-US/?faq=wIAkKS0kMX9W4m2l3Uy5x9) · [Historial de Strava](https://support.strava.com/en-us/articles/15402014-viewing-your-activity-history-on-strava)

Se combinan la hoja de A, los controles de B y las marcas de C. Las fechas futuras se atenúan y conservan su nombre accesible. Las que ya contienen un registro siguen mostrando esa condición. El punto de Hoy y la lente de selección se pueden leer juntos. Semana conserva las marcas de comida y deportes. El azul, el verde o el rojo de una barra de actividad anual podrían confundirse con un balance, por eso la tira usa tinta neutra y coloca las fechas futuras fuera del tramo transcurrido.

El selector existente mantiene su indicador deslizante. Se eligió la activación directa con toque y teclado para preservar el desplazamiento vertical en un control de tres opciones. La cuadrícula cambia con la animación existente y el detalle se actualiza de inmediato para conservar la fecha visible y la posición de lectura. Las transiciones de la lente afectan opacidad y escala. Los controles usan reflejos y bordes locales, sin filtros de desenfoque. [Controles segmentados HIG](https://developer.apple.com/design/human-interface-guidelines/segmented-controls)

## Composición

En móvil, «Tu actividad» es el único encabezado visible y funciona como el control de plegado. En escritorio, la cuadrícula y el resumen quedan a la izquierda del detalle. La fecha, el saldo y los dos valores energéticos se agrupan en el detalle sobre tonos neutros. Los hábitos, registros y la acción «Ver y editar» conservan sus propios niveles de lectura. Las cifras dependen del día consultado y solo la acción explícita cambia el día editable. [Resumen y detalle por fecha en Apple Fitness](https://support.apple.com/en-euro/guide/iphone/iph4c34a8a95/ios)

## Autocrítica y ajustes

En la primera captura con 31 registros, los balances y las fechas competían por la misma intensidad. Bajó el énfasis de las cifras de los días vecinos y se reforzó la lente naranja en Oscuro. En Año, las marcas repetidas de los meses vacíos competían con los meses registrados. Se redujeron a una línea tenue para reservar las marcas diarias visibles a los meses con actividad. También se suavizó la sombra del selector y se quitó una instrucción repetida del encabezado anual. En la muestra escasa de 375 px, la etiqueta de una fecha futura se partía en tres líneas. «Con datos» mantiene la indicación visible y el nombre accesible conserva el tipo de registro.

A 320 px y con texto ampliado, el desplazamiento local conserva blancos de 44 px. Los siete días no quedan simultáneamente a la vista en esas condiciones. El recorrido físico permitirá valorar esa decisión junto con las barras de Safari.

## Revisión personal

1. En la Preview, abrí **Inicio → Tu actividad → Mes**. Compará un mes cargado con uno vacío. Revisá el signo y la línea de balance, el foco y el punto de Hoy.
2. Tocá otra fecha y luego **Hoy**. Probá el plegado en móvil y volvé a abrirlo. La selección y el período se conservan.
3. Pasá de **Semana** a **Año**. Buscá un mes con pocos registros y otro con mucha actividad. Abrí uno y revisá su detalle. El día editable de Inicio cambia al activar **Ver y editar**.
4. Repetí en Claro y Oscuro. En Safari de iPhone físico, comprobá el gesto de desplazamiento a 320 px y la interacción con la cápsula y las barras del navegador.

[Comparativas de la aplicación y validación](navegador.md)
