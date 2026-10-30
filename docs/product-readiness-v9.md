# Calori V9 — Product readiness & reliability

## Checkpoint A — Auditoría previa a correcciones

Base: main d6b69e8 (PR68 integrado). Inspección no destructiva del cliente, store compartido, persistencia, endpoints, helpers, migraciones y pruebas. Ninguna consulta a registros reales; ningún cambio de configuración o SQL remoto. Esta auditoría no certifica la preparación para beta.

### Hallazgos reproducibles y plan

- V9-01 · P1 · Sesión inicial. Con getSession pendiente, emitir SIGNED_IN(B) o SIGNED_OUT y resolver luego la lectura inicial(A). El store vuelve a A. Causa confirmada: applyUser aplica ambas fuentes sin ordenar su antigüedad. Evidencia: dos regresiones nuevas fallan sobre main. Esperado: prevalece el evento posterior. Plan: invalidar la lectura inicial cuando llega un evento, manejar su rechazo. Riesgo: bajo, sin alterar políticas Auth.
- V9-02 · P1 · Escrituras del mismo día. Mantener ensureDailyLog pendiente y ejecutar updateRecord nuevamente para el mismo usuario/día: llegan dos escrituras. Los snapshots completos y posteriores lecturas pueden competir. Evidencia: contador 2 frente al esperado 1 en el harness del store real. Plan acotado: rechazar claramente la segunda operación antes de mutar estado o persistir; permitir reintento explícito una vez finalizada la primera. No fusionar snapshots ni reintentar automáticamente. Riesgo: medio; no sustituye transacciones/versiones entre dispositivos.
- V9-03 · P1 · Eliminación de ejercicios. handleDeleteWorkout llama onUpdateRecord sin await y muestra éxito antes de conocer el resultado. Un Promise(false) informa eliminación inexistente. Causa confirmada por el handler. Plan: esperar confirmación y manejar rechazo, igual que comidas. Riesgo: bajo.

### Recorridos y límites de evidencia

- Entrada: App distingue carga pública, perfil pendiente, onboarding y error; tests public-entry cubren login, signup, rechazo, cierre y reingreso simulado. No se creó una cuenta real ni se comprobó correo de confirmación/recuperación en remoto.
- Onboarding: validaciones de enteros/valores positivos; sólo completa al confirmar el update; conserva datos tras fallo. Preferencia de registro orienta el recorrido y es local. No se certifican límites fisiológicos ni se cambian fórmulas.
- Comidas: bloqueo de doble submit, subida y limpieza de foto, texto multilínea, calorías manuales; fallo mantiene formulario. Fotos privadas por prefijo de auth.uid en SQL; no se probaron fotos reales.
- Ejercicios: mismas comprobaciones; panel IA protege respuestas tardías desde V8.2. Categoría explícita local no se recupera desde frases arbitrarias antiguas: limitación conocida P2, no pérdida de activity ni de distancia/ritmo. No se añade persistencia.
- Balance/Datos: helpers energéticos compartidos; chartStats importa aggregateEnergy y calcula períodos civiles UTC a partir de una fecha local. Coach utiliza coachCardMetrics para tarjetas/contexto. Promedios de comidas usan días con comida y los de pasos días con pasos; no confundir sus denominadores con días de energía. Se conservan redondeos y exclusión de futuros. La suma pasos+ejercicios puede solaparse según contrato explícito, no se modifica.
- Coach: requiere confirmación de acciones; historial local por usuario y fecha, payload validado, fallos visibles. La suite coach-store-sync integra endpoint, confirmación y navegación a Inicio/Datos con límites simulados. No representa una conversación real Gemini ni recuperación remota del chat: el historial es local al navegador.
- Objetivos: endpoint verifica identidad; propuesta y aceptación separadas, progress desde registros; versión esperada, RLS, restricciones de columnas y cap concurrente de ocho en SQL. Pruebas PostgreSQL locales verifican esos contratos. Objetivos recurrentes semanales P3 para V10; no implementados.
- Perfil: errores de guardado y cancelación se manejan en UI; syncProfile comprueba error pero no filas afectadas. Una actualización sin filas puede aparentar éxito: pendiente de regresión específica, no se presenta como exposición demostrada.

### Seguridad y persistencia pendientes de beta

P1 / puerta de beta: el repositorio no incluye una migración inicial reproducible de profiles/daily_logs/meals/workouts. No es posible certificar sus políticas desplegadas con los archivos disponibles. Las políticas de Storage y coach_goals sí están versionadas; no equivalen a verificar las tablas base en producción. Revisar grants + RLS de SELECT/INSERT/UPDATE/DELETE con usuarios sintéticos en entorno autorizado antes de invitar externos. No se modifican políticas.

