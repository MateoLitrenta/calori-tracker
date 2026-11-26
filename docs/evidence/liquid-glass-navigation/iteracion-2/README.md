# Liquid Glass · Iteración 2

La referencia es la primera versión del PR #103, `6edcba9252f5bb248b9cd98bbdddb276c16b17a2`. La dirección estética de esa versión quedó aprobada. Esta iteración refina el material de la cápsula y del lateral. La interacción de arrastre se aplica a la cápsula inferior.

## Espesor y color

El borde superior recoge un reflejo fino. La parte inferior tiene una línea de sombra interior y el panel se separa del fondo con sombras de contacto y elevación. La luz se concentra en la franja próxima al borde, de 18 px en la cápsula y 56 px en el lateral. El desenfoque de 14 px se aplica a una sola superficie visible por tamaño de pantalla. La alternativa opaca, contraste alto y colores forzados conservan sus tratamientos. Se mantienen los radios nominales 28/24 px en móvil y 26/14 px en escritorio.

La tinta clara mezcla `--fit-orange` con la base cálida. En Oscuro, el gradiente moderno deriva tono y saturación del mismo `#ff9a53` y adapta la luminosidad para el texto claro. El borde conserva el naranja exacto y el texto permanece estable mientras pasa el indicador. La técnica aproxima el espesor y la iluminación con CSS. La refracción adaptativa nativa depende de un renderizado distinto. [Materiales](https://developer.apple.com/design/human-interface-guidelines/materials) · [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) · [Geometría](https://developer.apple.com/videos/play/wwdc2025/356/) · [Movimiento](https://developer.apple.com/design/human-interface-guidelines/motion)

## Arrastre

| Entrada | Respuesta |
| --- | --- |
| Presión en el botón activo | Se captura el puntero y el botón sigue siendo un control nativo. Por debajo de 6 px de distancia se conserva el clic normal. |
| Horizontal | El indicador sigue el desplazamiento en píxeles. En los extremos, el excedente se amortigua progresivamente hasta 2 px. |
| Vertical y diagonal | El desplazamiento vertical se amortigua hasta 3 px. La deformación máxima es de 1,8 % y conserva una separación con el borde. En un gesto vertical, la pieza vuelve a su posición al soltar. |
| Soltar | Puede pedir otra sección si el componente horizontal alcanza el 45 % de una celda y supera 1,25 veces el vertical. El desplazamiento aproxima la celda destino y queda acotado a los cuatro destinos. La aplicación decide si acepta el cambio. |
| Interrupción | Pérdida o cancelación de captura, salida de la ventana, ocultamiento, cambio de tamaño o rotación retiran la transformación temporal del indicador. Al soltar se comprueba también que el marco de la ventana y la posición de la barra coincidan con los del inicio. Esto protege el destino aceptado si el navegador avisa del cambio de tamaño después de soltar. |
| Movimiento reducido | Se conserva el seguimiento directo con forma fija y retorno inmediato. |
| Clic y teclado | Las cuatro secciones siguen disponibles mediante clic, Tab, Enter y Espacio. Durante un arrastre se descarta el clic residual. |

`touch-action: none` se aplica al botón activo. La página y el contenido próximo conservan sus gestos de desplazamiento. Solo cambia la transformación del indicador durante el movimiento y se agrupan las muestras del puntero en un fotograma. El cálculo de geometría usa la caja de la celda al comenzar y una sesión breve en referencias de React. Los rótulos e iconos conservan su posición. El área de agarre es la pestaña activa. Durante el deslizamiento entre pestañas, cada botón conserva su zona de clic. Al terminar se reanuda la transición; el retorno dura 240 ms y usa un rebote pequeño. No se anima el filtro ni se muestrea el contenido en producción.

## Pruebas y revisión

[Material, comparativas y video](visual.md) · [Gestos, video y resultados](gestos.md)

Los recorridos usan la interfaz real con identidad, registros y respuestas sintéticos. Se usa la versión de referencia congelada y se bloquea la red externa del escenario. El rendimiento gráfico y el gesto táctil nativo se revisan en un iPhone con Safari. Las mediciones de navegador y los punteros emulados comprueban la lógica y geometría de esos recorridos.

1. En la nueva Preview, comprobar el código de Perfil y volver a Inicio. En iPhone, mantener un dedo sobre Inicio y moverlo primero menos de media celda. Repetir cruzando la celda hacia Coach y soltar.
2. Arrastrar hacia arriba y luego en diagonal. Comprobar que el gesto vertical retorna, que el desplazamiento fuera de la pieza sigue disponible y que el teclado de Coach libera la barra. Repetir tras girar el teléfono.
3. En Mac, usar mouse o trackpad con ventana inferior a 768 px. Interrumpir un arrastre cambiando el tamaño, navegar con Tab y Enter y probar movimiento reducido. En escritorio ancho, revisar el reflejo lateral y el estado activo en ambos temas.
