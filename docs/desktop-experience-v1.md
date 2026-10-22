# Desktop Experience v1

La sección inicial conserva el cierre de V1. El estado y la evidencia de la segunda iteración están en **Visual Polish V2**, al final de este documento.

Base: `main` en `6b4f2d1`, incluyendo PR #61. Rama: `codex/desktop-experience-v1`.

## Distribución

Antes, Inicio, Datos y Perfil estaban limitados a unos 896 px y apilados. Coach tenía un máximo de 768 px y usaba el scroll exterior en escritorio.

- **Inicio:** grid desde 1280 px, con balance y hábitos en paralelo; acciones/registros a la izquierda e historial a la derecha. Balance más compacto, cifras completas, registros con scroll interno y palabras sin espacios que se ajustan al ancho. Los formularios abiertos pueden ocupar toda la fila y hacer crecer la página naturalmente.
- **Datos:** resumen y gráfico en paralelo, actividad y comparación debajo. La leyenda pasa al encabezado del gráfico, conservando sus barras de al menos 220 px, selección, detalle, métricas y animación del período. Los números grandes no se eliden.
- **Perfil:** datos personales a la izquierda; cuenta, preferencias y zona de peligro diferenciada a la derecha. Reutiliza los mismos formularios, mensajes y acciones, sin cambiar validaciones ni guardado.
- **Coach:** máximo de 1150 px y altura útil del contenedor. Cabecera y compositor fuera del scroll; solo se desplazan los mensajes. Burbujas con ancho de lectura acotado y tarjetas estructuradas más amplias. El observador también sigue el crecimiento tardío del contenido; conserva el final si el lector estaba cerca, sin arrastrarlo cuando lee mensajes anteriores.

Las distribuciones en paralelo de Inicio/Datos/Perfil empiezan en el breakpoint `xl` (1280 px). Por debajo siguen las columnas anteriores. Coach usa su contenedor independiente desde `md` (768 px); móvil conserva la estructura de teclado y bottom sheets existente. No se añaden alturas rígidas a los paneles normales ni nuevas animaciones; permanecen las reglas globales de movimiento reducido.

## Alcance y archivos

Producción: `src/DesktopExperience.css`, su importación en `src/App.tsx`, clases de distribución en `src/components/DailyPanel.tsx` y `src/components/ProfileView.tsx`, y contenedor/anclaje de scroll en `src/components/ChatView.tsx`.

Pruebas: `tests/desktop-experience.test.mjs`, `tests/coach-store-sync.test.mjs`, casos de anclaje de tarjetas y texto en `tests/chat-view.test.mjs`, y actualización del selector del contenedor en `tests/daily-panel.test.mjs`. Documentación y nueve capturas en `docs/screenshots/desktop-experience-v1/`.

No cambian fórmulas, datos, estadísticas, autenticación, persistencia, endpoints, prompts, cuotas ni cálculo/confirmación de objetivos. Se reutilizan DailyPanel, Heatmap, ChartsView, ProfileView, los controles de Coach, CoachGoalCard y EntryFormShell. La Sidebar conserva su ancho y comportamiento.

`work/prepare-desktop-fixture.cjs` y el servidor derivado son herramientas temporales fuera del repositorio de Calori. No se importan ni se incluyen en el build. Permanecen disponibles en el workspace; no se eliminan archivos del usuario.

## Evidencia visual real

Capturas de un navegador real sobre Vite y los componentes de la aplicación, con cuenta, registros, objetivos y servicios **sintéticos**. No son mockups, pero tampoco demuestran una sesión real de Supabase/Gemini ni persistencia en Production.

