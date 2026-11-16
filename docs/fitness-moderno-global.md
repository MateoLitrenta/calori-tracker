# Fitness Moderno en las cuatro pestañas

## Diagnóstico previo

Base de comparación: `1011721` del PR #79. El recorrido auditado empieza en la aplicación autenticada y alcanza sus cuatro destinos, las hojas de registro y los diálogos de Perfil y Coach.

| Prioridad | Observación en la base | Causa | Intervención |
| --- | --- | --- | --- |
| Crítica | Claro conserva grandes bloques grafito en Inicio y controles oscuros en los portales. | El marcador y sus textos tienen un único tratamiento oscuro. Inicio, Coach, Perfil y la hoja móvil incluyen una clase dark local. | Resolver la apariencia en html. Diseñar la superficie y las tintas del marcador para ambos temas. |
| Crítica | Un día con movimiento y cero comidas destaca un saldo negativo. | DailyPanel ya conoce el estado provisional pero reutiliza el titular completo. | Usar la cobertura como titular y preservar el importe exacto en el desglose. |
| Alta | Al cambiar de pestaña cambian la navegación activa, los titulares y los controles. | Los tokens Fitness viven bajo Inicio. PremiumViews, DesktopExperience y HomeVariants contienen reglas de distintas generaciones. | Publicar los tokens desde la raíz, compartir navegación y retirar las hojas y compensaciones sustituidas. |
| Alta | Sistema sigue al dispositivo pero algunos elementos no siguen al documento. | ThemeProvider ya observa matchMedia. Las clases locales, los colores fijos y los portales contradicen esa decisión. | Conservar una sola preferencia persistida. Heredar el tema resuelto en superficies, portales y controles nativos. |
| Alta | Coach mezcla paletas en observación, mensajes, acciones, objetivos y cámara. | Reglas móviles dispersas, utilidades dark y correcciones específicas de Claro, incluso en Enviar. | Consolidar la presentación de Coach y sus diálogos preservando la lectura, el scroll y la confirmación. |
| Alta | Datos asocia un déficit con éxito y oculta parte de la cobertura en móvil. | Tintas semánticas propias y reglas que esconden el detalle. | Distinguir consumo, gasto, saldo y cobertura. Conservar cálculos, unidades y acceso al detalle. |
| Alta | Perfil y la confirmación de sesión lucen diferentes en ambos temas. | Fondos, colores y controles locales compiten con las utilidades de tema. | Agrupar identidad, preferencias y seguridad con campos, selección y diálogos del sistema compartido. |
| Media | Calendarios, estados de carga y controles secundarios parecen de otra generación. | Foco, rellenos, bordes y radios duplicados o fijos. | Compartir roles de color y control manteniendo las distinciones informativas de Historial. |

## Sistema visual y cambios por pantalla

El documento resuelve Claro, Oscuro o Sistema y publica los colores de fondo, superficie, texto, borde, acción, foco y estado. En Claro el marcador usa arena y tinta cobre. En Oscuro usa grafito y naranja luminoso. El naranja de relleno lleva una tinta oscura en ambos modos. La preferencia guardada se aplica antes de pintar React. En Sistema también se actualizan los controles nativos y los portales cuando el dispositivo cambia de tema.

Barlow Condensed identifica titulares, importes y fechas. El texto de conversación, la evidencia y las explicaciones conservan una tipografía de lectura. La navegación utiliza la misma selección en las cuatro pantallas. Las vistas conservan su composición y consumen los roles compartidos de [FitnessSystem.css](../src/FitnessSystem.css). Se retiró `PremiumViews.css` junto con las compensaciones de Claro que reemplazaban colores por pantalla.

| Pantalla | Cambio que se puede comprobar |
| --- | --- |
| Inicio e Historial | La misma cuenta pasa de un marcador oscuro en Claro a una superficie arena. El 13 de noviembre, con comidas, se mantienen 1.250 kcal consumidas, 2.281 estimadas y −1.031 de saldo. Al elegir el 11, con pasos y sin comidas, el titular indica «Sin comidas registradas». El gasto sigue visible y el saldo aritmético aparece al abrir el desglose. Historial usa una escala fría/cálida para el signo, con etiquetas y cobertura. |
| Coach | La observación abre la lectura, seguida de evidencia y sugerencias contextuales. En conversación, la tipografía de lectura y el compositor conservan su espacio. Cámara, audio, historial, propuestas, confirmaciones, objetivos y errores comparten colores y controles. |
| Datos | El promedio semanal de la cuenta sintética conserva −828 kcal/día sobre tres días con comidas. Consumo y gasto muestran sus respectivos denominadores. El gráfico comparte escala en kcal para ambas series, distingue el gasto mediante trama y permite seleccionar un período con teclado para consultar sus valores exactos. |
| Perfil | La identidad y los datos personales preceden a la apariencia y a la explicación del gasto. Cuenta, contraseña, sesión y zona de peligro mantienen sus controles propios. Las confirmaciones y los campos de edición siguen el tema incluso mientras están abiertos. |

## Comparación visual

Las láminas enfrentan el commit de referencia con esta revisión. Cada columna usa la misma fecha, la misma cuenta sintética, el mismo ancho y el mismo tema. Las carpetas de [referencia](evidence/fitness-global/before/) y [resultado](evidence/fitness-global/after/) incluyen también Sistema claro y Sistema oscuro.

