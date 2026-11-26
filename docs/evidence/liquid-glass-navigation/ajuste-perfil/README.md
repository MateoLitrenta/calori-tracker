# Liquid Glass · Ajuste de Perfil

El punto de comparación es `397a5d258c39c1cfc4309d28626bbd93fe201d4f`, con el material y el arrastre ya aprobados.

## Causa reproducida

En móvil, Perfil reservaba el espacio inferior con un margen en `.app-main`. Como ese elemento también tiene `overflow-y: auto`, el margen acortaba el área visible de las tarjetas. A 390 × 844 px en Claro, el área terminaba en y = 780 px y el vidrio empezaba en y = 782 px. La caja de «Cuenta y seguridad» se extendía más abajo, pero a media altura de la cápsula el navegador solo encontraba los contenedores del fondo. El desenfoque tomaba los píxeles del borde del recorte y dejaba una banda en la parte superior del vidrio.

A la misma posición de scroll, hacer transparentes los bordes de la tarjeta y sus filas conservó el recorte horizontal. Al mover la reserva al interior de `.app-main`, la tarjeta pudo pasar detrás de la cápsula. Se siguen viendo sus contornos y divisores suavizados según el contenido que esté pasando.

## Corrección

Perfil móvil usa `--glass-nav-reserve` como relleno inferior de su área desplazable. La reserva toma la altura de la cápsula, su separación y el área segura. El mismo valor se aplica a `scroll-padding-block-end` para que los controles enfocados puedan quedar por encima del vidrio. En la reproducción de 390 px, el rango máximo se mantuvo en 210 px. La comprobación del final incluye el último control de Perfil con «Gestión de datos» plegada y desplegada.

El ajuste de composición está localizado en Perfil móvil. Se usa la misma cápsula, con sus radios, color, filtros y comportamiento, en las cuatro secciones.

[Comparativas y mediciones](visual.md) · [Pruebas funcionales](funcional.md)

La evidencia usa perfiles y registros sintéticos en Chrome y WebKit. En Safari de iPhone físico quedan por revisar el fondo durante el desplazamiento, las barras dinámicas, las áreas seguras y el gesto nativo.
