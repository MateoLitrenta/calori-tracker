# Datos e Historial · Etapa 3

Base de comparación `5a6048c346ce4052a9b1df02078177f36e06551c` (PR #93). Chrome 158 en Windows, fecha sintética 13/11/2026, mismos registros, escala y tema en cada par. Las rutas de autenticación, datos e IA se sustituyeron por fixtures locales. La CI y la Preview del commit revisable están enlazadas en el PR.

## Mediciones

Píxeles CSS, redondeados. Valores antes → después. La posición de las barras se mide desde el inicio del encabezado Datos en Semana. La distancia del detalle se mide desde el borde inferior de la grilla mensual hasta el borde superior del detalle del día 12. El año se mide desde la primera hasta la última fila de tarjetas. Claro y Oscuro dieron las mismas medidas.

| Ancho | Altura del resumen de Datos | Inicio de las barras | Calendario → detalle | Altura de los doce meses | Aumento de altura por hover |
| --- | ---: | ---: | ---: | ---: | ---: |
| 320 px | 494 → 259 | 791 → 556 | 353 → 107 | 827 → 513 | 244 → 0 |
| 375 px | 405 → 259 | 703 → 556 | 268 → 63 | 792 → 494 | 212 → 0 |
| 768 px | 387 → 241 | 602 → 456 | 226 → 63 | 792 → 494 | 190 → 0 |
| 1440 px | 266 → 185 | 495 → 414 | En paralelo en ambas versiones | 544 → 327 | 136 → 0 |

[Mediciones de base](antes/mediciones.json) · [Mediciones del candidato](despues/mediciones.json). A 768 px la barra lateral deja al Historial con el ancho de una columna. A 1440 px el detalle ocupa la columna contigua.

## Comparativas visuales

| Escena | Antes | Después |
| --- | --- | --- |
| Datos, móvil | [375 claro](antes/375-light-datos.jpg) · [375 oscuro](antes/375-dark-datos.jpg) | [375 claro](despues/375-light-datos.jpg) · [375 oscuro](despues/375-dark-datos.jpg) |
| Elegir un día y leerlo | [Calendario](antes/375-dark-calendario.jpg) · [Detalle](antes/375-dark-detalle.jpg) | [Calendario](despues/375-dark-calendario.jpg) · [Detalle](despues/375-dark-detalle.jpg) |
| Doce meses, móvil | [Claro](antes/375-light-año.jpg) · [Oscuro](antes/375-dark-año.jpg) | [Claro](despues/375-light-año.jpg) · [Oscuro](despues/375-dark-año.jpg) |
| Historial a 320 y 768 px | [320](antes/320-light-calendario.jpg) · [768](antes/768-light-calendario.jpg) | [320](despues/320-light-calendario.jpg) · [768](despues/768-light-calendario.jpg) |
| Datos e Historial a 1440 px | [Datos claro](antes/1440-light-datos.jpg) · [Calendario oscuro](antes/1440-dark-calendario.jpg) · [Año](antes/1440-light-año.jpg) | [Datos claro](despues/1440-light-datos.jpg) · [Calendario oscuro](despues/1440-dark-calendario.jpg) · [Año](despues/1440-light-año.jpg) |

[Recorrido antes](antes/recorrido.webm) · [Recorrido después](despues/recorrido.webm). El video a 375 px recorre las barras con el puntero, abre y cierra la selección, usa Tab, Espacio, Escape y Enter, desliza el año y elige un mes por toque emulado. Luego muestra la selección de fechas en Historial y el acceso al detalle.

## Comportamientos comprobados

- **Promedios.** Balance y Consumidas usan días con comidas. Gasto estimado usa días con comidas, pasos o ejercicio. Si comparten muestra, la cobertura aparece una sola vez. Con bases distintas, cada valor conserva la suya. La explicación y los límites están en «Cómo se calculan».
- **Selección del gráfico.** El puntero destaca la barra. El foco de teclado permite leer su nombre con fechas o cantidades. El detalle se abre al activar el botón y conserva las tres métricas al cambiar de barra. En la muestra a 320 px midió 244 px en los cuatro días probados, incluidos actividad sin comidas y fecha futura. El cierre devuelve el foco a la barra mediante `focus({preventScroll: true})`. Cambiar el período limpia la selección.
- **Año de Datos.** El gesto horizontal emulado movió el carril 105 px y mantuvo el detalle cerrado. Un toque posterior seleccionó el mes. La regresión anual también comprueba que al pasar por escritorio se recupera el desplazamiento elegido por el usuario (29 → 29 px en ambos temas). El selector pasó de 200 ms a 0 ms con movimiento reducido. [Resultados del recorrido anual](despues/data-interactions.json).
- **Detalle diario.** Una única región sigue al calendario en el orden de lectura. Se verificaron día con comidas, saldo cero, día con pasos sin comidas y día vacío. Las flechas conservaron el día editable y la activación del día por teclado conservó el scroll. El acceso explícito al detalle le dio foco. El paso de móvil a escritorio y el cambio de tema preservaron el nodo enfocado y la fecha. «Ver registro» tras guardar una comida sintética enfocó la fila de esa comida.
- **Doce meses.** Marzo muestra equilibrio de 0 kcal/día, julio actividad parcial, noviembre un promedio provisional y diciembre su estado futuro. La cobertura y los deportes se pueden consultar entrando al mes. El nombre accesible de cada botón conserva el contexto. La selección del mes y el mes en curso tienen marcas diferentes.
- **Texto al 200 %.** En 320 px se duplicó el tamaño computado del texto, incluidos los tamaños en píxeles. Se comprobó el reflujo de Datos e Historial sin desbordamiento horizontal de página. [Datos claro](despues/320-light-datos-200.jpg) · [Datos oscuro](despues/320-dark-datos-200.jpg) · [Historial claro](despues/320-light-año-200.jpg) · [Historial oscuro](despues/320-dark-año-200.jpg).

El gesto táctil se generó en Chromium. Quedan pendientes la comprobación en teléfono físico, Safari iOS con gestos nativos y lector de pantalla.

## Reproducir

1. Iniciar `node scripts/home-mobile/serve-qa.mjs --history-data --data-november --before --port=5193` para la base y `node scripts/home-mobile/serve-qa.mjs --history-data --data-november` para el candidato.
2. Usar Playwright, Chrome y el ffmpeg de QA. Si están instalados fuera de la ruta predeterminada, configurar `PLAYWRIGHT_MODULE` y `PLAYWRIGHT_BROWSERS_PATH`.
3. Ejecutar `node scripts/fitness-global/data-november.mjs --before`, luego el mismo script sin argumentos y después con `--ampliado`. La comprobación de navegación anual y movimiento se ejecuta con `node scripts/fitness-global/data-review.mjs --interactions --noviembre`.
