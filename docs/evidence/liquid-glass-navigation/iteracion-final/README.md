# Liquid Glass · Refinamiento final de translucidez

La comparación parte del candidato aprobado `3a61032d73b1bb674efb4f958bb909d4c246732f`. El objetivo de la revisión es percibir mejor el fondo mientras se desplaza Inicio.

## Material

| Superficie | Opacidad anterior Claro / Oscuro | Opacidad final Claro / Oscuro | Desenfoque anterior → final |
| --- | --- | --- | --- |
| Cápsula inferior | 84 % / 84 % | 72 % / 78 % | 14 → 10 px |
| Lateral | 90 % / 90 % | 83 % / 85 % | 14 → 12 px |

Estos porcentajes corresponden al color de base. El reflejo, el borde y las sombras también influyen en el resultado renderizado. El reflejo se concentra en 12 px de la cápsula y 38 px del lateral. La línea superior conserva la sensación de espesor y la sombra exterior se suaviza. La selección conserva el naranja y el tratamiento de Claro y Oscuro aprobados. Los navegadores sin desenfoque y las preferencias de mayor contraste o transparencia reducida disponen de una superficie opaca.

## Qué pasa detrás de la barra

En móvil la cápsula ya se superpone al área desplazable. Reducir opacidad y desenfoque permite distinguir mejor las formas de Inicio mientras pasan detrás. Al final del recorrido, el espacio inferior permite subir el último control por encima de la barra. En Coach, la reserva se ajusta al teclado para mantener el compositor accesible.

En escritorio el lateral ocupa su propia columna. Su fondo habitual es el del marco de Calori, de modo que el cambio se percibe sobre todo en el borde, la sombra y el tono del panel. La prueba con un patrón sintético debajo comprueba cuánto se filtra por el panel. La distribución de la aplicación conserva el lugar aprobado para ambos tipos de navegación.

[Comparativas y mediciones](visual.md) · [Regresión funcional](funcional.md)

## Revisión del candidato

1. En móvil, recorré Inicio hasta que una sección con registros cruce el borde inferior. Compará la cápsula en Claro y Oscuro. Arrastrá la selección hacia otra pestaña y repetí con un arrastre corto.
2. En un iPhone con Safari, comprobá el giro, el teclado del compositor y de una propuesta, y que la barra deje lugar al área segura. WebKit de escritorio y las geometrías emuladas cubren la regresión automatizada. La aceptación del dispositivo físico requiere esa revisión.
3. En escritorio, alterná Claro, Oscuro y Sistema desde el lateral y recorré los destinos con Tab. El fondo habitual del lateral es uniforme. La captura sobre el patrón permite comparar el efecto cuando el fondo tiene textura.
