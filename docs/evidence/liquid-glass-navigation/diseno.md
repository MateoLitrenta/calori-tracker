# Propuesta · Liquid Glass en la navegación de Calori

Base de comparación, merge del PR #102 `80c9a1500b68d877e1de5c57c4f6eae8f7a431fa`. La referencia de Apple sitúa este material en la capa de controles sobre el contenido. Para Calori, esa capa comprende la cápsula móvil y la barra lateral. [Materiales](https://developer.apple.com/design/human-interface-guidelines/materials) · [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)

| Forma | Medida propuesta | Aplicación |
| --- | --- | --- |
| Cápsula externa | 56 px de alto nominal, ampliable con la altura de línea. Radio igual a la mitad de la altura. | Barra móvil de cuatro destinos iguales, con una separación inferior de 6 px además del área segura y un ancho máximo cercano al original. |
| Cápsula interior | Radio exterior menos 4 px. | El borde y el relleno de la barra suman 4 px por lado. La selección ocupa la celda interior y comparte el centro de curvatura con el extremo correspondiente. |
| Rectángulo vertical | Radio de 26 px y ancho de 244 px más 12 px de separación lateral en el ancho previo de 256 px. | Barra lateral. Los grupos de marca, destinos y cuenta conservan su orden y la barra puede desplazarse. |
| Selección vertical | Radio de 14 px, calculado como 26 px menos el relleno de 12 px que incluye el borde. | Cuatro filas. Los controles utilitarios conservan sus radios y proporciones de Fitness Moderno. |

Las formas usan el principio de restar el relleno al radio exterior y preservan el objetivo táctil de 44 × 44 px. [Sistema de diseño de Apple](https://developer.apple.com/videos/play/wwdc2025/356/?time=187) · [Accesibilidad](https://developer.apple.com/design/human-interface-guidelines/accessibility)

## Material, color y movimiento

- El vidrio toma `--fit-surface` como base cálida en Claro y grafito en Oscuro. La capa deja pasar una parte acotada del fondo, difumina 14 px y usa un borde fino, una reflexión superior y una sombra corta. El material se limita al tamaño de cada superficie.
- La selección mezcla el naranja existente `--fit-orange` (`#ff9a53`) con `--fit-board`. Claro usa mayor proporción de naranja en el relleno y un borde derivado de `--fit-accent`. Oscuro conserva el naranja más brillante en el borde y usa una tinta más profunda detrás de los rótulos claros. El texto mantiene un solo color legible en cada tema, incluso cuando el indicador pasa por debajo de otra opción. [Color](https://developer.apple.com/design/human-interface-guidelines/color)
- El movimiento usa el índice de la sección aceptada en móvil y `SelectionIndicator` en escritorio. Se reutiliza la transición de la aplicación para mover el indicador. Los rótulos y los iconos mantienen su anclaje. Con movimiento reducido, el indicador cambia de posición sin interpolación. [Movimiento](https://developer.apple.com/design/human-interface-guidelines/motion)
- La superficie opaca es el estado base. Si hay soporte para desenfoque, se aplica el material translúcido. Con contraste aumentado o transparencia reducida se recupera la superficie opaca. Los colores forzados emplean las parejas de colores del sistema y distinguen selección y foco.

## Encaje de la navegación

El acabado flotante se consigue con CSS sobre el contenedor existente. En móvil la reserva de Coach se calcula con la altura de la cápsula, su separación inferior y 2 px adicionales. La suma nominal es 64 px antes del área segura. Los selectores que ocultan la barra en edición y durante el teclado del Coach siguen actuando sobre el mismo contenedor. Los destinos y la posición aceptada siguen dependiendo del estado de App.

La verificación incluye fondo claro, oscuro, colorido y con texto, ambos temas, tamaños de 320 a 1440 px, ampliación, foco, navegación por teclado y los recorridos de formulario y Coach. La compatibilidad con el indicador de inicio, las barras dinámicas de Safari y el rendimiento en un iPhone físico se comprueban en dispositivo.
