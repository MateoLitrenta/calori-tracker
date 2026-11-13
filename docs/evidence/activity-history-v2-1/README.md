# Historial 2.1 — evidencia visual

Fuente final: `8cf38cd867568214bd011dde6387747f228b2efe`, árbol `src` `10287d5ecd0f8df8280e498a5355e1c232d606f2`. Antes: `72021c2` (Historial 2.0 integrado). Las capturas y la grabación final se realizaron con la fuente congelada y sin modificaciones pendientes de `src`.

## Comparación

Los siguientes pares usan los mismos datos numéricos sintéticos. El día seleccionado es el 12 de noviembre de 2026, fecha fija del fixture. No representan cuentas ni actividad real.

- Mes, móvil claro: [antes](before/month-light-393.png) · [después](after/month-light-393.png).
- Semana, móvil claro: [antes](before/week-light-393.png) · [después](after/week-light-393.png).
- Año, móvil claro: [antes](before/year-light-393.png) · [después](after/year-light-393.png).
- Mes, escritorio oscuro: [antes](before/month-dark-1440.png) · [después](after/month-dark-1440.png).
- Semana, escritorio oscuro: [antes](before/week-dark-1440.png) · [después](after/week-dark-1440.png).
- Año, escritorio oscuro: [antes](before/year-dark-1440.png) · [después](after/year-dark-1440.png).
- Variantes adicionales: [Mes móvil oscuro](after/month-dark-393.png) · [Año escritorio claro](after/year-light-1440.png).
- Estados específicos: [actividad sin comidas, neutral](states/partial-light-393.png) · [balance cero](states/equilibrium-light-393.png).

## Grabación real

[Transiciones de Semana, Mes y Año: 25,83 s, 30 fps](transitions-mobile.mp4).

Son cuadros reales de Chrome CDP, codificados a 30 fps con repetición del último cuadro recibido para conservar la duración real de las pausas; no hay cuadros de animación inventados. No se aplicaron estilos de captura durante la interacción ni la grabación. El codificador agrega un píxel a la derecha (393 → 394) por el formato de video, sin escalar el contenido. La decodificación completa aprobó. Una muestra de 0,35 s de la primera transición contiene 11 cuadros, 11 diferentes.

El video muestra retroceso y avance de meses/semanas, el cambio entre escalas, la entrada desde Año a Mes, el detalle de fútbol/gimnasio/natación y un día parcial sin comidas. La prueba de clics rápidos, foco y movimiento reducido se conserva en el manifiesto, separada del recorrido visual del video.

## Datos y controles

- Agosto: 31/31 días con comidas, promedio oficial +450 kcal/día; septiembre: 30/30 y −300 kcal/día. Octubre y noviembre incluyen días con ejercicio o pasos sin comidas: su promedio usa la base energética original y aparece provisional, neutral.
- Noviembre cubre déficit alto/moderado/leve, superávit, balance cero, día sin registros, agua/peso sin energía, actividad sin comidas, futuro y múltiples entrenamientos. Fútbol americano conserva el indicador genérico del clasificador existente.
- Los importes de las comidas se construyen con los helpers energéticos actuales del producto; no se reemplazan fórmulas ni denominadores. Tener comidas no certifica un registro alimentario completo.
- Capturas: 12 combinaciones finales de tres vistas × 393/1440 px × ambos temas y las mismas 12 antes. Se publica una selección compacta; el manifiesto incluye la matriz completa. Cero desbordes horizontales, errores JS, llamadas externas o escrituras.
- Estados y deportes: 144 comprobaciones en 320/393/768/1440 px y ambos temas. Navegación y movimiento: 40 comprobaciones en 393/1440 px y ambos temas, con animaciones WAAPI reales de 210 ms, foco conservado, clics rápidos y cambio de preferencia de movimiento reducido durante una animación.
- Contraste calculado sobre colores CSS compuestos reales: 12 combinaciones, mínimo 7,073:1 en claro y 6,579:1 en oscuro para textos muestreados; 16 estados seleccionados, mínimo 3,740:1 y 4,706:1 para el borde naranja. Los controles y rótulos accesibles se verifican en el navegador. Esto no certifica WCAG de toda la aplicación ni sustituye una prueba física con lector de pantalla.

## Alcance y reproducción

El navegador ejecuta React, el store, los helpers y las animaciones reales del producto. Auth, Supabase/RPC, Storage y Gemini están sustituidos por fixtures sintéticos locales; el tráfico externo está bloqueado. Esto valida presentación e interacción, sin certificar servicios remotos. No se accede a Production ni se guardan registros reales.

Para imágenes completas del componente se despliegan temporalmente los contenedores de scroll de la aplicación, se oculta la navegación inferior y se conserva el ancho medido del historial. La geometría, interacciones y controles se miden antes de esos estilos, que se retiran después de cada captura. El video conserva el layout y el scroll originales, incluida la navegación inferior.

[Manifiesto de verificaciones](validation.json) · [Suite Linux y calidad](quality-results.json) · [Integridad SHA-256](SHA256SUMS.txt).

Los archivos de texto de esta evidencia conservan finales de línea LF mediante `.gitattributes`, para que sus hashes coincidan en Windows y Linux.

Pendientes para aprobación visual: revisión humana del Preview y comprobación en dispositivos físicos/lectores de pantalla. No se declara probado un servicio real mediante estos fixtures.
