# Historial 2.1 — balance, deportes y movimiento

Base: `main` en `72021c2`, con Historial 2.0 integrado. Se conserva el calendario, la selección local y la apertura explícita de registros. No cambian servicios, autenticación, cuotas, Coach, guardados ni navegación global.

## Balance y cobertura

El nuevo adaptador de presentación llama a `getNetBalance`, `getBalanceCategory`, `getBalanceLabel` y `aggregateEnergy`. No altera estas funciones, sus umbrales ni sus denominadores. Las capas verde, coral y gris reutilizan los colores existentes de `getHeatmapColor`; la selección sigue siendo naranja. Los valores con signo, etiquetas y estados accesibles permiten leer el resultado sin distinguir colores.

Un día con comidas puede mostrar su balance estimado y categoría. «Con comidas registradas» describe lo que consta en Calori, no certifica una dieta completamente registrada. Un día con actividad pero sin comidas se marca parcial y neutral; si existe un balance canónico, aparece como provisional en su detalle, nunca como déficit confirmado. Agua/peso sin datos energéticos no producen un balance inventado. Fechas vacías y futuras se mantienen neutrales.

Los períodos conservan el promedio oficial de **todos los días con datos energéticos**, incluidos los de pasos o ejercicio sin comidas. No se recalcula un promedio alternativo usando sólo comidas. Cuando hay alguno de esos días, el promedio se etiqueta provisional y pierde el color de déficit/superávit. La cobertura muestra por separado días con comidas, días transcurridos y días energéticos usados como base. Los ausentes y futuros no se completan.

En Año se muestra el promedio cuando hay al menos un día con comidas y un valor oficial disponible; no se introduce un mínimo estadístico arbitrario ni se afirma que una cobertura escasa represente todo el mes. La cobertura permanece visible. Los meses con actividad sin comidas muestran registro parcial; los vacíos y futuros conservan sus estados neutrales de Historial 2.0.

## Deportes y detalle

`getHistorySports` reutiliza `getHeatmapActivities` sobre los nombres registrados: balón para fútbol, pesa para gimnasio y un indicador genérico para otras actividades. No infiere deportes a partir de notas ni de las calorías. Fútbol americano sigue siendo genérico conforme al clasificador existente.

El total de entrenamientos cuenta las sesiones reales. Una descripción que mencione explícitamente fútbol y gimnasio puede activar ambos indicadores para una sola sesión; esas etiquetas no se suman como si fueran sesiones distintas. El detalle conserva nombre, hora disponible y duración de todos los entrenamientos de la fecha, incluso si hay varias comidas o deportes. Las comidas mantienen su vista previa y acceso al listado completo.

## Transiciones y accesibilidad

Se anima un único nodo estable mediante Web Animations API, durante 210 ms: deslizamiento direccional entre semanas/meses y transición breve al cambiar de escala. El estado se publica inmediatamente; la animación no retrasa ni bloquea la navegación. Una intención nueva cancela la animación pendiente y el cambio a movimiento reducido la desactiva. No se crean copias de botones ni se trasladan foco o scroll desde el controlador de movimiento.

Antes de cambiar de período se reserva sólo el espacio medido necesario para que el navegador no reduzca el máximo desplazable bajo la posición actual. No se imponen alturas fijas ni se fuerza scroll. Se conserva la reserva del detalle y su limpieza por resize diferida a un frame, con cancelación al desmontar. En modo claro se reutilizan tonos naranja y gris ya existentes en Calori para mejorar el contraste, limitados al historial.

## Validación y evidencia

Fuente congelada: `8cf38cd867568214bd011dde6387747f228b2efe`, árbol `src` `10287d5ecd0f8df8280e498a5355e1c232d606f2`. Los commits posteriores agregan únicamente este informe y evidencia.

- Suite Linux completa: **615/615**, sin fallos, omisiones, cancelaciones ni pendientes; 49 archivos, Node 24.4.1, PostgreSQL 17.6 y PostgREST 16.5 locales descartables, sin red externa. Incluye 44 regresiones nuevas de presentación, flujo de Historial y movimiento.
- Persistencia: altas, edición, eliminación, confirmación de cero filas, rollback, replay idempotente, conflictos/versiones, reset, aislamiento y lecturas anidadas comprobados con PostgreSQL/PostgREST reales. Sus identidades/JWT y esquemas de Auth/Storage son sintéticos, no servicios Supabase HTTP certificados.
- TypeScript de frontend, AI y Coach, lint, build y diff check: aprobados. Lint conserva 12 advertencias existentes y cero errores; build conserva la advertencia habitual de tamaño de chunk.
- Navegador: 12 combinaciones finales de Semana/Mes/Año, móvil/escritorio y ambos temas; 144 comprobaciones de estados/deportes en 320–1440 px; 40 de movimiento real, foco, scroll, clics rápidos y movimiento reducido. Sin desbordes, errores JS, escrituras ni solicitudes externas.
- Contraste: 252 muestras de texto y 16 de selección aprobadas. Se conservaron etiquetas y valores, además del color.

[Capturas antes/después y metodología](evidence/activity-history-v2-1/README.md), [video real de 25,83 s a 30 fps](evidence/activity-history-v2-1/transitions-mobile.mp4), [manifiesto visual](evidence/activity-history-v2-1/validation.json) y [resultados Linux](evidence/activity-history-v2-1/quality-results.json).

Los fixtures visuales son sintéticos, con fecha fija 12 de noviembre de 2026; los servicios remotos están simulados y no certifican Auth, Storage ni Gemini reales. Las comprobaciones de nombres, roles, foco y movimiento reducido no sustituyen una sesión real con NVDA/VoiceOver ni dispositivos físicos. Quedan pendientes la aprobación humana del Preview y esa comprobación física.

El PR permanece Draft para aprobación visual. No se ejecuta SQL remoto ni se modifica Production.
