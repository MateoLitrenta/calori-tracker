# Separación inferior de la cápsula · Draft #104

El candidato de referencia es `27f20caffeb976e57c4beffaa79a606d0c993184`. En un iPhone físico, Mateo observó que algunos toques en la cápsula activaban la navegación del sistema. La distancia que puede medir la aplicación se toma desde el borde del viewport web. Las barras de Safari y el indicador de inicio son elementos del sistema y su distancia física se comprueba en el teléfono.

## Desplazamiento aplicado

| Medida | Referencia | Candidato |
| --- | --- | --- |
| Distancia al borde del viewport | 6 px + área segura | 6 px + área segura + entre 12 y 16 px |
| Reserva de cápsula | Altura de la cápsula + distancia + 2 px | Se calcula con la nueva distancia y la misma altura |

El extra usa `clamp(12px, 2svh, 16px)`, con 12 px en motores sin esa unidad. El tamaño pequeño del viewport mantiene estable ese cálculo cuando las barras del navegador se retraen. La variable `env(safe-area-inset-bottom, 0px)` sigue a cargo del área segura que informa el navegador. El documento conserva el encuadre predeterminado de Safari. Activar `viewport-fit=cover` ampliaría el área de dibujo de toda la aplicación y requeriría volver a revisar bordes, diálogos y formularios. [Áreas seguras en WebKit](https://webkit.org/blog/7929/designing-websites-for-iphone-x/) · [Unidades de viewport en Safari](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/)

Perfil y Coach usan la reserva de la cápsula y la de Coach vuelve a cero con el teclado abierto. Inicio y Datos conservan su relleno habitual con un mínimo dependiente de la cápsula. Los avisos tienen un mínimo equivalente que deja una separación adicional. El desglose y las acciones de Inicio ya toman la misma reserva al mover el foco. Se conservan altura, radios, material y área táctil del control.

## Evidencia

[Capturas y medidas efectivas](visual.md) · [Regresión funcional](funcional.md)

Chrome y WebKit permiten comprobar geometría, scroll y punteros sobre datos sintéticos. Las áreas seguras y el teclado simulados prueban el cálculo y la recuperación de la vista.

## Revisión en iPhone con Safari

1. Abrí la Preview y confirmá en Perfil → Versión de Preview el código del candidato. En vertical, probá el borde inferior de cada pestaña con las barras de Safari visibles y tras desplazar la página.
2. Arrastrá la selección horizontalmente y hacia arriba. Girá durante otro arrastre y comprobá que retorna a la pestaña aceptada. Probá el gesto del sistema desde el borde de la pantalla y verificá que Safari conserva su respuesta habitual.
3. Abrí y cerrá el teclado de Coach y girá con el campo enfocado. En Inicio y Perfil, desplazate al final y revisá el último control. Esta revisión comprueba la comodidad táctil y la separación real con las barras y el indicador de inicio del dispositivo.