P1 / arquitectura: guardar día y sus hijos usa varias llamadas, sin transacción única. Puede haber éxito parcial ante caída intermedia. El store reconsulta al fallar; no se promete atomicidad. Versionado y transacción entre dispositivos requieren propuesta separada y prueba local; esta iteración sólo evita superposición dentro del store de una pestaña. No afirmar que eso resuelve conflictos entre dispositivos.

P2: borradores de formularios se descartan al cerrar o navegar según el contrato actual; no hay cola offline durable. Explicar esa limitación en beta, evaluar confirmación de descarte después. No convertirla en persistencia nueva sin diseño explícito.

P2: todo el historial de logs e hijos se consulta en un select, sin paginación cliente. Medir con volúmenes representativos y comprobar límites de filas de PostgREST antes de prometer historial ilimitado. No hay benchmark real de red/memoria ni prueba de truncamiento remoto en esta auditoría.

### Revisión de seguridad estática

aiSecurity verifica bearer con Auth /user antes de aplicar claims adicionales. Cuotas independientes reservadas por RPC privado con límite server-side; faltante de configuración falla cerrado. Timeout y límite de body, errores sanitizados y logs de modalidad/tiempo/tokens sin conversación. No se imprimen valores de entorno ni credenciales. No se alteran cuotas ni prompts. Las pruebas locales no acreditan que las variables/migraciones remotas estén configuradas correctamente.

Referencia consultada: https://supabase.com/docs/guides/database/postgres/row-level-security (grants y RLS son controles distintos). Changelog descargado como Markdown el 30/10/2026: cambios TLS y actualización de Postgres no requieren cambiar esta lógica cliente; no se efectuaron cambios de infraestructura.

## Checkpoint B — Correcciones

V9-01, V9-02 y V9-03 corregidos. La lectura inicial se ignora si hubo un evento posterior; su rechazo finaliza la carga. Un Set local por usuario/fecha bloquea sólo una escritura superpuesta y se libera tanto al fallar como al completar. Otros días conservan independencia. El usuario recibe un error para reintentar explícitamente; no se crea una cola ni se fusionan registros. El borrado de ejercicios espera true y captura rechazos antes de anunciar éxito.

Regresiones nuevas: seis casos del store real con React/JSDOM y servicios simulados, y un caso del handler real que verifica antes/después de resolver false, true y rechazo. La simulación antigua de reset-data se adaptó al import de useRef; no se cambió ninguna de sus aserciones. Un intento inicial falló por ese import en un módulo data: y se conserva como evidencia del harness, no como fallo del producto.

## Checkpoint C — Validación

Resultado final: **378/378 pruebas**, 34 archivos cubiertos exactamente por tres lotes disjuntos (151 + 108 + 119), cero fallos, omisiones o cancelaciones. Se incluyen PostgreSQL/RLS nativo descartable y endpoint compilado HTTP. Evidencia: screenshots/product-readiness-v9/validation.json y test-manifest.json. TypeScript frontend, API AI y API Coach, lint, build y diff --check pasaron. Bundle principal 574,22 kB (gzip 161,45 kB); build medido 16,41 segundos. No es una medición de latencia real del usuario, memoria ni red móvil. No se incorporaron dependencias ni optimizaciones especulativas.

Navegador con fixtures locales: 20 recorridos (Inicio, Datos, Coach, Perfil por cinco resoluciones: 1920×1080, 1440×900, 1366×768, 375×812, 320×740), sin overflow horizontal global. Las pantallas sin cambios visuales se revisaron en oscuro; el flujo de guardado y Datos también en claro.

Fallo inyectado en ensureDailyLog: Actividad conserva exactamente dos párrafos tras Guardar, el formulario permanece abierto. Borrar el ejercicio existente con esa falla conserva una fila y muestra cero mensajes «Entrenamiento eliminado». Guardado de comida de 550 kcal con estimación simulada y ajuste manual: Inicio muestra 1690 consumidas, 2398 de gasto y -708 de balance; Datos muestra la semana 26/10–1/11, cinco días registrados, 1778 kcal/día consumidas, 2030 de gasto y -252 de balance promedio. Son denominadores diferentes explícitos; sábado/domingo futuros no aportan ceros. Caso sin registros muestra balance provisional y texto «Sin comidas registradas».

La revisión cubre presentación y navegación reales del cliente; Auth, DB, objetivos y proveedor del fixture son simulados. No es evidencia de persistencia remota. Login/registro/onboarding, cambio de usuario, confirmación de objetivos, cuotas agotadas y reanudación se verifican por integración/unitarios existentes, no por un único recorrido autenticado remoto de 14 pasos. Esa prueba completa sigue pendiente antes de la beta.

