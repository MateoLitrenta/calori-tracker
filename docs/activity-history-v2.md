# Historial de actividad 2.0

Base: `main` en `c623f9beb726a3940ab564432260d7908302f9e5`, con V9.3 integrada. Este cambio sólo afecta presentación e interacción; no modifica datos, servicios o cálculos.

## Recorrido

El historial abre en un mes con fechas numeradas. Semana presenta siete fechas y Año presenta doce meses, con navegación entre el año actual y el anterior. Elegir un mes profundiza en él. No hay una cuarta pestaña Día: el día seleccionado aparece en el detalle contextual.

Seleccionar fechas o períodos actualiza sólo la exploración. **Abrir registros del día** cambia explícitamente el día de Inicio, desplaza la vista hasta sus registros y mueve el foco a su encabezado. **Volver a Tu actividad**, junto a esos registros, devuelve el foco al historial conservando mes, vista y selección. El contexto también se conserva al volver desde otra sección durante la sesión actual y se aísla por usuario; no se guarda en Supabase ni en localStorage.

Los días distinguen hoy, selección, actividad y ausencia de comidas. Los iconos de comida y entrenamiento tienen equivalentes textuales en sus nombres accesibles. Agua, peso o pasos sin comidas también aparecen como actividad. Tener comidas no certifica que un día esté completo. El detalle presenta registros reales con sus horas disponibles, hábitos y una acción explícita para abrir la lista completa; no inventa horas ausentes.

El calendario ofrece flechas, Inicio/Fin y RePág/AvPág. El foco no provoca scroll vertical al explorar. La composición usa un calendario y un detalle unidos: apilados en móvil y lado a lado cuando el contenedor tiene espacio. En un contenedor menor de 318 px se presenta una semana desplazable del mes, con navegación entre sus semanas; los objetivos táctiles conservan al menos 44 px.

La prueba real a 768 px reprodujo un ajuste de scroll de 13 px al pasar de tres registros a dos: al achicarse el detalle, el navegador reducía el máximo desplazable. Antes de cambiar de fecha se reserva la altura que el detalle ya ocupa, sin limitar el crecimiento ni recortar texto. Esa reserva se libera al cambiar de vista o de ancho. No se agregan una altura fija arbitraria ni correcciones automáticas de scroll.

La revisión de resize también reprodujo un aviso real de `ResizeObserver` al liberar la altura dentro de su propia notificación. El ajuste se difiere a un frame coalescido, se cancela al desmontar y respeta las reservas más recientes del usuario. El ensayo real 768→375→768 aprobó sin ese error. La captura final escucha `window.error` antes de Vite, además de errores de página y promesas rechazadas; no depende de que el overlay propague el aviso.

## Semántica y seguridad

- Las semanas siguen empezando en domingo. Mes y año conservan sus límites calendario.
- Los cálculos siguen usando `aggregateEnergy`; no se modificaron `historyPeriods.ts`, `heatmapActivity.ts` ni las utilidades nutricionales.
- «Días con registros» describe presencia de comidas, ejercicios o hábitos. Se distingue de los días con datos energéticos usados como denominador por el resumen energético existente.
- El resumen energético queda disponible mediante un disclosure, con unidades y base explícitas. No domina el detalle del día ni duplica el balance principal.
- El calendario no escribe registros. La RPC transaccional, versiones, generaciones y recibos V9.2 permanecen intactos.
- La exploración no desmonta `DailyPanel`. Abrir otro día con un formulario/editor activo se bloquea con explicación y una acción para volver al borrador.
- Una regresión con el App real reprodujo que cambiar a Datos descartaba una comida en edición. El guard de navegación ahora exige guardar o cerrar el formulario antes de cambiar de sección; el aviso existente usa un ID estable y no se acumula. El click de navegación rechazado tampoco cierra el formulario como si fuera un click fuera de él. No se agrega persistencia de borradores ni se cambia la arquitectura de navegación.

## Comparación con el diseño anterior

El baseline cargado desde Git abre Día como una cinta anual de cuadrados sin números, con objetivos móviles de 24 px y un resumen energético antes del calendario. La fecha seleccionada cambia inmediatamente el resumen diario.

La nueva experiencia muestra fechas legibles y objetivos de al menos 44 px. Consultar un día actualiza el detalle contiguo sin cambiar el formulario; abrir sus registros es una decisión explícita. Año permite ir de un mes a sus días. La leyenda energética dejó de ser un requisito para comprender qué se registró. Esta comparación describe comportamientos observados; no es un estudio de velocidad con usuarios ni un benchmark frente a otra aplicación.

## Evidencia y validación

La [galería antes/después](evidence/activity-history-v2/README.md) incluye móvil y desktop, Semana, Año, días incompletos, registros abiertos y el resumen avanzado. La [matriz responsive](evidence/activity-history-v2/responsive-matrix.json) cubre 320, 375, 393, 430, 768 y 1440 px en ambos temas. El [video del recorrido](evidence/activity-history-v2/walkthrough-mobile.mp4) dura 19,7 segundos y tiene [decodificación y SHA-256 verificados](evidence/activity-history-v2/video-verification.json).

Se distinguen las capturas aisladas del componente —con contenedores desplegados temporalmente sólo para el PNG— de las interacciones, medidas, capturas de registros y video con el layout original. La metadata identifica el commit de cada evidencia; el video se grabó antes del ajuste interno de resize y conserva esa referencia original. El ensayo de resize se registra por separado sobre el código final.

El gate final de Linux aprobó **569/569 pruebas**, en 47 archivos, con **0 fallos, 0 omisiones, 0 cancelaciones y 0 pendientes**. TypeScript del frontend, API de IA y Coach, lint, build y diff check aprobaron. Lint informó 12 advertencias y 0 errores. Incluye PostgreSQL 17.6 y PostgREST 16.5 reales en un entorno descartable, con rollback, idempotencia, conflictos, reset, aislamiento y lecturas anidadas existentes. No certifica servicios Supabase Auth/Storage HTTP reales. El [manifiesto de calidad](evidence/activity-history-v2/quality-results.json) registra comandos, versiones y resultados.

La fuente y los tests certificados corresponden a `b98fbe0511138cf70abe62e540d7718df3559d18`, árbol de aplicación `d3b3afb2d6f6a6f2fd03e8e6f73fd56bfce908c6`; los commits posteriores sólo publican documentación y evidencia. En navegador se aprobaron **12/12 combinaciones y 346 comprobaciones** con captura temprana de errores, sin errores JavaScript, desbordamientos horizontales, peticiones externas ni guardados. El resumen avanzado de cuatro métricas se verificó con teclado en las doce combinaciones.

La primera suite completa había aprobado 567/569: dos fixtures fallaron al buscar la memoria de scroll en una posición numérica de hooks que ya correspondía a otro ref. Se conservaron sus aserciones de navegación y sesiones y se corrigió el lookup del harness; su archivo completo aprobó 29/29 y después se repitió la suite completa con el resultado final anterior. Las pruebas con App real verifican además navegación, contexto por usuario y conservación del borrador.

Todos los fixtures son sintéticos; las capturas no certifican Auth, Storage ni Gemini remotos. No se certifican Safari/iOS o Android físicos ni una sesión real de NVDA/VoiceOver. No se modifica Production y el PR permanece Draft para aprobación visual.
