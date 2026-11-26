# Liquid Glass · Navegación de Calori

[Ajuste de Perfil](ajuste-perfil/README.md) · [Refinamiento final de translucidez](iteracion-final/README.md)

[Iteración 2 · Espesor óptico y arrastre](iteracion-2/README.md)

Comparación con `80c9a1500b68d877e1de5c57c4f6eae8f7a431fa`, merge del PR #102. Las capturas y los recorridos usan el mismo contenido sintético en la referencia y el candidato. [Propuesta de diseño y referencias oficiales](diseno.md)

## Decisiones de implementación

| Área | Decisión |
| --- | --- |
| Móvil | La cápsula se ubica dentro de los márgenes laterales y por encima del área segura. Mide 56 px de alto en el tamaño normal. Radio exterior de 28 px e interior de 24 px. La altura y los radios acompañan la ampliación de texto. |
| Escritorio | El lateral mide 244 px y deja 12 px antes del panel, dentro del mismo ancho total de 256 px. El radio exterior de 26 px y el relleno de 12 px dejan un radio interior de 14 px. El encabezado y las acciones de cuenta quedan en sus grupos. |
| Material | Superficie translúcida con 84 % de `--fit-surface` en la cápsula y 90 % en el lateral. El desenfoque tiene 14 px y solo se aplica a estas superficies cuando el navegador lo admite. La sombra y la reflexión interior definen su borde sin animar el desenfoque. |
| Selección | La tinta usa `--fit-orange` y `--fit-board`. El gradiente mezcla entre 63 y 78 % de naranja en Claro y entre 38 y 47 % en Oscuro, donde el borde usa el naranja de marca. Los iconos rellenos y `aria-current` identifican el destino activo. |
| Movimiento | La posición depende del destino aceptado por App. Móvil traduce el indicador según la columna. Escritorio reutiliza `SelectionIndicator`. Movimiento reducido elimina la interpolación. |
| Alternativas | Superficie opaca sin desenfoque y con contraste aumentado o transparencia reducida. Los colores forzados usan `Canvas`, `Highlight` y `HighlightText`. |

## Evidencia

| Escena de Inicio | Antes | Después |
| --- | --- | --- |
| 390 px, Claro | [Cápsula de referencia](before/inicio-390-light.jpg) | [Cápsula](after/inicio-390-light.jpg) |
| 390 px, Oscuro | [Cápsula de referencia](before/inicio-390-dark.jpg) | [Cápsula](after/inicio-390-dark.jpg) |
| 1440 px, Claro | [Lateral de referencia](before/inicio-1440-light.jpg) | [Lateral](after/inicio-1440-light.jpg) |
| 1440 px, Oscuro | [Lateral de referencia](before/inicio-1440-dark.jpg) | [Lateral](after/inicio-1440-dark.jpg) |

[Capturas, videos y mediciones responsive](visual.md) · [Selección, teclado, Coach y formularios](funcional.md)

La reserva nominal de Coach se obtiene de la altura real de la cápsula más sus separaciones. Sigue siendo 64 px con tamaño de texto normal y sin área segura adicional, y se libera cuando se abre el teclado. El contenedor conserva los selectores que lo ocultan o vuelven inerte según la vista.

## Coste del material

A 390 × 844 px, la caja de la cápsula mide 370 × 56 px, aproximadamente el 6,3 % del viewport. A 1440 × 900 px, el lateral mide 244 × 876 px, aproximadamente el 16,5 %. Solo se muestra una superficie con desenfoque por tamaño de pantalla. El indicador desplaza su capa con una transformación y el desenfoque mantiene el mismo radio durante la interacción. Las cifras describen el área del rectángulo filtrado, sin estimar memoria gráfica, batería ni rendimiento en un dispositivo físico.

## Revisión desde iPhone y escritorio

1. En la Preview, comparar el código de Perfil con el indicado en el PR. En Inicio, desplazar el contenido bajo la cápsula y alternar Inicio, Coach, Datos y Perfil. Revisar Claro, Oscuro y Sistema. En iPhone, probar las barras de Safari expandidas y contraídas y observar que la cápsula queda por encima del indicador de inicio.
2. En Coach, partir de una conversación con registros sintéticos o de prueba. Abrir y cerrar el teclado en el compositor, girar con el teclado abierto y repetir en la edición de una propuesta. Revisar el campo activo, la posición de lectura y la restauración de la barra. Enviar solo desde una cuenta autorizada para esa comprobación.
3. En escritorio, alternar destinos con Tab y Enter. Abrir Cambiar Tema y escoger Sistema. Comprobar el indicador activo, el foco y el acceso a la zona de cuenta con la ventana baja o el texto ampliado.

Las trazas Chrome y WebKit simulan la geometría del teclado. La correspondencia con las barras nativas, el indicador de inicio y el coste gráfico en un iPhone físico queda para la revisión en dispositivo.
