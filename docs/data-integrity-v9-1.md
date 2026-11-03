# Calori V9.1 — Integridad y seguridad de datos

Base: `main` `8cbade05cc9339fd405421d88c5c5445f7931ace`, merge del PR #69. Rama `codex/data-integrity-v9-1`.

## Conclusión y alcance de la evidencia

**Todavía no habilitar la beta sobre la base de este PR.** Se corrigen confirmaciones falsas y la inicialización destructiva de perfiles. La estrategia transaccional queda preparada y probada en PostgreSQL descartable, **sin conectarla al cliente ni aplicarla remotamente**. El escritor actual sigue siendo multiconsulta, sin control de versiones entre dispositivos; ese riesgo no se declara resuelto en Preview o Production.

No se consultaron usuarios, registros, fotos ni credenciales reales. No se ejecutó SQL remoto, no se modificaron variables de entorno ni se aplicaron migraciones a Supabase. No se cambiaron fórmulas, IA, cuotas, objetivos o diseño. La inspección del Preview público no certifica persistencia autenticada.

## Inventario que demuestra el repositorio

Las siete migraciones existentes suponen que ya existen cuatro tablas base. No hay `CREATE TABLE` inicial de `profiles`, `daily_logs`, `meals` o `workouts`, ni una definición histórica versionada de sus grants, políticas, índices y claves. Esto impide reproducir una instalación limpia únicamente con `supabase/migrations`. **No demuestra que falten tablas o RLS en Production.**

- `202609100001_profile_activity_level.sql`: columna, valor predeterminado, normalización de nulos y CHECK de actividad; aborta ante una variante legacy ambigua.
- `202609110001_delete_daily_records.sql`: `delete_my_daily_records()`, `SECURITY INVOKER`, `search_path=''`; autenticación obligatoria; borrado transaccional de hijos/días y comprobación de remanentes. EXECUTE sólo `authenticated`, revocado a PUBLIC/anon. Depende de los grants y RLS base reales.
- `202609250001_profile_avatar.sql`: `profiles.avatar_path`, CHECK de propietario, bucket privado `avatars`, 512 KiB, JPEG/WebP; cuatro políticas de objetos para SELECT/INSERT/UPDATE/DELETE por UID y nombre `profile.jpg/webp`.
- `202609290001_meal_photos.sql`: `meals.photo_path`, CHECK de prefijo propietario, bucket privado `meal-photos`, 1 MiB, JPEG; cuatro políticas por prefijo UID. UPDATE tiene USING y WITH CHECK.
- `202609290002_profile_onboarding.sql`: columna y transición de defaults, conserva perfiles existentes.
- `202610090001_ai_usage_quotas.sql`: tabla `ai_private.daily_usage`, RLS habilitada sin permisos de navegador; esquema y tabla privados. RPC `reserve_ai_quota(uuid,text,integer)`, `SECURITY DEFINER`, ruta vacía; ejecución sólo `service_role`. Reserva atómica y límites por modalidad/día. Sin cambios en este PR.
- `202610130001_coach_goals.sql`: tabla `coach_goals`, índices/CHECKs, ENABLE/FORCE RLS, SELECT/INSERT/UPDATE de propietario, sin DELETE del cliente. INSERT/UPDATE por columnas; trigger `validate_coach_goal_change()` invoker, EXECUTE revocado, control de versión, cupo y serialización. Sin cambios en este PR.

Las migraciones de fotos definen políticas, pero no inventarían por sí solas los privilegios ni la infraestructura completa de Storage. Políticas permisivas adicionales en un remoto se combinan con OR y podrían ampliar acceso; el inventario remoto debe examinarlas todas. La ausencia de esas políticas adicionales en la base limpia no prueba su ausencia remota.

`supabase/tests/data_integrity_inventory.sql` prepara una lectura **sólo de catálogos**: tablas/RLS, columnas/defaults, políticas, grants de tabla/columna, claves, funciones/propietarios/ACL/rutas, triggers y configuración de los dos buckets. No consulta filas de aplicación, `auth.users` ni nombres de objetos. No se ejecutó remotamente. No incluye cuerpos de funciones con posibles literales sensibles; éstos requieren revisión autorizada por separado.

## Fallos reproducidos antes de la corrección