- 1920 × 1080 y 1440 × 900: las tres pantallas normales completas sin scroll exterior con el conjunto de prueba; Coach con conversación larga, cabecera/compositor visibles y un solo scroll interno.
- 1366 × 768: Inicio y Perfil completos. Datos conserva aproximadamente 102 px de scroll natural.
- 1280 × 720: Inicio completo. Datos conserva aproximadamente 183 px de scroll y Perfil unos 28 px. Se priorizan tipografía y gráfico legibles; no se recortan paneles para forzarlos dentro del viewport.
- Móvil: 320 × 760, 375 × 812 y 430 × 900. Tablet: 768 × 1024 y 1024 × 768. Sin scroll horizontal global en las cuatro vistas. Las pantallas normales mantienen su desplazamiento vertical; Coach conserva compositor y navegación visibles.
- Se comprobó Escape y restauración de foco al cerrar Mis objetivos, lectura de mensajes antiguos sin mover la página, edición de Perfil con Guardar visible, una lista de 32 registros, cifras de siete dígitos, palabras sin espacios y un formulario con treinta líneas.

Capturas principales:

- [Inicio desktop](screenshots/desktop-experience-v1/home-1440x900.jpg)
- [Datos desktop](screenshots/desktop-experience-v1/charts-1440x900.jpg)
- [Perfil desktop](screenshots/desktop-experience-v1/profile-1440x900.jpg)
- [Coach con conversación extensa](screenshots/desktop-experience-v1/coach-1440x900.jpg)
- [Mis objetivos](screenshots/desktop-experience-v1/goals-1280x720.jpg)
- [Inicio móvil](screenshots/desktop-experience-v1/home-375x812.jpg)
- [Coach móvil](screenshots/desktop-experience-v1/coach-375x812.jpg)
- [Perfil en edición](screenshots/desktop-experience-v1/profile-edit-1440x900.jpg)
- [Texto, cifras y lista extensos](screenshots/desktop-experience-v1/home-large-1280x720.jpg)

## Validaciones y pendientes

TypeScript de frontend y ambos endpoints aprobado. Lint aprobado con los 13 avisos preexistentes. Build aprobado con el aviso existente de bundle superior a 500 kB. `git diff --check` aprobado.

La primera suite completa detectó un selector de prueba demasiado estricto por la nueva clase `daily-entry`; se actualizó sin cambiar el comportamiento de cierre del formulario. PostgreSQL nativo y HTTP serverless inicialmente quedaron bloqueados por `EACCES` en loopback y se repitieron con el permiso de red local habilitado. **Resultado final: 319/319 pruebas aprobadas, sin fallos ni omisiones**, incluyendo el anclaje de respuestas de texto y tarjetas, PostgreSQL/RLS y HTTP serverless compilado.

Pendientes de aceptación: aprobación visual del usuario en Preview, sesión real autenticada y teclado virtual físico. El navegador automatizado no aplicó el atajo de zoom; **no se afirma validación real al 125 % o 150 %**. No se emuló la preferencia de movimiento reducido del sistema; las reglas existentes siguen presentes y no se agregan animaciones.

El PR queda en borrador, sin merge. No se ejecutan migraciones ni se cambian variables remotas, Production o base de datos.

## Visual Polish V2

Misma rama y PR #62; se conserva la arquitectura. Cambios de producción únicamente en `DesktopExperience.css` y dos envoltorios de presentación en `DailyPanel.tsx` y `ChartsView.tsx`. No se modifica Coach, Perfil, sus handlers, servicios ni datos.

- **Inicio:** acciones y registros comparten ahora una tarjeta `daily-journal`, con separación interna de 16 px. Ambas columnas inferiores empiezan en la misma fila; desaparece la fila independiente que dejaba un hueco entre botones y lista. El historial comparte padding, radio y encabezado con el resto. Su desplazamiento horizontal permanece dentro del heatmap. Si se abre el formulario de escritorio, la tarjeta ocupa toda la fila sin comprimir los campos.
- **Datos:** columnas 1:1,15; balance a 52 px y métricas secundarias a 28 px. Resumen/gráfico y actividad/comparación comparten filas, padding y superficies. El gráfico tiene barras más proporcionadas. La ayuda y el detalle ocupan el mismo espacio mínimo: 8 rem en semana y 10 rem en mes/año; el área puede crecer si el contenido lo requiere, sin recortar cifras. Seleccionar un período conserva las métricas y evita el salto de las tarjetas inferiores.
- **Perfil:** se elimina el span de tres filas de los datos personales. Preferencias queda debajo de identidad/datos, con una tarjeta equivalente a Cuenta y seguridad. Zona de peligro tiene borde y título más discretos; conserva icono, advertencia de borrado permanente, botón rojo y confirmación. No cambian campos, formularios ni persistencia.
- **Sistema compartido:** separación exterior y padding de 24 px, separación interior de 16 px y títulos de 17 px. Se reutilizan `--radius-panel`, `--radius-widget` y los colores existentes de cada vista. Las reglas nuevas se aplican desde 1280 px, sin márgenes compensatorios, reordenamiento CSS ni alturas rígidas de tarjetas. Los envoltorios mantienen la distribución móvil anterior.

