# Registro móvil de comida

Referencia de código y capturas anteriores: `7dce90cb72119a5c5d6bd560bb2a9710b7d94dd1`, merge del PR #86. El video físico del 18 de noviembre motivó los dos recorridos. Las nuevas imágenes y grabaciones se obtuvieron con una cuenta y comidas sintéticas.

## Qué cambió

| Recorrido | Causa identificada en el código | Cambio y comprobación |
| --- | --- | --- |
| Escribir, 00:15–00:21 del video de referencia | La hoja se posicionaba desde el borde inferior de un fondo fijo, pero calculaba la distancia al teclado con `window.innerHeight`. Si esa altura y la del fondo difieren durante el cambio de teclado, los botones quedan fuera del área visible. | El borde de la hoja sigue `visualViewport.offsetTop + visualViewport.height` en las coordenadas del fondo. La altura disponible limita la hoja. El encabezado y el pie quedan fuera del cuerpo desplazable, que sigue al cursor. La aplicación de fondo permanece inerte. En la simulación a 375 px, el límite visible quedó en y=448 y el pie pasó de y=516 a y=448. |
| Reconocer lo guardado, alrededor de 00:39 | Tras la confirmación del escritor, el formulario cerraba y perdía su referencia de presentación al ID de la comida. El estado «Guardado» de hábitos tampoco identifica comidas. | Inicio muestra nombre, kcal, fecha y la indicación de estimación cuando el formulario puede atribuirle ese valor. «Ver registro» revela la lista, enfoca la fila por ID y la marca durante tres segundos. Desde la fila se abre el detalle y luego la edición. La confirmación se puede cerrar y carece de temporizador. |
| Error y reintento | Un aviso global de error podía superponerse al éxito de un reintento inmediato. | El error se muestra dentro del formulario, con el mensaje del escritor cuando está disponible. El reintento conserva el ID y el borrador. El aviso de éxito aparece únicamente tras la confirmación y con el registro en el día activo. |

## Comparación a 375 × 812, Oscuro

| Momento | Antes | Después |
| --- | --- | --- |
| Descripción extensa y área visible reducida | [Escritura](before/chromium/375-dark-escritura.jpg) | [Escritura](after/chromium/375-dark-escritura.jpg) |
| Escritura rechazada en la fixture | [Error](before/chromium/375-dark-error.jpg) | [Error dentro del formulario](after/chromium/375-dark-error.jpg) |
| Reintento confirmado | [Inicio](before/chromium/375-dark-guardado.jpg) | [Confirmación contextual](after/chromium/375-dark-guardado.jpg) |
| Acceso a la edición | [Edición tras buscar en la lista](before/chromium/375-dark-editar.jpg) | [Fila enfocada](after/chromium/375-dark-fila.jpg) · [Edición](after/chromium/375-dark-editar.jpg) |
| Recorrido en Chrome | [Grabación anterior](before/chromium/recorrido.webm) | [Grabación candidata](after/chromium/recorrido.webm) |

## Cobertura y límites

- Chrome de escritorio con viewport móvil de 320 × 568 y 375 × 812, además de 1440 × 900 en escritorio. Claro y Oscuro, datos equivalentes. [Matriz anterior](before/chromium/matriz.json) · [Matriz candidata](after/chromium/matriz.json).
- WebKit 26.0 automatizado en Windows, en los mismos tamaños y temas. Se probó Comida, Ejercicio y Peso con cambios de altura y desplazamiento. La zona gris en las capturas móviles identifica el espacio excluido por el viewport sintético. Se editaron Descripción, Calorías y el valor nativo de Hora. [Matriz de WebKit](after/webkit/matriz.json).
- Dos comidas llevan el mismo nombre. Se confirmó y reabrió la de **482 kcal** por ID. El error y el reintento usan el mismo ID. En un día anterior se guardó una estimación simulada de **450 kcal**, se abrió su fila y se editó a **511 kcal**. Los cambios de agua y pasos conservaron el scroll. Dos envíos inmediatos generaron una sola escritura. La entrega diferida de un resultado de la cuenta A respetó la pantalla Datos de la cuenta B. [Casos de Chrome](after/chromium/casos.json) · [Casos de WebKit](after/webkit/casos.json).
- El escritor, las cuentas y la estimación se simularon localmente. La prueba automatizada mide el área que informa el navegador. Queda pendiente verificar en Safari de iPhone qué área reporta durante la animación del teclado y de su barra accesoria, el selector horario físico y el comportamiento con las barras reales de Safari.

## Un minuto con el iPhone

1. **0–15 s.** En la Preview, con una cuenta de prueba habilitada, abrí Inicio → + Comida. Escribí una descripción de varias líneas y corregí parte del texto. Mirá si el cursor y «Cancelar / Guardar comida» quedan por encima de las flechas y de la confirmación de iOS.
2. **15–30 s.** Tocá Calorías, escribí **482**, abrí Hora y elegí una hora reconocible. Desplazá el formulario, cerrá y reabrí el teclado. Comprobá que el borrador siga ahí y que al tocar justo debajo de las acciones no se active Inicio.
3. **30–45 s.** Guardá. Leé el nombre, las kcal y la fecha en la confirmación. Si ya tenés una comida sintética con el mismo nombre, usala para distinguir ambas.
4. **45–60 s.** Tocá «Ver registro», abrí la fila resaltada y elegí «Editar». Comprobá las **482 kcal** y la hora. Salí con «Cancelar». Si falla, anotá modelo de iPhone, versión de iOS, teclado utilizado y en qué paso ocurrió.

## Repetir la evidencia

En Node 24, instalar las dependencias del proyecto y usar el entorno de Playwright de `scripts/fitness-global/browser.mjs` con Chrome, WebKit y FFmpeg. La variable `PLAYWRIGHT_BROWSERS_PATH` debe apuntar a la instalación correspondiente. Ejecutar cada servidor y navegador secuencialmente.

- Referencia: `node scripts/home-mobile/serve-qa.mjs --meal-flow --before` y, en otra terminal, `node scripts/fitness-global/meal-flow.mjs --reference`. Cerrar el servidor.
- Candidato: `node scripts/home-mobile/serve-qa.mjs --meal-flow` y, en otra terminal, `node scripts/fitness-global/meal-flow.mjs`. Repetir el comando del navegador con `--webkit`.
- `--checks-only` repite los casos de identidad, fecha, estimación, hábitos y respuesta tardía del candidato.
