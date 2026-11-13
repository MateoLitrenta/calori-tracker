# Coach Intelligence V10.1: evidencia

Comparación del Coach de `main` (`742bd78`, Historial 2.1) con la implementación `1b30d5d`. La misma fixture suficiente contiene comidas, pasos y sesiones registradas de fútbol y gimnasio.

## Antes y después

- Móvil claro: [antes](before-sufficient-light-393.png) · [después](after-sufficient-light-393.png).
- Móvil oscuro: [antes](before-sufficient-dark-393.png) · [después](after-sufficient-dark-393.png).
- Desktop claro: [antes](before-sufficient-light-1440.png) · [después](after-sufficient-light-1440.png).
- Desktop oscuro: [antes](before-sufficient-dark-1440.png) · [después](after-sufficient-dark-1440.png).

## Personalización y comprobaciones

- [Ocho contextos, métricas y límites](deterministic-evaluation.json): usuario nuevo, información incompleta, información suficiente, regularidad variable, fútbol y gimnasio, objetivo confirmado, inconsistencias y otra cuenta con pasos.
- [Baseline visual](before-browser-report.json) y [matriz final de navegador](after-browser-report.json): geometría, texto, llamadas, evidencia, cambios de datos y cuenta.
- [Validación técnica y comprobaciones de Preview](validation.json).
- [Diagnóstico, evaluación, costos y riesgos](../../coach-intelligence-v10-1.md).

El navegador usa App, Coach y CSS reales con fixtures locales; Auth/store, transporte de IA y objetivos se simulan. Las conexiones externas están bloqueadas. Estas capturas y pruebas no certifican Supabase remoto, Gemini real, dispositivos físicos ni latencia de Production. No se guardaron datos reales.

La [Preview Vercel está disponible](https://calori-tracker-bx61kjw71-mateolitrenta-gmailcoms-projects.vercel.app), en estado READY, desde el commit `6ea12e1`. Se verificaron HTML, recursos y carga del handler de chat sin sesión ni llamadas a Gemini. El PR permanece Draft para revisión visual y funcional autenticada antes de merge. La aplicación desplegada conserva el mismo código; la documentación se actualizó después de verificar la Preview.
