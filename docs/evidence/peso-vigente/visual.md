# Evidencia de peso por fecha

La fixture local fija el 27 de noviembre de 2026 en Buenos Aires. Tiene 77 kg de peso base, 78 kg el 24 de noviembre, 80 kg el 26 y una medición futura de 120 kg el 28. Los días recorridos tienen idénticos pasos, ejercicios y comidas para aislar el cambio de peso.

## Caso de referencia

- 23 de noviembre, antes de la primera medición. TMB de 1.719 kcal y gasto de 2.321 kcal.
- 24 de noviembre, con 78 kg. TMB de 1.729 kcal y gasto de 2.331 kcal.
- 26 y 27 de noviembre, con 80 kg. TMB de 1.749 kcal y gasto de 2.351 kcal.
- Al corregir el peso del 24 a 81,5 kg, la TMB de ese día cambia a 1.764 kcal. El 23 conserva 1.719 kcal y el 26 conserva 1.749 kcal.
- Registrar 82 kg el 27 aumenta su TMB a 1.769 kcal. Al recargar, Perfil conserva esa lectura. La cuenta sintética B muestra su propio peso base. Al volver a A se recupera la lectura registrada.
- Los retiros simulados restauran las mediciones anteriores y luego el peso base. La edición explícita del peso base guarda el perfil una vez. Los tres registros de peso conservaron 350 kcal de ejercicio cada uno.

El estado anterior del Draft, `251ebe02`, mostraba el peso base junto a la medición y usaba el peso base en todas las fechas. Las capturas `after/` y resultados anteriores de esa iteración quedan como referencia.

## Capturas comparativas

- 375 px, Claro. [Antes](after/375-light-perfil.jpg) · [Peso por fecha](temporal/375-light-perfil.jpg)
- 390 px, Oscuro. [Antes](after/390-dark-perfil.jpg) · [Peso por fecha](temporal/390-dark-perfil.jpg)
- 1440 px, Claro. [Antes](after/1440-light-perfil.jpg) · [Peso por fecha](temporal/1440-light-perfil.jpg)
- 1440 px, Oscuro. [Antes](after/1440-dark-perfil.jpg) · [Peso por fecha](temporal/1440-dark-perfil.jpg)
- [Sin mediciones](temporal/375-light-sin-medicion.jpg) · [Edición del peso base](temporal/375-light-peso-base.jpg)

Resultados del recorrido. [Chromium](temporal/chromium.json) · [WebKit](temporal/webkit.json).

## Repetir la comprobación

```text
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --weight-current --port=5194
node scripts/fitness-global/peso-vigente.mjs
node scripts/fitness-global/peso-vigente.mjs --webkit
```

La comprobación usa la persistencia sintética del navegador, que conserva las fixtures al recargar. Para retirar una medición se sustituye el snapshot. Se bloquean las solicitudes externas, incluidas las de IA. Los tamaños móviles corresponden a Playwright. Queda pendiente la comprobación en Safari de iPhone físico.

El Coach recibe el peso vigente de hoy y el gasto derivado por fecha dentro del contrato existente. El estimador de ejercicio de Inicio envía el peso del día del formulario. Las propuestas de ejercicio generadas dentro del chat conservan su flujo de IA y confirmación. Las pruebas usan respuestas simuladas.