1. **Éxito sin fila confirmada.** `syncProfile`, actualización del día y altas/cambios/bajas de entradas sólo inspeccionaban `error`. PostgREST puede devolver una escritura de cero filas sin error. Una regresión nueva de `syncProfile` falló en main con `Missing expected rejection`. No se afirma que un usuario remoto haya sufrido este caso.
2. **Inicialización concurrente de perfil.** Una lectura inicial sin perfil seguida por `upsert ON CONFLICT DO UPDATE` podía sustituir una fila creada/configurada por otra pestaña por los defaults de bienvenida. La prueba de frontera reproduce esa intercalación; no es un incidente remoto demostrado.
3. **Dos pestañas/dispositivos, snapshot obsoleto.** Dos conexiones PostgreSQL leen pasos=100; una guarda 1000 pasos y la otra escribe el viejo 100 junto con agua=500. Resultado comprobado: `100:500`, se pierde la actualización de pasos. El bloqueo del store V9 sólo vive en un provider/pestaña y no lo impide.
4. **Guardado parcial día/comida.** Actualizar el día y fallar después el INSERT de comida conserva el día actualizado, porque son transacciones distintas. Reproducido con PostgreSQL; la misma secuencia del store se prueba con fallos inyectados.
5. **Guardado parcial de ejercicios.** Un UPDATE del primer ejercicio queda confirmado aunque el segundo falle. Reproducido con PostgreSQL en consultas separadas, como hace `updateRecord`.
6. **Respuesta perdida y reintento.** Un INSERT ya confirmado seguido del mismo ID recibe duplicado de clave; no crea una segunda fila, pero tampoco existe hoy un recibo duradero de la intención completa. Otro intento con nuevos IDs podría duplicar contenido. No se añaden reintentos automáticos.
7. **Lectura de confirmación fallida.** `fetchDailyLog` devuelve `null` tanto para ausencia como para error. El store antes podía devolver `true` aunque no hubiera obtenido una lectura final válida. Se agrega regresión y se corrige la confirmación; no se cambia la semántica pública del lector en este PR.

## Correcciones activas, sin cambio de esquema

- `src/lib/db.ts`: UPDATE/INSERT/DELETE mencionados solicitan `select('id').single()` y exigen identidad retornada. Error o cero filas rechazan; las operaciones existentes de avatar/onboarding/reset ya exigían confirmación. Un DELETE repetido no se declara exitoso sin evidencia de esta operación.
- Inicialización: `upsert(...,{onConflict:'id',ignoreDuplicates:true})` hace DO NOTHING. Si otra pestaña ganó, se lee la fila existente; no se reemplazan sus datos. Una fila todavía inaccesible o ausente es un error, no un perfil fabricado.
- `src/hooks/useAppStore.ts`: perfil sólo puede guardar con sesión/perfil propietario coherentes; sólo publica el cambio tras confirmar la persistencia. Un guardado de registro sin lectura final válida devuelve fallo y libera el bloqueo para un reintento explícito. Ante un fallo parcial se reconcilia lo que realmente quedó guardado; no se anuncia éxito de toda la operación.
- Los formularios existentes conservan borradores al devolver false/rechazar; la regresión de Perfil comprueba nombre y edad retenidos, cero mensajes de éxito al fallar y éxito sólo tras un reintento confirmado. Coach mantiene la confirmación explícita. No se agregan recargas, polling ni reintentos de escritura.

Estas correcciones no convierten el flujo actual en una transacción, no detectan todavía snapshots obsoletos entre dispositivos y no proporcionan entrega exactamente una vez en redes ambiguas. Las modificaciones simultáneas de perfil también requieren una futura política de conflictos/versiones antes de prometer protección equivalente.

## Propuestas SQL, fuera de la cadena automática de migraciones

Archivos en `supabase/proposals/data-integrity-v9-1/`. **No ejecutar estos archivos directamente sobre una instalación existente.** Son propuestas de migración y contrato para revisión, no una exportación ni una reparación idempotente del remoto. El CLI Supabase no está instalado en este workspace; no se inventó una migración fechada dentro de la cadena activa. Tras inventario/reconciliación se deberá generar una migración real con `supabase migration new`, revisar el diff y volver a probarla.

### 001_clean_baseline.sql

Reconstruye desde los consumidores del cliente una base limpia con perfiles, días, comidas y ejercicios. Transacción explícita; CREATE sin IF NOT EXISTS para fallar en lugar de disimular diferencias. Incluye UID inmutable por coherencia `profiles.id=user_id`, `daily_logs.profile_id=user_id`, unicidad usuario/día y FK compuesta hijo→(día,usuario,fecha). Esa FK impide relacionar una comida propia con el día de otra cuenta. Índices de hijos/propietario, revocación de grants heredados de defaults, CRUD autenticado sólo del propietario con USING/WITH CHECK. `anon` no tiene acceso.

