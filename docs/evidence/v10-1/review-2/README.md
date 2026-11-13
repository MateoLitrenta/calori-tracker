# Coach V10.1: revisión de distribución y acciones

El baseline se extrajo de `e8c16fc242d567f2fccc31373433e4b05d2be9fc`, la versión del PR anterior a este ajuste. Conserva los mismos registros sintéticos que las capturas posteriores.

Fuentes finales verificadas: `f628fe450807473150211b812a326a7db50ac9f5`. Las seis comparativas móviles y las dos de desktop se recapturaron con ese markup final.

## Resultados

- 8/8 escenarios determinísticos, con acciones específicas por contexto y sin el texto genérico «Revisar juntos».
- 29/29 comprobaciones finales de navegador, sin errores de página ni conexiones externas; 41 PNG en esta carpeta.
- La separación entre el borde inferior de la observación y el grupo de sugerencias pasó de 62 a 12 px en 320 y 375 px, y de 137,23 a 12 px en 393 px, en ambos temas.
- La composición de desktop conserva la misma separación de 163,89 px antes y después, en ambos temas. Tailwind se ejecuta desde el árbol de fuentes seleccionado para que las clases exclusivas del baseline no se purguen usando archivos de la versión candidata.
- El clic envía exactamente el identificador y la pregunta de la observación mostrada. Abrir, cambiar datos/cuenta o reabrir una conversación no inicia solicitudes de IA.
- Se verificaron CTA, lectura completa del límite mediante scroll y cierre de la observación con el compositor accesible en 320×568 y 375×667.

## Comparativas

- 320 claro: [antes](before-sufficient-light-320.png) · [después](after-sufficient-light-320.png).
- 320 oscuro: [antes](before-sufficient-dark-320.png) · [después](after-sufficient-dark-320.png).
- 375 claro: [antes](before-sufficient-light-375.png) · [después](after-sufficient-light-375.png).
- 375 oscuro: [antes](before-sufficient-dark-375.png) · [después](after-sufficient-dark-375.png).
- 393 claro: [antes](before-sufficient-light-393.png) · [después](after-sufficient-light-393.png).
- 393 oscuro: [antes](before-sufficient-dark-393.png) · [después](after-sufficient-dark-393.png).
- Desktop claro: [antes](before-sufficient-light-1440.png) · [después](after-sufficient-light-1440.png).
- Desktop oscuro: [antes](before-sufficient-dark-1440.png) · [después](after-sufficient-dark-1440.png).
- 320 compacto: [límite completo](after-evidence-scrolled-light-320.png) · [observación cerrada](after-evidence-closed-light-320.png).
- [Conversación contextual](after-contextual-conversation-light-393.png).

[Medidas anteriores](before-browser-report.json), [medidas y verificaciones finales](after-browser-report.json) y [evaluación por contexto](deterministic-evaluation.json) conservan los datos legibles por máquina.

## Alcance y reproducción

Se usan App, Coach y CSS reales. Auth/store, servicio de objetivos y transporte de IA son fixtures; la red ajena al servidor local está bloqueada. No se usaron variables de entorno del Preview ni se llamó a Supabase o Gemini. Estas comprobaciones no certifican IA real, servicios remotos, dispositivos físicos ni la interacción autenticada posterior al despliegue.

```powershell
$env:PLAYWRIGHT_MODULE = 'C:\ruta\a\playwright\index.mjs'
node scripts/coach-intelligence/browser-qa.mjs --review-2 --before
node scripts/coach-intelligence/browser-qa.mjs --review-2
node scripts/coach-intelligence/evaluate.mjs --review-2
```

El harness desactiva HMR para conservar la entrada aislada `/qa` mientras App utiliza su URL canónica. Permite recapturas acotadas con `--scenarios=new,steps`, `--widths=1440` y `--screenshots-only`, reemplazando las filas correspondientes y preservando las demás comprobaciones válidas. La nueva acción para un contexto sin registros recientes se recapturó con «Elegir mi próximo registro», sin asumir que la cuenta nunca tuvo registros antiguos.
