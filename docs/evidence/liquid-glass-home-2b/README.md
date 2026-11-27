# Liquid Glass · Inicio etapa 2B

La referencia es `bf7fe5515a5f27edb2686c088c0110994d58e5b9`, merge de Inicio 2A en el PR #104. Se reutiliza el lenguaje de la navegación del PR #103 y del balance de Inicio.

## Cambios por bloque

- **Registros del día.** Las filas comparten una superficie sólida con borde fino. El grupo usa 19 px de radio y encastra las filas de 14 px con 5 px de separación. Las miniaturas toman el radio menor. El nombre y los metadatos conservan su capacidad de ocupar varias líneas y las kcal tienen su propio espacio. El registro recién guardado conserva su contorno y gana una superficie de acento cálida.
- **Hábitos.** Agua, Pasos y Peso tienen superficies de lectura compactas de 18 px y controles de 10 px. El grupo conserva el cambio de columnas a filas cuando los valores o la edición necesitan espacio. Los incrementos conservan 44 px de tamaño táctil. El acuse utiliza el color de éxito de Calori.
- **Tu actividad.** El calendario, el detalle y los resúmenes toman el borde, los reflejos y las curvas de Inicio. El selector de períodos adopta una superficie compartida con la selección naranja. La fecha seleccionada se destaca con su contorno y los colores bajo cada día siguen expresando la actividad y el balance.

Los estilos de producto se limitan a `FitnessDaily.css` y a reglas de actividad dentro de Inicio. Comparten `--fit-surface`, `--fit-orange`, los radios de Inicio 2A y el reflejo y las sombras de contacto de la navegación. En móvil se usa la reserva de la cápsula para dar lugar al foco al desplazarse.

## Evidencia

El contraste de texto se verifica sobre los fondos renderizados con el umbral de 4,5:1 para texto normal. [WCAG 2.2, criterio 1.4.3](https://www.w3.org/TR/WCAG22/#contrast-minimum)

[Comparativas y mediciones](visual.md) · [Regresión funcional](funcional.md)

## Revisión en Preview

1. Confirmá el código en Perfil → Versión de Preview. Volvé a Inicio y revisá un día con comidas y ejercicio. Abrí un detalle y volvé al listado. Revisá la lectura del título, las kcal y el foco.
2. En móvil, comprobá el tamaño de los controles de Hábitos y la lectura con texto grande. En Tu actividad, probá Semana, Mes y Año. Consultá un día y comprobá la diferencia entre consultar y abrir sus registros.
3. En escritorio, recorré con Tab el selector de período, las fechas y las filas de registros. Repetí en Claro y Oscuro y compará con las capturas del balance y de la navegación aprobada.

Las pruebas usan datos sintéticos en navegadores de escritorio. Queda pendiente la revisión de las áreas seguras, la letra ampliada del sistema y la interacción táctil en Safari de iPhone físico. El siguiente bloque visual puede tomar estas decisiones como referencia cuando se defina su alcance.