Es un **modelo objetivo para base nueva**. No certifica que el remoto use IDs de perfil iguales a Auth, hijos obligatorios o las mismas claves. La auditoría remota debe encontrar duplicados de días, perfiles legacy, huérfanos y relaciones inconsistentes mediante un procedimiento autorizado antes de diseñar conversiones. No borrar ni normalizar automáticamente esos datos.

Compatibilidad comprobada contra `db.ts`: perfiles usan name/age/gender/height_cm/weight_kg/goal más las columnas de migraciones; días usan date/steps/water_ml/weight; comidas usan description/meal_type/calories/time_str/meal_details/photo_path; ejercicios usan activity_name/duration_min/calories_burned/workout_details/time_str/distance_km/pace_str. El campo `muscles` ya se reconstruye como array vacío en el lector actual y no existe en los payloads de persistencia; esta propuesta no inventa una columna para él. Los OR por id/user_id y profile_id/user_id del lector demuestran tolerancia legacy, **no** prueban las igualdades y claves que exige 001. Por eso 001 no es una migración de upgrade validada del remoto.

El bootstrap del test sólo proporciona stand-ins mínimos de `auth.uid`, `auth.users`, roles y tablas de Storage. Después aplica 001 y las siete migraciones existentes en orden. Supabase real administra Auth/Storage: esos stand-ins nunca se despliegan. La prueba no comprueba emisión/verificación JWT, URL firmada, límites de upload, API HTTP de Storage ni la configuración de PostgREST.

### 002_atomic_records.sql

Contrato propuesto: `save_daily_record_v1(operation_id,date,expected_version,day_json)`. Sin argumento user_id; usa `auth.uid()` y exige una identidad aún existente. Transacción completa en una sola llamada, sin llamadas externas.

- Revisión del día: ausencia exige expected_version=NULL; existencia exige coincidencia exacta. Los conflictos retornan SQLSTATE 40001 sin mutar datos. Una secuencia privada produce versiones que no se reutilizan al borrar/recrear un día, evitando aceptar un snapshot antiguo por coincidencia accidental de versión.
- Serialización por usuario con advisory transaction lock, también utilizado por reset. READ COMMITTED obligatorio; aislamientos superiores se rechazan de forma explícita. Otro usuario tiene una clave independiente. No hay espera de red dentro de la transacción.
- Snapshot completo: actualiza escalares, hace upsert de entradas y elimina sólo las omitidas del mismo día/propietario. Cualquier error revierte día, todos los hijos y recibo. Conserva notas, fotos, hora, distancia y ritmo de las entradas existentes. No recalcula calorías ni aplica fórmulas nuevas.
- IDs de entradas no se pueden mover entre cuentas o días. Además del chequeo previo, el ON CONFLICT condiciona la actualización a propietario/día/fecha y comprueba FOUND: protege también la carrera de dos usuarios con el mismo UUID aún no confirmado.
- Ledger privado `(user_id,operation_id)` guarda hash SHA-256 de fecha/versión/payload y un recibo mínimo (ID, revisión, operación), sin duplicar conversaciones, payload ni notas. La repetición idéntica devuelve el recibo original; reutilizar ID con otro contenido falla. El recibo no afirma que el estado actual siga siendo el original: el cliente siempre debe volver a leer el día.
- Reset conserva recibos: repetir una respuesta perdida anterior al reset no resucita registros. La baja de Auth elimina ledger por FK. No hay limpieza automática; definir retención, volumen y ventana de reintentos antes de beta. Eliminar recibos sin protocolo de expiración rompería esta garantía.
- SECURITY DEFINER deliberado, propietario de migración confiable y `search_path=''`. Autenticación, filtros de dueño y claves compuestas explícitos; EXECUTE revocado a PUBLIC/anon, sólo autenticados. Tabla y secuencia privadas inaccesibles al navegador. Revoca INSERT/UPDATE/DELETE directos sobre días/hijos, incluyendo los grants por columna de INSERT/UPDATE que un REVOKE de tabla no elimina, para impedir que un cliente antiguo evite el control de versión. Reset recibe un reemplazo autenticado con la misma serialización. **No agregar SECURITY DEFINER a los lectores ni conceder escrituras directas para sortear estos controles.** Revisar además membresías/roles heredados y otros RPC de escritura en el catálogo remoto antes de activar.
- Validación estructural, IDs únicos, valores no negativos en calorías/duración/pasos/agua, peso positivo si se envía, máximo operativo de 500 comidas y 500 ejercicios por snapshot. La fecha se valida como date PostgreSQL; no se impone un nuevo período de negocio. El futuro adaptador debe normalizar opcionales, limitar tamaño de solicitud y representar versiones bigint sin pérdida de precisión (por ejemplo como decimal string). No es todavía un contrato del cliente en producción.

