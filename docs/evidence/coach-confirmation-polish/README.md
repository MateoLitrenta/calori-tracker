# Coach: confirmación estable y formato de kcal — issue #101

## Alcance y procedencia

Comparación de la app React real, con sus componentes, CSS, transporte de IA y almacén de conversaciones. Solo la sesión, las respuestas remotas y las escrituras son sintéticas. La cuenta `Alex`, la comida de 1.100 kcal y todos los mensajes se crearon para estas pruebas. No se usó el vídeo personal ni una cuenta de producción.

- **Base:** árbol de `21c2e90d9d1528d3af8a9389341b621164971b75`. Se sirvió desde el checkout `dd37bb2088b248dfabedd14eff74aa8bda05f3a7`, cuyo árbol es idéntico (`git diff --stat` vacío entre ambos).
- **Candidato:** cambios de issue #101 en este PR. [Huella de los archivos probados](source-manifest.json).
- **Entorno:** Chrome remoto, con la app dentro de un iframe de **1440 × 900** o **375 × 812 CSS px**. La captura de escritorio incluye 48 px del encabezado del fixture; las coordenadas de las mediciones pertenecen al documento de la app. En móvil se recortó ese encabezado.
- **Identidad de datos:** día fijo 26/11/2026, comida extensa, 1.100 kcal, Almuerzo, 13:30. El fixture bloquea solicitudes a servicios remotos.

## Comparación medida

Se midió el mismo mensaje inmediatamente anterior a la propuesta, con la conversación corta ya asentada. Al confirmar, la base perdía rango de desplazamiento y el navegador reducía `scrollTop` a cero. Las mediciones completas están en [matrix.json](matrix.json) y en los JSON de cada caso.

| Viewport y apariencia | Salto del mensaje en la base | Salto en el candidato | Desplazamiento del compositor al confirmar |
| --- | ---: | ---: | ---: |
| 1440 × 900, Claro | 213 px | **0 px** | 0 px |
| 1440 × 900, Oscuro | 213 px | **0 px** | 0 px |
| 375 × 812, Claro | 341 px | **32 px** | 0 px |
| 375 × 812, Oscuro | 341 px | **32 px** | 0 px |

**Los 32 px de móvil son una corrección deliberada de visibilidad.** La propuesta empezaba en y = 131,38, por encima del área de lectura (y = 153). El recibo se coloca en y = 163,38 y termina en y = 299,80, completamente visible. No se afirma conservación exacta en ese caso. En escritorio, propuesta y recibo empiezan en y = 283,25 y `scrollTop` permanece en 213.

En los cuatro casos no se observó desbordamiento horizontal. El espacio libre debajo del recibo conserva el rango necesario para evitar el salto; no se contrae con un temporizador. El siguiente envío lo consume y lleva la nueva respuesta al final del chat: su borde inferior quedó a 23,19 px del compositor en la prueba móvil.

### Capturas comparables

Cada enlace reúne la propuesta o el recibo ya asentados, sin animaciones de entrada a medio completar.

| Caso | Base: propuesta / recibo | Candidato: propuesta / recibo |
| --- | --- | --- |
| Escritorio oscuro | [Propuesta](before/1440-dark-short-proposal.jpg) · [Recibo](before/1440-dark-short-receipt.jpg) | [Propuesta](after/1440-dark-short-proposal.jpg) · [Recibo](after/1440-dark-short-receipt.jpg) |
| Escritorio claro | [Propuesta](before/1440-light-short-proposal.jpg) · [Recibo](before/1440-light-short-receipt.jpg) | [Propuesta](after/1440-light-short-proposal.jpg) · [Recibo](after/1440-light-short-receipt.jpg) |
| Móvil oscuro | [Propuesta](before/375-dark-short-proposal.jpg) · [Recibo](before/375-dark-short-receipt.jpg) | [Propuesta](after/375-dark-short-proposal.jpg) · [Recibo](after/375-dark-short-receipt.jpg) |
| Móvil claro | [Propuesta](before/375-light-short-proposal.jpg) · [Recibo](before/375-light-short-receipt.jpg) | [Propuesta](after/375-light-short-proposal.jpg) · [Recibo](after/375-light-short-receipt.jpg) |

