# Premium Design V4 — Inicio desktop

Continuación del PR #63, rama `codex/desktop-premium-polish-v3`. Esta fase modifica exclusivamente la presentación de Inicio y sus pruebas. Datos, Perfil, Coach, estilos globales, cálculos, servicios y persistencia permanecen fuera del cambio.

## Auditoría y decisiones

La inspección inicial en 1920×1080, 1440×900, 1366×768 y 1280×720 confirmó que las tarjetas de hábitos heredaban la altura del balance mediante `stretch`, `h-full` y `justify-between`. Sus acciones ocupaban todo el ancho, mientras los valores tenían sólo 20 px. Los radios dependían de los tokens globales 24/18/14. Dos o tres registros seguían en una columna, y la lista completa desplazaba el calendario muy abajo.

Se conserva la composición de tres filas: resumen/hábitos, journal y calendario anual de ancho completo. El bloque desktop existente en `HomeVariants.css` se consolida sin añadir otra capa de overrides ni modificar tokens globales.

- **Hábitos:** altura natural de aproximadamente 152 px, valores tabulares de 26 px y acciones secundarias de ancho contenido. Los targets mantienen al menos 44 px de alto; las etiquetas y nombres accesibles siguen presentes. Agua, Pasos y Peso conservan todos sus handlers y edición exacta.
- **Energía:** balance de hasta 52 px, métricas secundarias de 24 px/26 px de interlínea, menor separación y desglose sin margen extra. La altura resulta del contenido; no se estira la otra columna para igualarla.
- **Sistema local:** radios Home de 20/14/12/3 px para paneles, tarjetas interiores, controles y celdas; padding y separación principal de 20 px, inset de 12 px. Se mantienen colores, bordes, identidad y reglas globales de movimiento reducido.
- **Historial:** conserva 53 semanas, celdas cuadradas responsivas, meses y días alineados, leyendas, selección, tooltips y lógica temporal. No se cambian cálculos ni datos históricos.

## Registros y expansión accesible

Desde 1280 px, dos registros ya utilizan dos columnas; tres forman una fila completa y otra parcial. El orden del DOM sigue siendo cronológico y común a comidas y ejercicios.

Se eligieron **cuatro registros iniciales** porque dos filas normales ocupan aproximadamente **146 px**. Esto mantiene una consulta útil del día y acerca el historial sin introducir una lista con scroll interno. Con ocho registros, el journal colapsado mide 300 px incluyendo encabezado, acciones y control de expansión. Los textos largos pueden aumentar la altura naturalmente.

El helper presentacional `DailyRecords` conserva todos los registros en el mismo `ul`; sólo CSS desktop oculta los adicionales cuando están colapsados. El botón nativo «Ver todos los registros (N)»/«Mostrar menos» expone `aria-expanded` y `aria-controls` con ID estable. Al contraer, el foco permanece en el control. La expansión utiliza el scroll principal y no recorta contenido. Una transición breve reutiliza el movimiento existente y respeta `prefers-reduced-motion`. El toggle detiene la propagación de su clic para que el listener existente de clic externo no descarte un borrador abierto; expandir y contraer conserva el mismo formulario y texto, comprobado en navegador.

La clave de perfil/fecha está únicamente en ese helper: reinicia la expansión sin remontar `DailyPanel`, formularios ni temporizadores de Agua/Pasos. Editar no reinicia la expansión ni modifica el orden. Cada registro ahora contiene un botón nativo de tarjeta completa con el mismo handler de detalle; mantiene semántica de lista y acceso por teclado a edición/eliminación.

Por debajo de 1280 px se muestran **todos** los registros y el botón de expansión permanece oculto. No se incorpora `matchMedia`, filtrado de datos ni persistencia del estado visual. El padding y espaciado móvil se conservan al trasladar la interacción del `li` al botón. La captura comparable de 375×812 es idéntica antes y después (SHA-256 registrado en las mediciones).

