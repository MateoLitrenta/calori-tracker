# Etapa 2 · Registro diario e Historial

Referencia de la auditoría del 17 de noviembre. La línea base es el merge del PR #81, `c2c62c94a25c44559ab926f8d954305e32a36317`. Las capturas usan datos sintéticos del 17 de noviembre de 2026 en America/Buenos_Aires. Se conserva Fitness Moderno.

| Hallazgo | Cambio | Prueba y resultado |
| --- | --- | --- |
| UX-05 | Altas y ediciones usan el diálogo existente con ancho propio de 592 px en escritorio y hoja inferior en móvil. Descripción a ancho completo. El pie queda visible mientras el contenido se desplaza. Cancelar, X y Escape piden confirmar si hubo cambios. | [Geometría a seis anchos](after/layout.json) y [altas, fallos, edición, Escape y foco](after/flows.json). Los borradores sobreviven al rechazo de descartar, al error simulado y al cambio de Sistema. |
| UX-06 | El selector conserva el reloj nativo. El atajo dice «Ahora» y tiene nombre accesible «Usar hora actual». | Matriz de formularios y pruebas de etiquetas en altas y ediciones. |
| UX-07 | Foto visible junto a la estimación explícita. Notas en un desplegable independiente. | El arnés adjunta un PNG sintético, verifica la vista previa y comprueba cero llamadas antes de pulsar «Estimar con IA». Esa acción produce una llamada simulada. El alta manual del otro recorrido usa cero llamadas. |
| UX-11 | Inicio identifica la fecha editable. Historial identifica la fecha explorada y la acción de edición dice qué día abre. | La exploración conserva el 17. La acción explícita cambia al 15 y los intentos de guardado del formulario llevan esa fecha. |
| UX-12 | Acceso al detalle junto al calendario móvil, leyenda desplegable y un indicador principal en celdas con balance. Se conservan los deportes en el nombre accesible y en el detalle. | La matriz móvil verifica que el botón enfoca el detalle. Las pruebas de Historial conservan las tres vistas, fechas, cobertura, deportes y selección independiente. |
| UX-14 | Magnitud de los dos ajustes visible. Las parejas pueden ocupar dos líneas de controles con texto ampliado. «Registrar peso» queda reservado a días sin medición. | Texto al 200% y tamaño táctil medidos a 320 px. Tres pulsaciones rápidas por hábito conservan sus incrementos. Registrar peso cambia la acción a «Editar». |
| UX-17 | Títulos y acciones de alta, edición y guardado coherentes entre tamaños. | Pruebas de diálogos y acciones de los cuatro modos de comida/ejercicio. |
| #82 / UX-03 | El gráfico anual se posiciona al empezar a necesitar desplazamiento. Tras volver a escritorio, recupera el desplazamiento previo al regresar al ancho estrecho. | [Referencia](before/layout.json) y [candidato](after/layout.json) a 320, 375 y 393 px en ambos temas. Se verifica actividad visible, doce meses, selección, posiciones 0 y 40, y año vacío. El cambio de gráfico está en el commit `6bc4b91`. |

Las políticas semanales siguen pendientes de aprobación. La revisión del diff abarca la presentación y el ciclo de vida de los diálogos. Los servicios de IA, autenticación, escritura y almacenamiento se simulan en el navegador local. El ensayo Linux usa PostgreSQL y PostgREST desechables.

| Comparativa | Móvil claro · 375 px | Móvil oscuro · 375 px | Escritorio claro · 1440 px | Escritorio oscuro · 1440 px |
| --- | --- | --- | --- | --- |
| Inicio | [Antes](before/375-light-inicio.jpg) · [Después](after/375-light-inicio.jpg) | [Antes](before/375-dark-inicio.jpg) · [Después](after/375-dark-inicio.jpg) | [Antes](before/1440-light-inicio.jpg) · [Después](after/1440-light-inicio.jpg) | [Antes](before/1440-dark-inicio.jpg) · [Después](after/1440-dark-inicio.jpg) |
| Comida | [Antes](before/375-light-comida.jpg) · [Después](after/375-light-comida.jpg) | [Antes](before/375-dark-comida.jpg) · [Después](after/375-dark-comida.jpg) | [Antes](before/1440-light-comida.jpg) · [Después](after/1440-light-comida.jpg) | [Antes](before/1440-dark-comida.jpg) · [Después](after/1440-dark-comida.jpg) |
| Historial | [Antes](before/375-light-historial.jpg) · [Después](after/375-light-historial.jpg) | [Antes](before/375-dark-historial.jpg) · [Después](after/375-dark-historial.jpg) | [Antes](before/1440-light-historial.jpg) · [Después](after/1440-light-historial.jpg) | [Antes](before/1440-dark-historial.jpg) · [Después](after/1440-dark-historial.jpg) |

- Año al reducir de escritorio a 375 px · [antes claro](before/375-anual-light.jpg), [después claro](after/375-anual-light.jpg), [antes oscuro](before/375-anual-dark.jpg), [después oscuro](after/375-anual-dark.jpg).
- Texto largo con fuente al 200% · [móvil antes](before/375-light-comida-texto200.jpg), [móvil después](after/375-light-comida-texto200.jpg), [escritorio antes](before/1440-dark-comida-texto200.jpg), [escritorio después](after/1440-dark-comida-texto200.jpg).

Para reproducir, iniciar en dos terminales `node scripts/home-mobile/serve-qa.mjs --stage2 --before` y `node scripts/home-mobile/serve-qa.mjs --stage2`. Ejecutar `node scripts/ux-stage2/check.mjs --before`, `node scripts/ux-stage2/check.mjs` y `node scripts/ux-stage2/check.mjs --flows`. El arnés reutiliza las fixtures y Chromium de la etapa anterior. La ampliación duplica las fuentes y alturas de línea calculadas, con el viewport fijo.

Quedan pendientes la validación con teclado móvil físico, Safari/iOS, cámara física, zoom nativo y lectores de pantalla. La Preview se valida por estado y SHA de Vercel. Gemini real y los servicios autenticados remotos quedan fuera de la comprobación sintética de esta etapa.