### Integración y despliegue posteriores a revisión

1. Confirmar inventario remoto y obtener autorización explícita para trabajar en un entorno de ensayo con copias/fixtures sintéticos. Respaldar estructura y definir recuperación sin consultar información privada fuera del alcance autorizado.
2. Reconciliar 001 con las estructuras reales; producir una migración de upgrade que falle ante variantes desconocidas y preserve datos. Resolver incompatibilidades mediante revisión, no con ON CONFLICT destructivo ni borrados automáticos.
3. Implementar el adaptador del store que lea versiones y persista **una** operación por intención confirmada. El ID debe generarse una vez y reutilizarse sólo con los mismos parámetros ante respuesta ambigua. Conservar borrador; en conflicto recargar y pedir al usuario revisar, sin fusionar/reintentar un snapshot obsoleto silenciosamente. No cambiar confirmación de Coach.
4. Probar por HTTP PostgREST, Auth y Storage reales con dos cuentas sintéticas, dos sesiones y dos dispositivos. El frontend actual **no llama la RPC** y fallaría al guardar si se aplicara 002 ahora, porque se revocan los grants del escritor legacy. Se requiere transición coordinada en mantenimiento o mediante un protocolo revisado; permitir ambos escritores destruiría la garantía de versiones.
5. Probar también reset frente a un save pendiente, cierre/cambio/expiración de sesión, respuesta perdida tras commit, reintentos idénticos y conflictos. Aplicar límites de solicitud/tiempo, retención del ledger y observabilidad sin contenido sensible. No agregar reintentos ilimitados.
6. Rollback operativo seguro: pasar a lectura/mantenimiento y conservar esquema/recibos/versiones hasta reconciliar. No restaurar grants del escritor legacy mientras haya clientes transaccionales activos. No prometer un downgrade destructivo automático.

## Pruebas y resultados

Se registra el resultado final de la suite en `docs/data-integrity-v9-1-validation.json`. Los logs extensos permanecen fuera del repositorio; no contienen datos reales.

Resultado final: **404/404 pruebas**, 36 archivos en tres lotes disjuntos (131 + 151 + 122), cero fallos, cancelaciones y omisiones. El lote afectado se volvió a ejecutar tras los últimos cambios SQL/tests. TypeScript frontend (`tsc -b` dentro de build) y ambas API, lint, build y `git diff --check` aprobados. Lint mantiene 11 advertencias preexistentes; build mantiene el aviso de tamaño de chunk. PostgreSQL de esta auditoría: 17/17 pruebas contando el contenedor y sus 16 casos.

Durante la continuación hubo una ejecución sin conexión loopback aunque PostgreSQL anunció ready; se recuperó el permiso de red local y se repitió. Otra ejecución detectó una comparación CRLF/LF del test en Windows: se normalizó el separador de filas sin relajar las comprobaciones de contenido. Ninguno quedó pendiente en la ejecución final. El test inicial de `syncProfile` sí reproducía un defecto funcional y fallaba antes de la corrección.

Reproducción: `node --test --test-concurrency=1 tests/*.test.mjs`; para PostgreSQL nativo configurar `COACH_TEST_POSTGRES_BIN` al directorio de binarios instalado (en Windows se detecta PostgreSQL 17 en su ruta habitual). Sólo se inicia un clúster temporal en 127.0.0.1, nunca se consume una URL de base remota. Una ejecución que omita PostgreSQL por falta de binarios no cumple esta validación de seguridad.

