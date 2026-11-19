# Inicio y títulos de pantalla

Comparativa contra `51f7daa2d248c186c4a3d1c8700cf6bd13997eae`, el merge del PR #85. En ambas versiones se montan las vistas de la aplicación con la misma cuenta sintética, fecha, comidas y ejercicios. Cada par mantiene el ancho y el tema.

| Cambio | Referencia | Comprobación del candidato |
| --- | --- | --- |
| Carga de Inicio | Una tarjeta genérica precedía al encabezado y la navegación. | Con sesión identificada y perfil pendiente se muestran el encabezado, la navegación y las reservas de fecha/semana, balance, acciones, hábitos y registros. El encabezado sigue montado al resolver la carga. |
| Títulos | A 375 px, Inicio usaba letra de sistema a 23 px, Coach a 29 px y Datos y Perfil a 36 px. En escritorio Inicio tenía la marca en el lateral. | Las cuatro vistas usan Barlow Condensed itálica, peso 700, interlineado 1 y mayúsculas. El título de Inicio también aparece en el área principal de escritorio. El lateral mantiene su marca de navegación. |
| Registros e Historial | El borde inferior de la última fila se sumaba al superior de Historial. Con cero registros quedaba la línea del listado vacío. | Historial conserva el separador del límite. Las filas usan divisiones interiores de 1 px y el listado vacío deja visible el mensaje de ausencia de registros. |

**[Cuatro títulos en Claro y Oscuro](titulos-375.jpg)** · **[Carga frente a contenido](carga-375.jpg)** · **[Separador antes y después](separador-375.jpg)** · **[Grabación en navegador](after/recorrido.webm)**

## Alcance del navegador

Chrome de escritorio, zona America/Buenos_Aires y configuración regional es-AR. Se compararon 320 × 568, 375 × 812 y 1440 × 900 en Claro y Oscuro. Las carpetas [antes](before) y [después](after) contienen capturas de cada pantalla y la carga para los seis casos.

- El arnés detiene la resolución del perfil durante al menos 1,8 segundos. La grabación conserva esa pantalla durante 2,2 segundos y recorre Inicio, Coach, Datos, Perfil e Inicio. La espera pertenece al arnés. El vídeo dura 12,72 s. Chrome reprodujo sus 318 cuadros a 374 × 812, por el redondeo a píxeles pares del codificador sobre el viewport de 375 px.
- En la transición, el encabezado y la navegación mantienen sus rectángulos. Para esta fixture, el mayor desplazamiento vertical entre las cinco regiones de carga y su contenido fue de 2 px a 320, 4 px a 375 y 0 px a 1440. La cantidad y longitud de los registros varían por cuenta.
- Se comparó el estilo calculado de los cuatro títulos. Se probaron «Ver registros», los tres controles del encabezado de Coach y el selector de período de Datos. El título queda como único encabezado de nivel uno visible en cada vista cargada.
- Se verificaron cero, uno y tres registros con mediciones de bordes. En móvil se alternó Historial abierto y cerrado, y en escritorio se conservó su presentación siempre abierta. Las capturas del límite están recortadas con el mismo encuadre relativo.
- Las mediciones están en la [matriz de referencia](before/matriz.json) y la [matriz candidata](after/matriz.json). El navegador bloquea el tráfico externo. Los contadores de escrituras y consultas de IA se mantuvieron en cero.

La Preview y la CI se verifican por SHA en el PR. La evidencia interactiva proviene del arnés local. Queda pendiente observar el arranque en un teléfono físico, especialmente con Safari/iOS, barras del navegador y área segura reales.

## Repetir

Usar Node 24, las dependencias de `npm ci`, Chrome y Playwright 1.56.1. El arnés busca Playwright en `../qa-tools/node_modules` o en `PLAYWRIGHT_MODULE`. Instalar el codificador con `playwright install ffmpeg` desde ese entorno. Si se usa `PLAYWRIGHT_BROWSERS_PATH`, mantener el mismo valor durante la grabación.

1. Iniciar `node scripts/home-mobile/serve-qa.mjs --visual --before`. En otra terminal ejecutar `node scripts/fitness-global/visual-consistency.mjs --reference`. Cerrar el servidor.
2. Iniciar `node scripts/home-mobile/serve-qa.mjs --visual`. Ejecutar `node scripts/fitness-global/visual-consistency.mjs` y cerrar el servidor.
3. Ejecutar `node scripts/fitness-global/visual-comparisons.mjs` para componer las láminas a partir de las capturas y verificar la reproducción del vídeo.
