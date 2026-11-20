# Inicio, peso diario y navegación

La comparación usa la misma cuenta sintética, con el día fijado en el 13 de noviembre de 2026. La base es `356ebe8bdc65c393633e5eb6f0abb8a0398da504` (PR #88). Las imágenes muestran la aplicación en Chrome de escritorio y un viewport móvil de 375 × 812. El escritorio usa 1440 × 900.

## Comparación visual

| Vista | Claro | Oscuro |
| --- | --- | --- |
| Inicio · 1440 px | [Antes](before/inicio-1440-light.jpg) · [Después](after/inicio-1440-light.jpg) | [Antes](before/inicio-1440-dark.jpg) · [Después](after/inicio-1440-dark.jpg) |
| Inicio · 375 px | [Antes](before/inicio-375-light.jpg) · [Después](after/inicio-375-light.jpg) | [Antes](before/inicio-375-dark.jpg) · [Después](after/inicio-375-dark.jpg) |
| Coach · 1440 px | [Antes](before/coach-1440-light.jpg) · [Después](after/coach-1440-light.jpg) | [Antes](before/coach-1440-dark.jpg) · [Después](after/coach-1440-dark.jpg) |
| Coach · 375 px | [Antes](before/coach-375-light.jpg) · [Después](after/coach-375-light.jpg) | [Antes](before/coach-375-dark.jpg) · [Después](after/coach-375-dark.jpg) |
| Editar peso · 1440 px | [Antes](before/peso-1440-light.jpg) · [Después](after/peso-1440-light.jpg) | [Antes](before/peso-1440-dark.jpg) · [Después](after/peso-1440-dark.jpg) |
| Editar peso · 375 px | [Antes](before/peso-375-light.jpg) · [Después](after/peso-375-light.jpg) | [Antes](before/peso-375-dark.jpg) · [Después](after/peso-375-dark.jpg) |
| Cancelar con puntero · 1440 px | [Antes](before/peso-hover-1440-light.jpg) · [Después](after/peso-hover-1440-light.jpg) | [Antes](before/peso-hover-1440-dark.jpg) · [Después](after/peso-hover-1440-dark.jpg) |
| Peso con viewport reducido por teclado simulado · 375 px | [Antes](before/peso-teclado-375-light.jpg) · [Después](after/peso-teclado-375-light.jpg) | [Antes](before/peso-teclado-375-dark.jpg) · [Después](after/peso-teclado-375-dark.jpg) |

## Resultados de navegador

| Hallazgo | Cambio | Prueba y resultado |
| --- | --- | --- |
| Inicio y Coach repetían el isotipo de la barra lateral. | Desde 768 px el sidebar conserva la marca y los encabezados muestran INICIO o COACH. En móvil se conserva la marca en ambos encabezados. | Claro y oscuro. Un solo h1 accesible por vista. Se cruzó el umbral 767 ↔ 768 sin recargar. Inicio mantuvo la caja del encabezado entre carga y contenido. [Medidas de la base](before/surfaces.json) · [Medidas del candidato](after/surfaces.json) · [Cuatro encabezados a 320, 375, 768 y 1440 px](after/encabezados.json) |
| En escritorio Cancelar quedaba encima de Guardar peso y tomaba el acento naranja al pasar el puntero. | El pie de peso diario usa botones del ancho del contenido, alineados a la derecha. | En ambos temas los botones miden 48 px de alto, con 12 px de separación. La prueba amplía la fuente de los botones al 200%, comprueba el espacio entre filas y el contenido de cada botón. El hover resuelve al color neutro del tema. |
| Había un acceso redundante a los registros en el encabezado. | Se retiró el enlace superior. Se conservan la lista, la expansión en escritorio y los destinos específicos. | Con cinco filas, escritorio permite expandir de cuatro a cinco y móvil muestra las cinco. Historial → registros lleva el foco al encabezado del día elegido. «Ver registro» después de guardar una comida enfoca la fila del ID confirmado. |
| El sidebar cambiaba el fondo de selección de golpe. | Un marcador decorativo sigue la sección aceptada por la aplicación. | [Video del sidebar](after/sidebar.webm). El recorrido comprueba ambos sentidos, extremos, navegación rápida, foco, cambios pendientes en Perfil y bloqueo de navegación con formulario abierto. |
| La tira semanal cambiaba el rectángulo naranja de golpe. | Un marcador persistente se alinea con el botón de la fecha activa. | [Video de la tira semanal](after/dias.webm). El recorrido comprueba foco sin selección, activación, Hoy, elección desde el calendario, cambio de semana y desborde de la tira al ampliar el texto. [Muestras de ambos ejes](after/movimiento.json) |

El muestreo registró 37 recorridos en Chrome 158. Al abrir Perfil desde Inicio, el fondo pasó por posiciones verticales de 72 y 151,6 px antes de llegar a 168 px. Al activar el domingo con la barra espaciadora, el marcador pasó de 442,6 a 251,6 y 138,6 px antes de alinearse con la primera columna. Las posiciones se midieron respecto de cada grupo. El video del sidebar dura 5,24 s y el de días, 3,08 s. En los ocho cambios grabados de sección y los seis de fecha hubo muestras intermedias. A 320 px y con texto al 200 %, la tira muestra 308 px de un contenido de 616 px y conserva visible el día seleccionado o el que se explora con teclado. Con movimiento reducido, ambos indicadores cambiaron de destino sin posiciones intermedias.

En el registro sintético de peso se ingresó `71,4` para el 9 de noviembre. Un intento fallido conservó el borrador. Dos envíos seguidos produjeron una sola escritura confirmada. La edición posterior guardó `71,6`, mientras el peso de Perfil siguió en 73 y el registro del día 13 en 72,8. También se comprobaron Cancelar, Escape, seguir editando, descartar y el retorno de foco.

## Reproducir

Con las dependencias del repositorio y Playwright de QA disponibles, ejecutar estos servidores en dos terminales. El primero extrae desde Git el código exacto de la base.

```sh
node scripts/home-mobile/serve-qa.mjs --navigation-polish --before --port=5193
node scripts/home-mobile/serve-qa.mjs --navigation-polish --port=5194
```

Ejecutar los tres recorridos secuencialmente en otra terminal. `PLAYWRIGHT_MODULE` admite una instalación alternativa de Playwright. La grabación necesita el binario FFmpeg de Playwright.

```sh
node scripts/fitness-global/navigation-surfaces.mjs --before
node scripts/fitness-global/navigation-surfaces.mjs
node scripts/fitness-global/navigation-motion.mjs
```

El navegador usa componentes reales y servicios locales simulados. Se verificó que el modal de comida deja el fondo inerte y se enviaron clics sintéticos al DOM detrás del modal para ejercitar también las guardas de la aplicación. En Perfil se usaron clics de navegador para continuar editando y para confirmar la salida. Las pruebas del teclado móvil reducen `visualViewport` y verifican el campo enfocado, las acciones superiores y el desplazamiento del cuerpo. Queda pendiente la comprobación en un teléfono físico con teclado nativo. La CI Linux del PR ejecuta la suite completa con PostgreSQL y PostgREST desechables, los tres controles de TypeScript, lint y build. Los resultados del HEAD y la identidad de la Preview se consignan en el PR.