### Comparación y capturas V2

Se conservaron las nueve capturas de V1 como referencia anterior. Nuevas capturas de navegador real sobre los mismos componentes y datos sintéticos, sin servicios remotos:

- Inicio: [antes](screenshots/desktop-experience-v1/home-1440x900.jpg) · [después](screenshots/desktop-experience-v1/v2-inicio-1920x1080.jpg).
- Datos: [antes](screenshots/desktop-experience-v1/charts-1440x900.jpg) · [después](screenshots/desktop-experience-v1/v2-datos-1920x1080.jpg) · [detalle seleccionado](screenshots/desktop-experience-v1/v2-datos-seleccion-1440x900.jpg).
- Perfil: [antes](screenshots/desktop-experience-v1/profile-1440x900.jpg) · [después](screenshots/desktop-experience-v1/v2-perfil-1920x1080.jpg).
- Coach: [antes](screenshots/desktop-experience-v1/coach-1440x900.jpg) · [arquitectura conservada](screenshots/desktop-experience-v1/v2-coach-1920x1080.jpg).
- Móvil: [Inicio](screenshots/desktop-experience-v1/v2-inicio-375x812.jpg) · [Coach](screenshots/desktop-experience-v1/v2-coach-375x812.jpg).

Las cuatro vistas se comprobaron a 1920×1080, 1440×900, 1366×768 y 375×812: sin overflow horizontal global o del main. Inicio y Perfil sin scroll exterior en los tres escritorios; Coach conserva cabecera/compositor y solo desplaza mensajes. Datos permite scroll natural: aproximadamente 40 px en semana a 1440×900 y 165 px a 1366×768. Mes/año necesitan algo más por sus etiquetas y cobertura. Se prioriza legibilidad sobre forzar todo dentro de una ventana baja.

En 1440 px, seleccionar el gráfico en semana, mes y año cambió la posición de la fila inferior menos de 0,1 px (animación de período); en semana a 1366 px no la desplazó. Se comprobó edición/cancelación de Perfil y apertura/cierre con Escape del bottom sheet de comida en móvil. El teclado virtual físico y la sesión autenticada real en Preview siguen pendientes. No se investigaron fallos de IA de configuración remota.

### Validación V2

- Suite completa: **319/320 aprobadas**, cero omitidas. El nuevo caso comprueba que foco/selección reutilizan el área de detalle en semana/mes/año, conservan cifras y no alteran actividad ni resumen. También pasan las regresiones de formularios, persistencia simulada, RLS con PGlite y HTTP serverless compilado.
- Única falla: la prueba nativa de PostgreSQL se detiene en `initdb`, antes de ejecutar SQL: `could not create restricted token` (errores 87/3 de Windows). Se repitió aisladamente y falla igual. Es una limitación de ejecución del entorno, no una discrepancia de migración; no se modificaron SQL ni esa prueba. La validación nativa no queda aprobada en V2.
- TypeScript de frontend y ambos endpoints aprobado. Lint aprobado con las 13 advertencias preexistentes. Build aprobado con el aviso existente de bundle >500 kB. Prueba de aislamiento CSS y `git diff --check` aprobados tras el último ajuste de especificidad de Perfil.

El PR permanece en borrador y espera aprobación visual; sin merge ni cambios de base de datos o configuración remota.
