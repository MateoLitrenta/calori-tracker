# Regresión funcional de Inicio · etapa 2A

La fixture usa la aplicación real con una cuenta sintética y la fecha fija del 13 de noviembre de 2026. La referencia es el merge `cee76612a4352e82f626fc4eaf2951998f792e9c` de #103. Chrome 158 recorrió la referencia y el candidato a 375 px en Claro y 1440 px en Oscuro. Sus dos reportes son idénticos. WebKit 26 aprobó ambos recorridos del candidato.

## Comprobaciones

- Los siete botones de la semana y las columnas del calendario mensual siguen el orden de lunes a domingo. Sábado y domingo posteriores a la fecha fija están deshabilitados. Inicio, flecha derecha y Enter distinguen movimiento del foco de selección del día. Semana anterior y siguiente conservan el día de la semana. Escape cierra el calendario y devuelve el foco. Hoy recupera el viernes 13.
- Ambas versiones mostraron −1.031 kcal el 13 de noviembre (1.250 vs. 2.281), 0 kcal el 10 (1.679 vs. 1.679) y +651 kcal el 12 (3.100 vs. 2.449). Las categorías son Déficit Alto, Mantenimiento y Superávit Alto. Ver desglose abre con Enter y cierra con Espacio. El recorrido compara ingesta, gasto, TMB, pasos y ejercicio y contrasta las dos barras contra el mismo máximo diario.
- Agregar comida y Agregar ejercicio abren la hoja móvil o el diálogo de escritorio con el día histórico correcto. Cancelar pide confirmar cuando hay un borrador. Seguir editando conserva el texto y el descarte explícito restaura foco, fecha y posición de lectura.
- Explorar el lunes 9 en Historial mantiene el viernes 13 como día de registro. Ver y editar selecciona el lunes y enfoca Registros del día. Al ir a Datos y volver, Inicio recupera los 230 px de scroll y el 9 de noviembre.
- La interceptación limita el recorrido al origen local. Se comprobaron cero escrituras, llamadas de IA y conexiones remotas.

## Evidencia y reproducción

[Chrome de referencia](funcional-chromium-antes.json) · [Chrome candidato](funcional-chromium.json) · [WebKit candidato](funcional-webkit.json)

Con las fixtures instaladas, iniciá los servidores de referencia y candidato en dos terminales. Corré el navegador en serie. `PLAYWRIGHT_MODULE` permite indicar el módulo de Playwright y `PLAYWRIGHT_BROWSERS_PATH` la ruta de la instalación de WebKit.

~~~sh
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-home --before --port=5193
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-home --port=5194
~~~

~~~sh
node scripts/fitness-global/liquid-glass-home-flow.mjs --before
node scripts/fitness-global/liquid-glass-home-flow.mjs
node scripts/fitness-global/liquid-glass-home-flow.mjs --webkit
~~~

Las pruebas focalizadas locales aprobaron **216/216** con cero omisiones. Incluyen fechas, cálculos, estados sin registros, historial, formularios, persistencia simulada y navegación de la aplicación.

~~~sh
node --test --test-concurrency=1 tests/daily-panel.test.mjs tests/home-date-navigation.test.mjs tests/energy.test.mjs tests/entry-submission.test.mjs tests/workout-entry-layout.test.mjs tests/workout-entry-premium.test.mjs tests/history-experience.test.mjs tests/public-entry.test.mjs
~~~

El recorrido de navegador usa tamaños de pantalla simulados en motores de escritorio. Las barras dinámicas y el gesto táctil nativo quedan para la revisión en Safari de iPhone físico.
