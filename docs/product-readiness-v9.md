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

## Checkpoint B/C

Pendiente de implementar correcciones y consolidar regresiones, suite completa, TypeScript, lint, build, diff y evidencia de navegador V9. Las 371 pruebas y capturas V8.2 son referencia anterior, no validación V9.

## Recomendación inicial

Beta externa condicionada a: resolver hallazgos reproducibles, validar aislamiento/guardado con dos usuarios sintéticos en un entorno expresamente autorizado y comprobar migraciones/cuotas/Storage reales. Sin esos ensayos no se declara el producto listo. V10: recurrencia de objetivos, estrategia de conflictos/atomicidad, paginación de historial y recuperación de borradores; suscripciones quedan fuera de V9.
