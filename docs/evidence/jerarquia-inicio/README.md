# Jerarquía de Inicio y fechas

Se comparó `a579065571584535408dd89b092de6619b520e27` con la rama de Inicio. Ambos servidores usaron la misma fixture local del 13 de noviembre de 2026 con 1.750 ml de agua, 6.300 pasos, 72,8 kg, tres comidas y dos ejercicios.

## Capturas

- 375 px, Claro. [Inicio antes](before/375-light-inicio.jpg) · [Inicio después](after/375-light-inicio.jpg) · [Orden antes](before/375-light-jerarquia.jpg) · [Orden después](after/375-light-jerarquia.jpg)
- 390 px, Oscuro. [Inicio antes](before/390-dark-inicio.jpg) · [Inicio después](after/390-dark-inicio.jpg) · [Orden antes](before/390-dark-jerarquia.jpg) · [Orden después](after/390-dark-jerarquia.jpg)
- 1440 px, Claro. [Antes](before/1440-light-inicio.jpg) · [Después](after/1440-light-inicio.jpg)
- 1440 px, Oscuro. [Antes](before/1440-dark-inicio.jpg) · [Después](after/1440-dark-inicio.jpg)
- Consulta histórica y semanas entre meses. [Fecha histórica antes](before/375-light-historico.jpg) · [Fecha histórica después](after/375-light-historico.jpg) · [Cruce de mes antes](before/375-light-cruce-de-mes.jpg) · [Cruce de mes después](after/375-light-cruce-de-mes.jpg)
- Hábitos. [Edición antes](before/375-light-editando.jpg) · [Edición después](after/375-light-editando.jpg) · [375 px al 200 % antes](before/375-light-texto-200.jpg) · [375 px al 200 % después](after/375-light-texto-200.jpg) · [390 px al 200 % antes](before/390-dark-texto-200.jpg) · [390 px al 200 % después](after/390-dark-texto-200.jpg)

## Hallazgos y verificación

- **Fechas repetidas.** La fecha del día conserva su encabezado y se retiran «Registrando en» y el rango en semanas de un solo mes. Se conservaron los siete días de lunes a domingo, las fechas futuras inhabilitadas y el indicador naranja alineado con el día elegido. El rango aparece cuando se cruza de octubre a noviembre. En Chrome a 375 px, el calendario de la fixture pasa de 134 a 106 px de alto.
- **Acción Hoy.** En fechas históricas, la acción aparece y vuelve al 13 de noviembre del fixture. Al activarla con Enter, el foco se traslada al botón del calendario mensual y el control Hoy desaparece. Las flechas de semana y la selección con teclado en el calendario mensual conservaron la fecha esperada.
- **Orden y lectura.** En móvil se midió el orden calendario, balance, acciones, Hábitos, Registros y actividad. En escritorio se conservaron las áreas de la rejilla, con Hábitos bajo las acciones y Registros a la derecha. El recorrido real con Tab desde «Agregar ejercicio» pasa primero por Hábitos y luego por Registros en ambos tamaños.
- **Conservación de Hábitos y del balance.** Se compararon geometría relativa, dimensiones, espaciado, radios, colores, bordes y sombras de tarjetas y controles con la referencia, con tamaño de texto normal y al 200 %. El balance inicial conserva −1.031 kcal, 1.250 kcal consumidas y 2.281 kcal de gasto estimado. En la fixture, sumar agua lleva el total a 2.000 ml y editar pasos lleva el total a 6.800 con confirmación. El peso se mantiene en 72,8 kg.
- **Registros y desplazamiento.** Enter abre el detalle de un registro y Escape devuelve el foco al mismo control. A 375 px, «Ver resumen energético» quedó 36,3 px por encima de la cápsula en Chrome y 36 px en WebKit. El control respondió al hit test con el scroll al final. Inicio restauró el desplazamiento de 280 px al regresar de Datos.
- **Texto ampliado.** Se duplicó el tamaño de fuente raíz a 32 px. Los controles y el indicador permanecieron dentro del trazado previsto, sin desbordamiento horizontal de la página. El desplazamiento interno del calendario conserva sus siete días.

Se revisaron 375 px en Claro, 390 px en Oscuro y 1440 px en ambos temas en los dos motores. Los recorridos de fechas, foco, guardado y scroll se ejecutaron a 375 y 1440 px en Claro.

Resultados por motor. [Chrome antes](before/chromium.json) · [Chrome después](after/chromium.json) · [WebKit antes](before/webkit.json) · [WebKit después](after/webkit.json).

## Repetir la comparación

Se usó una exportación de Git del commit base y la rama candidata. Ejecutá el mismo comando desde cada raíz, con las dependencias QA instaladas. Usá el puerto 5193 para la base y el 5194 para el candidato.

```text
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-home-2b --port=5193
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-home-2b --port=5194
```

Desde el candidato, ejecutá `node scripts/fitness-global/jerarquia-inicio.mjs --before` y luego `node scripts/fitness-global/jerarquia-inicio.mjs`. Repetí con `--webkit`. Si los binarios de Playwright usan una ruta local específica, configurá `PLAYWRIGHT_BROWSERS_PATH`.

## Alcance

Las comprobaciones usan datos y guardados sintéticos en un navegador local. Se configuró el bloqueo de solicitudes externas y los dos motores registraron cero solicitudes externas y cero llamadas a IA. La ampliación CSS y las dimensiones móviles de Playwright son comprobaciones de navegador. Quedan pendientes el tamaño de texto del sistema, los gestos reales y el área segura en Safari de iPhone físico.