## Recorridos de regresión

| Recorrido | Observación |
| --- | --- |
| Leer mensajes anteriores mientras se resuelve el guardado | En el candidato de escritorio, `scrollTop` se mantuvo en **1709**. Los dos mensajes visibles medidos y el compositor variaron **0 px**. [Mediciones](after/1440-dark-long.json) · [Antes del acuse](after/1440-dark-long-pending.jpg) · [Después](after/1440-dark-long-receipt.jpg). La base también conservó la lectura en su control independiente, realizado en `scrollTop = 0`; esas capturas no constituyen una comparación entre versiones con el mismo desplazamiento. |
| Escribir después de confirmar | Borrador de dos líneas intacto, foco en el compositor y cursor al final (posición 62). Al crecer 60 px el compositor, `scrollTop` conservó 309. No se simuló un teclado físico. [Mediciones](after/375-dark-draft.json) · [Captura](after/375-dark-draft.jpg). |
| Continuar la conversación | La reserva se consumió. La respuesta siguiente quedó visible junto al compositor, sin un hueco artificial entre mensajes. [Mediciones](after/375-dark-next-send.json) · [Captura](after/375-dark-next-send.jpg). |
| Fallar y reintentar | Error visible, propuesta y valores conservados, Confirmar disponible otra vez. El reintento produjo **un guardado confirmado** después de un intento fallido. [Resultado](after/375-dark-save-retry.json) · [Error](after/375-dark-save-error.jpg) · [Reintento](after/375-dark-save-retry.jpg). |
| Formato de energía | Propuesta y recibo: **1.100 kcal**. Fila de Inicio y detalle: **+1.100 kcal**. [Texto observado](after/375-dark-kcal.json) · [Detalle](after/375-dark-meal-detail.jpg). |
| ResizeObserver | La consulta de registros del navegador filtrada por `ResizeObserver` devolvió cero entradas. Está registrada en el JSON del reintento. |

El compositor permanece deshabilitado mientras una propuesta está pendiente, igual que en la base. La prueba de borrador corresponde al estado posterior al guardado.

## Reproducción

Con las dependencias del repositorio instaladas, ejecutar desde su raíz:

```sh
node docs/evidence/coach-confirmation-polish/serve-synthetic.mjs --port=5173
```

Abrir `/review?width=375&theme=dark&conversation=short` en el origen impreso por el comando. El fixture admite `width=1440`, `theme=light` y `conversation=long`. Para una comparación de la base, ejecutar el mismo fixture con `--source=/ruta/al/checkout/base`.

1. Abrir Coach y enviar: «Hoy a las 13:30 comí milanesa napolitana con papas al horno, ensalada de tomate, cerveza y ensalada de frutas de postre.»
2. Esperar a que la propuesta quede asentada. Medir `scrollTop`, el rectángulo de `.chat-messages`, `.chat-composer` y los `.chat-message` antes y después de Confirmar. No medir durante la animación inicial.
3. Para espera o error, agregar `&controls=1`. Desplegar «Prueba sintética de confirmación» y activar «Mantener guardado pendiente» o «Simular fallo de guardado». El primer control permite leer mensajes anteriores y luego resolver manualmente el guardado.
4. Para el reintento, desactivar el fallo y confirmar otra vez. El contador debe indicar un único guardado confirmado.

## Límites

Esta evidencia no acredita Safari/iOS, barras del navegador, teclado táctil, lector de pantalla, servicios remotos reales ni la preferencia del sistema de movimiento reducido. El navegador disponible no ofrecía emulación de esa preferencia; no se presenta como un recorrido aprobado. Las capturas son pruebas de la app en iframe, no de un teléfono físico. CI y pruebas unitarias se informan por separado en el PR.