| Pantalla | 375 × 812 | 1440 × 900 |
| --- | --- | --- |
| Inicio | [Móvil](evidence/fitness-global/comparisons/375-inicio.jpg) | [Escritorio](evidence/fitness-global/comparisons/1440-inicio.jpg) |
| Coach | [Móvil](evidence/fitness-global/comparisons/375-coach.jpg) | [Escritorio](evidence/fitness-global/comparisons/1440-coach.jpg) |
| Datos | [Móvil](evidence/fitness-global/comparisons/375-datos.jpg) | [Escritorio](evidence/fitness-global/comparisons/1440-datos.jpg) |
| Perfil | [Móvil](evidence/fitness-global/comparisons/375-perfil.jpg) | [Escritorio](evidence/fitness-global/comparisons/1440-perfil.jpg) |

## Recorridos y alcance de la evidencia

- **Apariencia y geometría.** La [matriz anterior](evidence/fitness-global/before/matrix.json) y la [del candidato](evidence/fitness-global/after/matrix.json) cubren Inicio, Coach, Datos y Perfil a 320, 375, 393, 440, 768 y 1440 px. Cada ancho se prueba en Claro, Oscuro, Sistema con dispositivo claro y Sistema con dispositivo oscuro. El gráfico conserva desplazamiento propio en anchos estrechos. Los [recorridos de apariencia](evidence/fitness-global/interactions/) cubren cambio en vivo, formulario abierto, diálogo, recarga y navegación.
- **Registros.** Los [13 recorridos de Inicio](evidence/fitness-global/home-journeys/journeys.json) ejercitan fecha activa, captura y edición, calendario, hábitos, reintento, cambio de cuenta y controles de borrador. La prueba local del panel también exige que el saldo provisional sea exacto y quede dentro del desglose cerrado.
- **Datos y Perfil.** Se comparan uno a uno promedios, cobertura, denominadores y valores de las barras entre ambas revisiones para dos cuentas y tres períodos. Los recorridos usan interacción real de teclado y prueban errores y reintentos, además de las operaciones de foto con un archivo sintético. [Paridad numérica](evidence/fitness-global/numerical-parity.json) · [Comprobaciones](evidence/fitness-global/views-flows/checks.json).
- **Coach.** La observación, las sugerencias, la evidencia y el compositor se renderizan desde la aplicación. Las confirmaciones de registros y objetivos atraviesan el controlador de la interfaz. Las respuestas del transporte de IA, la cuota y los dispositivos de captura se simulan de forma explícita. En los dos recorridos (375 claro y 1440 oscuro) abrir Coach generó cero peticiones automáticas. Cada recorrido incluyó cinco solicitudes explícitas simuladas, un registro confirmado y tres cambios de objetivo con confirmación. [Recorridos del Coach](evidence/fitness-global/coach-flows/results.json).
- **Legibilidad.** El contraste se mide sobre elementos renderizados en los dos temas. Las 32 muestras pasaron el umbral correspondiente a su tamaño. Las mediciones, sus colores y sus umbrales están disponibles en el [informe de contraste](evidence/fitness-global/contrast.json).

### Reproducción

Con dependencias del lockfile instaladas y Playwright/Chromium disponible, abrir una terminal por servidor. Los dos servidores escuchan sólo en loopback. `PLAYWRIGHT_MODULE` acepta la ruta absoluta al módulo Playwright instalado. `QA_BROWSER_CHANNEL` permite especificar el canal de Chromium.

```sh
node scripts/home-mobile/serve-qa.mjs --before-global
node scripts/home-mobile/serve-qa.mjs --global
```

Con ambos activos, ejecutar los siguientes comandos desde la raíz del repositorio.

```sh
node scripts/fitness-global/matrix.mjs --before
node scripts/fitness-global/matrix.mjs
node scripts/fitness-global/numeric-parity.mjs
node scripts/fitness-global/journeys.mjs
node scripts/fitness-global/readability.mjs
node scripts/fitness-global/views-flows.mjs
node scripts/fitness-global/coach-flows.mjs
node scripts/home-mobile/audit-journeys.mjs --global
node scripts/fitness-global/boards.mjs
```

La suite Linux del PR usa PostgreSQL y PostgREST descartables. Su artefacto contiene el SHA, el manifiesto de archivos ejecutados, resultados completos y focalizados, los tres chequeos TypeScript, lint, build y diff. El PR enlaza la ejecución del HEAD publicado y la Preview correspondiente.

### Límites de validación

El navegador usa Chromium con viewport y apariencia emulados. Los límites de sesión, escritura remota, Storage y transporte de IA responden con datos de prueba. La evidencia visual y los contadores de apertura describen ese entorno. Gemini real, dispositivos de cámara y micrófono, Safari/iOS con teclado nativo y lectores de pantalla físicos requieren validación separada. La validación de esta iteración termina en Preview.

La inspección de las capturas motivó correcciones concretas. Historial perdió el verde asociado al déficit alto, Datos identifica el saldo bajo las barras incluso en móvil y el aviso transitorio de cuota del Coach se ubica por encima del compositor. Al expandir evidencia antes del primer mensaje, la primera sugerencia permanece visible. El menú de adjuntos y el diálogo de cámara se comprobaron con teclado.
