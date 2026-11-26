# Liquid Glass · Inicio etapa 2A

La referencia es `cee76612a4352e82f626fc4eaf2951998f792e9c`, merge del PR #103. La navegación de ese corte es la referencia para bordes, sombras y color.

## Decisiones

- **Encabezado.** En móvil, el símbolo queda enmarcado con borde fino y reflejo superior. El título conserva la tipografía y la alineación. En escritorio, «Inicio» sigue junto al lateral con la marca.
- **Calendario y balance.** El calendario y la lectura forman un panel con esquinas exteriores de 26 px. Los controles de día y las acciones usan 14 px, tomando el encastre de 12 px del lateral aprobado. El calendario concentra el reflejo arriba y se distingue con una franja de tono cálido o grafito. La superficie bajo las cifras es sólida. El espacio lateral del panel se ajusta para que quepan siete celdas de 44 px a 320 px con tamaño de texto normal. Con texto ampliado se conserva el desplazamiento horizontal propio del selector.
- **Acciones.** Agregar comida y la fecha seleccionada usan `--fit-orange` (`#ff9a53`). Agregar ejercicio conserva una superficie neutra. Los botones mantienen su altura mínima de 48 px. La animación del botón se limita a la sombra durante la pulsación y respeta movimiento reducido.
- **Jerarquía y foco.** El balance sigue encabezando la lectura, con las dos métricas alineadas a la misma escala. El foco del día seleccionado usa un contorno oscuro sobre naranja, también en tema Oscuro. En móvil, el desglose y las acciones incorporan un margen de desplazamiento de foco que despeja la cápsula y el contorno al ampliar el texto.

El cambio de producto se limita al CSS del encabezado, del calendario semanal, del balance diario y de las dos acciones de Inicio. El material aprovecha los tokens del PR #103 y conserva las superficies sólidas para lectura.

## Evidencia

[Capturas y mediciones](visual.md) · [Recorridos funcionales](funcional.md)

## Revisión

1. Abrí la Preview y verificá el código en Perfil → Versión de Preview. En móvil, volvé a Inicio y compará Claro y Oscuro. Recorré el calendario para consultar otro día, leé el balance y desplegá «Ver desglose».
2. Abrí y cancelá Agregar comida y Agregar ejercicio. Comprobá que la fecha del formulario coincida con la seleccionada y que el foco vuelva al control correspondiente.
3. En escritorio, recorré la fecha, el desglose y las acciones con Tab. Comprobá el día seleccionado con las flechas y Enter. Revisá el panel junto al lateral aprobado y repetí con texto ampliado.

El material se verificó con datos sintéticos. Safari en iPhone físico queda para la revisión de las barras dinámicas, el área segura y la respuesta táctil. Registros, hábitos y actividad quedan disponibles para una etapa posterior.
