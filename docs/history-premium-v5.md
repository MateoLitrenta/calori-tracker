# Home History & Period Experience V5

Implementado sobre main 7d651ba (merge del PR #63), en codex/history-period-ux-v5. Solo Inicio y su historial cambian. El PR nuevo permanece en borrador, pendiente de aprobación visual; no se modifica Production ni se aplican migraciones.

## Causas verificadas

- Heatmap renderizaba los grupos con clases w-[11px] h-[11px] md:w-2.5 md:h-2.5, dividía semanas, meses y años en columnas de siete y rellenaba las columnas con celdas invisibles. La geometría responsive de HomeVariants se aplicaba principalmente a data-period=day. Medición anterior: **10×10 px** en las tres escalas agrupadas de 1440×900.
- HomeView compartía selectedGroup entre Heatmap y DailyPanel. Cada cambio de escala escogía automáticamente un grupo y DailyPanel lo interpretaba como reemplazo de su resumen: ocultaba hábitos y registros, conservando la composición CSS pensada para el día. Volver a Día llamaba a onSelectDate con hoy, perdiendo el día consultado.

## Arquitectura y diseño

HomeView conserva únicamente selectedDateStr. DailyPanel recibe siempre el registro diario y el mismo writer existente. No se modifican DailyPanel, sus formularios ni sus cálculos. Heatmap administra su escala y recuerda un intervalo independiente por escala. Los grupos no cambian el día consultado ni ejecutan escrituras. Volver a Día conserva su selección.

El detalle agregado vive dentro del historial y mantiene acceso a balance promedio, acumulado, consumidas, gasto y cobertura. Escoger otro intervalo actualiza ese detalle, sin sustituir las tarjetas superiores. Los botones de escala e intervalo detienen exclusivamente la propagación del click que antes descartaba un borrador abierto mediante el listener exterior de DailyPanel. Los controles diarios mantienen sus handlers existentes.

- **Día:** calendario de 53 columnas en las fechas probadas, con semanas domingo–sábado; mismo horizonte de 364 días hacia atrás redondeado al domingo. Etiquetas de mes en la columna que contiene el día 1. Una fórmula compartida dimensiona celdas, referencias y offsets. Celdas cuadradas de 12–22 px en desktop amplio, mínimo 16 px en ventanas estrechas; separación 4 px y radio 3 px. Solo el calendario tiene scroll horizontal si falta espacio.
- **Semana:** 53 unidades en las fechas probadas, grilla de 11 columnas y cinco filas en desktop (última fila de nueve, sin una celda aislada). Targets de 44 px de alto; fecha de inicio breve visible y rango exacto, promedio y cobertura en el nombre accesible y tooltip. Ocho columnas bajo 1024 px, cinco bajo 640 y cuatro bajo 375. La franja semántica representa el promedio oficial.
- **Mes:** doce bloques, cuatro columnas y tres filas; dos columnas en móvil. Nombre y año visibles, cobertura, estado en curso y franja semántica; mínimo 76 px, con crecimiento natural del texto.
- **Año:** únicamente año anterior y actual, como antes. Dos tarjetas en desktop y una columna móvil, mínimo 164/132 px respectivamente. Año, promedio, días con datos y denominador transcurrido visibles. Año en curso y fecha de corte se identifican explícitamente. No se compara una muestra parcial como si fuera un año completo.
- Superficies, colores y tokens existentes; radios locales de 12 px en grupos y 3 px en celdas. Sin dependencias nuevas, degradados, sombras decorativas ni alturas máximas que recorten contenido.
- El historial crece con sus datos y el scroll principal. El cambio de escala puede variar la altura natural del historial; no hay un contenedor enorme reservado artificialmente. Las filas diarias conservan su geometría.

## Semántica y accesibilidad

Todos los totales y promedios provienen de aggregateEnergy; clasificación y colores siguen getBalanceLabel/getHeatmapColor. historyPeriods solo construye fechas para presentación. No hay fórmula energética alternativa ni cambios de redondeo, TMB, gasto o denominadores.

La cobertura cuenta los días energéticos según la regla existente: comidas, ejercicios o pasos. Agua o peso solos no se convierten en días energéticos. Los días ausentes conservan null y se muestran como Sin datos, distintos de balance neutro cero; los futuros quedan fuera de los agregados y de la cobertura transcurrida. Las leyendas de grupos usan kcal/día. Los bordes de gimnasio/fútbol aparecen exclusivamente en Día.

Botones nativos con aria-pressed, un punto de Tab por visualización, flechas, Inicio/Fin y activación Enter/Espacio. En Día, izquierda/derecha recorren semanas y arriba/abajo recorren días; en las grillas se respeta el número de columnas responsive. Foco visible y transiciones desactivadas con reduced motion. Los tooltips son nativos; los datos esenciales están también en nombres accesibles y en el detalle persistente, sin depender del hover.

El selector nativo Día del resumen tiene 44 px de alto y límites iguales al calendario. Ofrece una alternativa táctil a celdas pequeñas sin modificar la escala. Seleccionar explícitamente un día cambia únicamente el día consultado; cambiar escala o intervalo no lo cambia.

## Validaciones automatizadas

**335/335 pruebas aprobadas**, cero fallidas, canceladas u omitidas en la ejecución final. Incluye nueve regresiones nuevas de rangos y Home con ReactDOM/JSDOM, más la suite existente PostgreSQL/RLS/concurrencia y HTTP serverless compilado.

Nuevas regresiones:
- 53 semanas, doce meses y dos años; orden, domingos, días bisiestos, semanas que cruzan año y etiquetas alineadas al día 1.
- Cobertura parcial, futuro y vacío; cero neutro; promedios y totales oficiales sin mutar registros.
- Cambios repetidos de escala e intervalo conservan nodos, widgets, registros y día consultado; cada escala recuerda su elección.
- Flechas e Inicio/Fin mueven foco sin seleccionar ni guardar; activación explícita selecciona.
- Un borrador de comida sobrevive a Semana/Mes/Año. Guardar desde Año escribe una sola vez en el día consultado y actualiza el estado diario compartido.
- El control de fecha permite días válidos, rechaza vacío/futuro y no realiza escrituras.

TypeScript de frontend (tsc -b), api/ai y api/coach: aprobado. Lint: aprobado, **11 advertencias en archivos ajenos a este cambio**. Build Vite: aprobado; persiste el aviso de chunk principal >500 kB. git diff --check: aprobado.

La primera ejecución dio 333/334: initdb falló al renombrar un WAL por permisos dentro del Temp del sandbox, antes de aplicar SQL. Se utilizó COACH_TEST_POSTGRES_TMP apuntando a un directorio local del workspace y la suite pasó completa; tras el ajuste final de propagación volvió a pasar 335/335. No se cambia SQL ni se omite la prueba. Las bases PostgreSQL de test son locales y desechables.

Para reproducir en PowerShell si el Temp del sandbox restringe PostgreSQL:

~~~powershell
$taskPgTemp = Join-Path (Get-Location) 'scratch/pg-tests'
New-Item -ItemType Directory -Path $taskPgTemp -Force | Out-Null
$env:COACH_TEST_POSTGRES_TMP = $taskPgTemp
npm test
~~~

## Navegador y mediciones

Navegador real sobre Vite local con datos sintéticos y Auth/persistencia/IA simulados, **sin datos personales ni conexiones al Supabase remoto**. Esta evidencia no es una prueba autenticada real del Preview.

**108 combinaciones**: cuatro escalas × nueve resoluciones × historial completo variado, cinco días disponibles y vacío. Tamaños: 1920×1080, 1440×900, 1366×768, 1280×720, 1024×768, 768×1024, 430×932, 375×812 y 320×740. Se midieron overflow, bloques, columnas, marco, detalle, leyendas, widgets y conservación del texto diario. Cero overflow horizontal global; tres hábitos presentes y registros conservados en todos los cambios de escala. Además, **12 combinaciones en claro**, cuatro escalas en 1440, 375 y 320 px, sin overflow.

La grilla semanal mide 44 px de alto por bloque: anchos aproximados 120/91/85/77 px en desktop 1920/1440/1366/1280; 47 px en 1024, donde la barra lateral y el padding existente dejan menos espacio. En 320 usa cuatro columnas de 51 px. Los meses aumentan naturalmente a unos 109 px de alto en 320 cuando cobertura y año necesitan varias líneas.

Las capturas generales de 1920 usan dos registros diarios y el mismo historial. Las cuatro escalas muestran Agua, Pasos, Peso y Registros del día. Energía y hábitos comienzan en y=76 y el journal en y=259,8 en las cuatro. Los límites inferiores del historial son y=990/1042/1034/958 para Día/Semana/Mes/Año: caben en ese escenario sin forzar alturas.

Flujos reales de navegador, con servicios simulados:
- Flechas, Inicio/Fin, Enter y Espacio; ArrowDown en móvil coincide con la siguiente fila de cinco columnas.
- Día histórico seleccionado, borrador conservado al recorrer escalas, guardado único de 400 kcal y balance diario actualizado sin recarga. El día histórico se mantiene al volver a Día.
- Semana, mes y año elegidos mediante teclado y detalle con fechas/coverage exactas.
- Año anterior con solo 70/365 días frente al actual en curso; escenario escaso con año vacío y 5/295 días actuales.
- Períodos vacíos, claro/oscuro y scroll interno exclusivamente en el calendario diario cuando el ancho es insuficiente.

El navegador integrado no aplicó Control+Plus (innerWidth y devicePixelRatio no cambiaron). **Zoom nativo 125 % y 150 % sigue pendiente**, al igual que teclado virtual en dispositivo físico, lector de pantalla y sesión autenticada real del Preview. No se simula zoom mediante CSS ni se afirma validación de Production. El Preview se enlaza en la descripción del PR y en el comentario de despliegue de Vercel.

## Capturas

Comparaciones 1440×900: mismo fixture de ocho registros, mismo día; las imágenes generales muestran el inicio de la página. Los detalles inferiores se incluyen por separado para mostrar el scroll natural del formulario.

Día anterior / posterior:

![Día anterior](screenshots/history-premium-v5/before-day-1440.jpg)
![Día posterior](screenshots/history-premium-v5/after-day-1440.jpg)

Semana anterior / posterior:

![Semana anterior](screenshots/history-premium-v5/before-week-1440.jpg)
![Semana posterior](screenshots/history-premium-v5/after-week-1440.jpg)

Mes anterior / posterior:

![Mes anterior](screenshots/history-premium-v5/before-month-1440.jpg)
![Mes posterior](screenshots/history-premium-v5/after-month-1440.jpg)

Año anterior / posterior:

![Año anterior](screenshots/history-premium-v5/before-year-1440.jpg)
![Año posterior](screenshots/history-premium-v5/after-year-1440.jpg)

Cuatro vistas completas en 1920×1080, con las tres filas y todos los hábitos diarios:

![Inicio Día](screenshots/history-premium-v5/after-day-1920.jpg)
![Inicio Semana](screenshots/history-premium-v5/after-week-1920.jpg)
![Inicio Mes](screenshots/history-premium-v5/after-month-1920.jpg)
![Inicio Año](screenshots/history-premium-v5/after-year-1920.jpg)

Selecciones con historial variado:

![Semana seleccionada](screenshots/history-premium-v5/selected-week-1440.jpg)
![Mes seleccionado](screenshots/history-premium-v5/selected-month-1440.jpg)
![Año seleccionado](screenshots/history-premium-v5/selected-year-1440.jpg)

Móvil, claro y cobertura escasa:

![Inicio móvil](screenshots/history-premium-v5/after-home-mobile-375.jpg)
![Semana móvil](screenshots/history-premium-v5/after-week-mobile-375.jpg)
![Mes en 320 px](screenshots/history-premium-v5/after-month-mobile-320.jpg)
![Mes claro](screenshots/history-premium-v5/after-month-light-1440.jpg)
![Año escaso](screenshots/history-premium-v5/after-year-sparse-1440.jpg)

Datos de medición: before-measurements.json, responsive-matrix.json y light-matrix.json dentro de la misma carpeta.

## Archivos de producción

- src/components/HomeView.tsx: separación entre resumen diario e historial.
- src/components/Heatmap.tsx: cuatro visualizaciones, selección contextual, cobertura y navegación accesible.
- src/components/HomeVariants.css: geometría y estilos limitados al historial de Inicio.
- src/utils/historyPeriods.ts: rangos de presentación con el horizonte existente.

Tests: history-experience.test.mjs, history-periods.test.mjs y contrato actualizado en ui-polish.test.mjs. No hay cambios en Datos, Perfil, Coach, Supabase, Gemini, cuotas, autenticación, endpoints, objetivos, persistencia o fórmulas.
