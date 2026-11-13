# Coach Intelligence V10.1: evidencia

El cierre vigente está en [revisión 2: distribución, acciones y capturas](review-2/README.md), desde `f628fe4`: 29/29 comprobaciones de navegador, 41 PNG y 8/8 escenarios. La [CI Linux final](linux-ci-final.json) aprobó 654/654 pruebas en 52 archivos, sin omisiones, además de TypeScript, lint y build. [Informe actualizado](../../coach-intelligence-v10-1.md).

Comparación del Coach de `main` (`742bd78`, Historial 2.1) con la implementación `1b30d5d`. La misma fixture suficiente contiene comidas, pasos y sesiones registradas de fútbol y gimnasio.

## Comparación inicial (referencia histórica)

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

La [Preview actualizada](https://calori-tracker-nww3cmdat-mateolitrenta-gmailcoms-projects.vercel.app/app) está READY desde `f628fe4`. Se comprobaron únicamente HTML y archivos estáticos. Faltan variables para Gemini/Coach completo, según confirmó el usuario; no se modificaron ni se intentó certificar IA real allí. El PR permanece Draft. La [prueba funcional controlada](../../coach-intelligence-v10-1-post-deploy.md) queda pendiente hasta la aprobación, merge y despliegue, con una cuenta autorizada.