- `tests/data-integrity-postgres.test.mjs`: PostgreSQL nativo 17, clúster nuevo en loopback con identidades UUID sintéticas A/B. Aplica baseline y todas las migraciones. RLS CRUD cruzado/propio y anon, integridad de FKs, ocho políticas reales de Storage, reproducciones legacy, rollback DDL/ACL, preservación de filas existentes, transacción fallida y reintento, concurrencia de creación/actualización/reintento, colisión de IDs entre usuarios, ledger privado, aislamiento de reset y no reutilización de versiones. Se usan procesos/conexiones independientes y se espera que PostgreSQL confirme la espera de lock; no se sustituye MVCC por un mock.
- `tests/data-integrity-client.test.mjs`: funciones reales de `db.ts` con frontera PostgREST simulada; cero filas, errores, confirmación, inicialización simultánea e intento duplicado tras respuesta perdida. No es una prueba contra PostgREST remoto.
- `tests/persistence.test.mjs`: regresión reproducida en main y aprobada tras corregir confirmación de perfil; conserva actividad, onboarding y datos previos.
- `tests/product-readiness.test.mjs`: store real con React/JSDOM y servicios simulados; sesiones tardías/cambio/cierre, bloqueo y reintento, propiedad de perfil, reconciliación parcial y rechazo de lectura final ausente.
- `tests/public-entry.test.mjs`: handlers reales de Perfil con hooks/servicios simulados; fallo conserva formulario y éxito espera la confirmación.
- La suite existente incluye guardado/confirmación de Coach, navegación a Inicio/Datos con React, conservación de borradores, fotos, objetivos/RLS, cuotas/Auth y endpoint compilado en condiciones serverless locales. Estos recorridos simulados no son pruebas autenticadas contra Preview.

## Procedimiento remoto recomendado — requiere autorización antes de ejecutarlo

1. Confirmar proyecto y entorno exactos sin imprimir claves. No asumir que el conector apunta a Calori. Autorizar primero lectura de metadatos y definir un entorno de ensayo; no usar cuentas privadas para el test.
2. Ejecutar el inventario read-only preparado. Comparar tablas, claves, índices, grants de tabla **y columna**, funciones/propietarios/search_path, triggers, políticas permisivas/restrictivas, exposición Data API y migraciones efectivamente aplicadas. Revisar Auth y Storage administrados por Supabase sin reemplazarlos.
3. Crear dos cuentas sintéticas en el entorno autorizado. Para cada tabla comprobar SELECT, INSERT, UPDATE y DELETE propios, cruzados, cambio de propietario y parent_id ajeno mediante la API con JWT de cada cuenta y con anon. No usar service_role para validar RLS: bypass invalidaría la prueba. Verificar también políticas de objetivos y denegación de tablas/cuotas/ledger privados.
4. Subir archivos sintéticos a ambos buckets; probar lectura/URL firmada, overwrite, rename y DELETE de archivos propios y ajenos. Verificar privacidad, MIME/tamaño y que una ruta de otra cuenta no pueda adjuntarse a una comida. No registrar URLs firmadas ni tokens.
5. Repetir los casos de concurrencia y fallos sobre el protocolo aprobado, desde dos sesiones. Confirmar contenido exacto e historial tras recarga y cambio de dispositivo; verificar que no cambien las fórmulas ni se dupliquen entradas. Inyectar fallo antes/después de commit y pérdida de respuesta; comprobar que sólo se confirma lo persistido.
6. Registrar evidencia sanitizada: resultado, SQLSTATE/status, operación sintética y revisión; sin nombres personales, conversaciones, credenciales ni payloads sensibles. Limpiar únicamente fixtures creados para esta prueba, con alcance aprobado.

## Condiciones pendientes para beta

- Catálogo/RLS/grants/Storage remoto verificados con autorización; no hay evidencia de acceso cruzado real ni certificación de aislamiento remoto en este PR.
- Revisión de baseline/upgrade, protocolo atómico, clientes con versiones/idempotencia y transición sin escritor legacy paralelo. Los guardados parciales y sobrescrituras entre dispositivos del escritor actual siguen siendo un bloqueo.
- Resolver política de conflicto para perfil; validar Auth real, expiración/cambio de cuenta y recuperación de red con cuentas sintéticas.
- Verificación real del Preview autenticado tras aplicar sólo en el entorno autorizado los cambios aprobados, más recuperación/backup, límites y retención del ledger. Validación de cuotas/presupuesto existente permanece necesaria; este PR no cambia su configuración.

Fuentes consultadas: [RLS y su interacción con SELECT/UPDATE](https://supabase.com/docs/guides/database/postgres/row-level-security), [retorno de filas en update con select](https://supabase.com/docs/reference/javascript/update), [changelog de Supabase](https://supabase.com/changelog). La nota de retirada de cifrados TLS antiguos no requiere modificar esta propuesta SQL; no se actualizaron dependencias.
