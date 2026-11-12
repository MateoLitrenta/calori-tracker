# Evidencia visual V9.3

Todas las imágenes usan datos sintéticos locales. No se copiaron capturas del video original ni datos de usuarios.

Se verificaron 36 combinaciones antes y 36 después: Inicio, Datos y Coach en 320, 375, 393, 430, 768 y 1440 px, con temas claro y oscuro. Los viewports móviles usaron 852 px de altura; tablet 768×1024 y desktop 1440×900. Además se probaron 320×568 en ambos temas. Fecha fija del fixture: 12 de noviembre de 2026.

Baseline: `f9ba47438c7f1408e305ac167aa0407f3dd07b70`. Fuente final de aplicación: `d622c124b4c1545b600b36ef8b364543776354f2`. Las utilidades numéricas y el store React son los reales; Auth, RPC de registros, Storage y Gemini se simularon. Estas capturas no certifican esos servicios. Las pruebas reales de PostgreSQL/PostgREST se informan por separado en el reporte técnico del PR. No se utilizó Production.

## Comparativas

- Inicio 393 claro: [antes](before-home-light-393.png) · [después](after-home-light-393.png).
- Inicio 1440 oscuro: [antes](before-home-dark-1440.png) · [después](after-home-dark-1440.png).
- Datos 393 claro, resumen mensual: [antes](before-data-light-393.png) · [después](after-data-light-393.png).
- Datos 1440 oscuro, resumen mensual: [antes](before-data-dark-1440.png) · [después](after-data-dark-1440.png).
- Coach 393 claro, propuesta pendiente: [antes](before-coach-light-393.png) · [después](after-coach-light-393.png).
- Coach 1440 oscuro, propuesta pendiente: [antes](before-coach-dark-1440.png) · [después](after-coach-dark-1440.png).

## Interacciones

Se completaron 16 recorridos adicionales: hábitos en seis anchos y ambos temas, diálogo corto en ambos temas y repetición de propuestas del Coach con nueva entrada similar autorizada explícitamente. Se verificó guardado pendiente sin anunciar éxito, cambios rápidos de pasos y agua, cambios durante un guardado, conservación del borrador ante respuesta no confirmada, reintento explícito, conflicto que exige revisión y ausencia de envíos simultáneos o confirmaciones nativas.

El diálogo muestra guardado/borrador, captura Tab y Shift+Tab, conserva el borrador al presionar Escape o Conservar borrador, restaura el foco y permite aplicar valores revisados. En 320×568 el contenido tiene scroll y las acciones finales permanecen alcanzables.

- Diálogo 393: [oscuro](dialog-dark-393.png) · [claro](dialog-light-393.png).
- Acciones alcanzables en 320×568: [oscuro](dialog-short-dark-320x568.png) · [claro](dialog-short-light-320x568.png).

También se verificó que seleccionar un día histórico actualiza la fecha junto a los registros, la descripción accesible de las acciones y la fecha del formulario, sin iniciar guardados. La navegación por teclado entre Datos, Coach e Inicio se probó en móvil y escritorio. El sidebar de escritorio mantiene su contrato previo: estado activo visual, sin `aria-current`; no se presenta como una regresión ni como una certificación de ese atributo.

## Resultados y límites

Cero errores JavaScript, cero desbordamientos horizontales de página y cero peticiones externas intentadas en la matriz final. Los datos completos están en [responsive-matrix.json](responsive-matrix.json), [interaction-checks.json](interaction-checks.json), [target-checks.json](target-checks.json) y [navigation-checks.json](navigation-checks.json). El gate separado de Linux y servicios de base de datos se resume en [quality-results.json](quality-results.json). No se certifican teléfono físico, teclado virtual nativo ni lectores de pantalla mediante estas pruebas de navegador.