Evidencia en docs/screenshots/product-readiness-v9: matrix.json y capturas de fallo de guardado/borrado, comida en Inicio/Datos y estado vacío. Las capturas V8.2 no se contabilizan como pruebas V9.

## Recomendación inicial

Beta externa condicionada a: resolver hallazgos reproducibles, validar aislamiento/guardado con dos usuarios sintéticos en un entorno expresamente autorizado y comprobar migraciones/cuotas/Storage reales. Sin esos ensayos no se declara el producto listo. V10: recurrencia de objetivos, estrategia de conflictos/atomicidad, paginación de historial y recuperación de borradores; suscripciones quedan fuera de V9.

## Registro de pendientes priorizado

No se demostró ningún P0 en estos ensayos. Esto no descarta un P0 en la infraestructura que no se inspeccionó.

- V9-04 · P1 · Aislamiento de tablas base: migración inicial ausente en repo. Evidencia: inventario SQL versionado. Esperado: grants/RLS reproducibles y probados entre usuarios sintéticos. Causa: falta de evidencia del esquema inicial, no vulnerabilidad desplegada demostrada. Solución propuesta: exportación revisada en entorno autorizado + pruebas allow/deny. Riesgo de cambiar remoto: alto; no aplicado. Estado: puerta de beta pendiente.
- V9-05 · P1 · Atomicidad entre dispositivos y entre día/hijos: varias llamadas secuenciales sin transacción/versionado. Reproducción propuesta local: fallar la segunda inserción tras confirmar la primera; se requiere reconciliar el subconjunto ya guardado. Esperado: operación atómica o reconciliación explícita/idempotente. Evidencia estática: updateRecord y db.ts; no ensayo remoto ni pérdida real acreditada. Solución: propuesta separada de RPC transaccional y versión esperada; riesgo medio/alto, requiere revisar esquema. Mitigación V9 sólo local a la pestaña. Pendiente.
- V9-06 · P2 · syncProfile no exige fila devuelta. Evidencia estática, falta caso real de update sin filas bajo RLS; no se cuenta como bug reproducido corregido. Propuesta: exigir confirmación de fila en una ampliación de contratos de persistencia. Riesgo bajo/medio, pendiente.
- V9-07 · P2 · Categoría local en edición libre: abrir un activity largo no permite inferir deporte con certeza; se conservan texto y métricas. Evidencia V8.2 y regresiones actuales. Propuesta de persistencia explícita separada, sin migración V9.
- V9-08 · P2 · Cerrar/navegar descarta borrador por contrato; no cubre recuperación tras caída/recarga. Propuesta: política de descarte/recuperación con aislamiento por usuario. Riesgo de datos privados en almacenamiento local: requiere diseño; pendiente.
- V9-09 · P2 · Historial sin paginación y bundle principal ~574 kB. Propuesta: benchmark de usuarios sintéticos voluminosos y límites PostgREST, después paginar si se confirma impacto. Sin benchmark de producción; pendiente.
- V9-10 · P3 · Objetivos semanales recurrentes: modelo actual guarda una ventana concreta de hasta 31 días, sin regla de recurrencia. V10 debe definir semana civil, zonas horarias y progreso por subperíodo antes de ampliar esquema; no usar un total mensual como si fuese tres sesiones por semana. Pendiente.

## Condiciones de aceptación para beta

1. Aplicar/revisar manualmente migraciones en el proyecto correcto con un procedimiento autorizado, respaldos y rollback. No se aplicó ninguna desde esta tarea.
2. Ejecutar el recorrido de 14 pasos con dos usuarios sintéticos, datos privados y fallos de red en un entorno autorizado. Verificar reingreso, fotos, RLS de tablas base y Storage.
3. Comprobar cuotas por modalidad y alertas de presupuesto; los cupos por usuario no garantizan un máximo mensual global. El reinicio de cuotas SQL es UTC, distinto de la fecha local de registros.
4. Resolver o aceptar explícitamente la limitación transaccional y los conflictos entre dispositivos.
5. Validar teclado físico móvil/Safari, red lenta y volumen de historial; revisar logs sanitizados y soporte de recuperación.

Conclusión: entrega de correcciones de fiabilidad y auditoría condicionada; no certificación de beta/Production. No se modifican fórmulas, IA, cuotas, objetivos, RLS, variables remotas ni datos reales.

Capturas V9: [guardado fallido conserva borrador](screenshots/product-readiness-v9/failed-workout-save-375.jpg), [borrado fallido sin éxito](screenshots/product-readiness-v9/failed-delete-375.jpg), [comida en Inicio](screenshots/product-readiness-v9/saved-meal-home-375-light.jpg), [Datos](screenshots/product-readiness-v9/saved-meal-data-375-light.jpg), [sin registros](screenshots/product-readiness-v9/empty-home-375-dark.jpg).
