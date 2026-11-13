# Año — compactación de tarjetas

Baseline: `7c4981a270d0081018d219e4ccb44b3f3372d359`. Fuente final: `99b6af303df8e0496f050442a297930d6e2006f2`; árbol `src` `39e8ea045d2dfe5edc85ace6d64c1cb737a86a78`. Las capturas se iniciaron con `39cbbd73744e74f4d51b49b16a9a56645d636648`; después se enmendó únicamente un escape redundante en una prueba. Se verificó que el árbol `src` seguía idéntico, sin repetir capturas por un cambio sin efecto visual. Se preserva la evidencia anterior de Historial 2.1. Esta comparación se limita a Año y reutiliza los mismos registros sintéticos y la fecha fija 12/11/2026.

## Capturas comparativas

- 320 px: [antes claro](before/year-light-320.png) · [después claro](after/year-light-320.png) · [antes oscuro](before/year-dark-320.png) · [después oscuro](after/year-dark-320.png).
- 375 px: [antes claro](before/year-light-375.png) · [después claro](after/year-light-375.png) · [antes oscuro](before/year-dark-375.png) · [después oscuro](after/year-dark-375.png).
- 393 px: [antes claro](before/year-light-393.png) · [después claro](after/year-light-393.png) · [antes oscuro](before/year-dark-393.png) · [después oscuro](after/year-dark-393.png).
- 430 px: [antes claro](before/year-light-430.png) · [después claro](after/year-light-430.png) · [antes oscuro](before/year-dark-430.png) · [después oscuro](after/year-dark-430.png).
- 1440 px: [antes claro](before/year-light-1440.png) · [después claro](after/year-light-1440.png) · [antes oscuro](before/year-dark-1440.png) · [después oscuro](after/year-dark-1440.png).

## Medidas

- 320 px: tarjetas pobladas 228 → 171 px de promedio (−25.3 %); julio vacío 224 → 62 px.
- 375 px: tarjetas pobladas 279 → 151 px de promedio (−46 %); julio vacío 260 → 62 px.
- 393 px: tarjetas pobladas 270 → 151 px de promedio (−44 %); julio vacío 260 → 62 px.
- 430 px: tarjetas pobladas 244 → 147 px de promedio (−39.9 %); julio vacío 245 → 62 px.
- 1440 px: tarjetas pobladas 177 → 147 px de promedio (−17.2 %); julio vacío 158 → 62 px.

Las cifras son idénticas en ambos temas. «Tarjetas pobladas» es el promedio de las alturas reales de agosto, septiembre, octubre y noviembre. Los valores exactos, alturas individuales, campos visibles y resultado de comprobación de cada tarjeta están en [validation.json](validation.json). Los diagnósticos extensos de los rectángulos de texto permanecen en el harness local.

El ajuste elimina el estiramiento de la tarjeta vacía por los vecinos de su fila. Conserva el orden cronológico por filas: no es una distribución masonry ni elimina todos los espacios debajo de tarjetas más cortas. Las alturas siguen dependiendo del texto y del ancho disponible; no se corta contenido para igualarlas.

## Verificaciones

Las diez combinaciones (320, 375, 393, 430 y 1440 px × claro/oscuro) conservan nombre del mes, categoría o etiqueta provisional, promedio con signo y unidad kcal/día, cobertura de comidas, base energética y resumen deportivo. Agosto conserva +450 y 31/31; septiembre −300 y 30/30; octubre/noviembre conservan el promedio provisional neutral; meses vacíos y futuros conservan sus estados.

No se encontraron fragmentos de texto fuera de los límites de la tarjeta, desbordes horizontales, errores JavaScript ni escrituras. Cada combinación comprobó que tocar septiembre abre Mes con el 12/09/2026 seleccionado y su detalle diario visible. Las tarjetas vacías no heredan la altura de las pobladas; julio y enero conservan la misma altura. Los meses mantienen área de interacción superior a 44 px de alto.

El navegador utiliza React, el store y los helpers reales; Auth, RPC, Storage y Gemini son fixtures locales sintéticos y todo acceso externo está bloqueado. No se probó ni modificó Production. Las medidas e interacciones se toman con el layout original. Para la captura completa del componente se despliegan temporalmente los contenedores de scroll y se oculta la navegación inferior, conservando el ancho medido; esos estilos se retiran después de cada PNG.

Las capturas permiten revisión visual, sin certificar dispositivos físicos o lectores de pantalla. [SHA-256 de los archivos](SHA256SUMS.txt).

## Pruebas focalizadas

[Resultados del gate](quality-results.json): 93/93 aprobadas sobre la fuente final, incluidas diez nuevas combinaciones de contenido y semántica en React/JSDOM. TypeScript de frontend/AI/Coach, lint, build y diff check aprobados; 12 advertencias de lint existentes, cero nuevas. La geometría se comprueba por separado con las diez combinaciones del navegador descritas arriba. La suite Linux de 615 casos y el video originales se conservan como evidencia de la primera entrega, sin repetirlos ni presentarlos como una nueva ejecución de este ajuste.