## Verificación visual real

Se conservaron capturas anteriores y posteriores de navegador real con los componentes de la aplicación. Los registros, cuenta, historial anual y servicios del fixture son **sintéticos**; no acreditan uso de Supabase/Gemini reales ni una sesión autenticada en Preview. El fixture y las mediciones permanecen fuera del producto.

La matriz contiene **64 casos**: ocho escenarios —vacío, uno, dos, tres, cinco, ocho, 32 registros con textos/cifras extensos e historial escaso— en 1920×1080, 1440×900, 1366×768, 1280×720, 768×1024, 430×932, 375×812 y 320×740. No se detectó overflow horizontal global. La lista conserva `overflow: visible`; las cuatro vistas desktop muestran cuatro de ocho registros inicialmente, y las cuatro vistas estrechas muestran los ocho sin toggle.

En 1440×900, el historial con ocho registros empieza aproximadamente en **572 px**, frente a **723 px** antes, y termina en 894 px. Cabe completo en 1920×1080 y 1440×900; en 1366×768 y 1280×720 permite unos 117/153 px de scroll natural antes que recortar contenido. Las descripciones y cifras extensas pueden requerir más altura. El calendario no necesita desplazamiento horizontal en los cuatro escritorios; en pantallas estrechas mantiene su scroll propio.

Evidencia en `docs/screenshots/home-premium-v4/`:

- Vacío: [antes](screenshots/home-premium-v4/before-empty-1440.jpg) · [después](screenshots/home-premium-v4/after-empty-1440.jpg).
- Tres registros: [antes](screenshots/home-premium-v4/before-three-1440.jpg) · [después](screenshots/home-premium-v4/after-three-1440.jpg).
- Ocho registros: [antes](screenshots/home-premium-v4/before-eight-1440.jpg) · [colapsados](screenshots/home-premium-v4/after-eight-1440.jpg) · [expandidos](screenshots/home-premium-v4/after-eight-expanded-1440.jpg).
- [Historial anual en 1920 px](screenshots/home-premium-v4/after-eight-1920.jpg), [móvil de 375 px](screenshots/home-premium-v4/after-eight-375.jpg) y [textos/cifras extensos](screenshots/home-premium-v4/after-large-1440.jpg).

El [resumen de 64 mediciones y targets](screenshots/home-premium-v4/measurements.json) acompaña las capturas. Las matrices completas se conservan en `work/home-premium-v4-visual/`, fuera del producto.

## Validaciones y pendientes

- Pruebas de Inicio: **32 aprobadas dentro de la suite final**, con expansión/contracción, orden temporal, estado vacío, edición visible/expandida, aislamiento del estado por fecha, ARIA y comportamiento móvil simulado.
- TypeScript de frontend, `api/ai` y `api/coach`: aprobado, exit 0.
- Lint: aprobado, exit 0, sin errores; 13 advertencias preexistentes.
- Build: aprobado, exit 0; permanece el aviso preexistente de chunk superior a 500 kB.
- Suite completa final: **326/326 aprobadas**, sin fallos, cancelaciones ni omisiones; incluye PostgreSQL/RLS nativo y HTTP serverless compilado. Se adaptaron dos selectores del test de integración Home/Coach al nuevo botón nativo; no cambió el producto Coach. La regresión adicional prueba que expandir/contraer no descarta borradores.
- `git diff --check`: aprobado. El checkpoint y la evidencia se publican en el mismo PR #63; el enlace/estado del Preview se informa en la descripción del PR y en la entrega.

Quedan pendientes la aprobación visual del usuario y una sesión real autenticada en Preview. No se afirma validación con teclado móvil físico ni zoom nativo al 125 %/150 %; requieren comprobación manual. No se aplican migraciones remotas, cambios de configuración remota, modificaciones de Production ni merge automático. Las pruebas de PostgreSQL utilizan una base local desechable.
