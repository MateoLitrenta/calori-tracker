# Calori V9.1 — Security compatibility & RLS hardening

## Estado y conclusión

**Actualización del gate de integración (2026-11-03): BLOCKED.** La validación inicial de este PR que se detalla abajo es histórica. El harness ahora evita la reserva/liberación de puertos y conserva diagnósticos sanitizados, pero la terminación nativa intermitente con salida 3 también se reprodujo con puerto automático. Ver [informe de integración y bloqueo vigente](integration-gate-v9-1.md) y [resultados de las repeticiones completas](integration-gate-v9-1-validation.json). No considerar aprobada la integración por el resultado inicial 396/396 ni por una prueba aislada.

Rama independiente `codex/security-rls-hardening-v9-1`, creada desde main `8cbade05cc9339fd405421d88c5c5445f7931ace` (merge del PR #69). Se conservaron `security-fixtures.mjs` y los fixtures de la sesión interrumpida. Main fue actualizado/verificado al retomar; el PR #70 sigue en borrador en `3bc5d62cd3ab4cf921b9e4a795d8295a58ff0e24`, sin modificaciones de esta tarea.

**Hay dos vulnerabilidades de aislamiento reproducidas localmente con el modelo del catálogo real proporcionado:** identidad mixta en perfiles con lectura/escritura por ambas cuentas, y asociaciones de comidas/ejercicios a días de otro propietario. La primera también se reproduce por HTTP con PostgREST real y dos JWT sintéticos firmados. No se ha ejecutado un ataque ni una consulta SQL sobre Supabase remoto; no se afirma un incidente sobre datos de usuarios reales.

La corrección es una **propuesta de actualización**, exclusivamente en `supabase/proposals/security-rls-v9-1/`. No modifica el frontend, fórmulas, Auth, Coach, IA, cuotas, Storage, objetivos o variables de entorno. No instala ni llama `002_atomic_records.sql`. No habilita la beta ni cambia la seguridad de Production por publicar este PR.

## Metadatos utilizados y límites

Fuente: inventario entregado por el usuario en la continuación del 3 de noviembre de 2026, obtenido previamente mediante consultas remotas de metadatos de sólo lectura. En esta tarea no se repitieron consultas remotas ni se solicitaron nuevamente esos metadatos.

- Las cuatro tablas tienen ENABLE RLS, sin FORCE. `profiles`: política ALL, roles PUBLIC, USING y WITH CHECK `auth.uid()=user_id OR auth.uid()=id`. Días, comidas y ejercicios: ALL/PUBLIC, USING y WITH CHECK `auth.uid()=user_id`.
- `profiles.id` PK/FK a Auth; `user_id` FK a Auth, sin igualdad entre ambas. Día: PK id, UNIQUE(user_id,date), `profile_id` nullable y FK simple a profiles. Hijos: FK simple `daily_log_id` a daily_logs, sin garantía compuesta de propietario. Las fechas de comidas/ejercicios admiten NULL.
- Anon y authenticated tienen SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN de tabla, sin ACL por columna. Postgres y service_role conservan privilegios amplios.
- CHECKs de actividad y rutas de fotos; buckets privados `avatars` y `meal-photos` con políticas de propietario. No se observaron triggers de usuario en las cuatro tablas.

El fixture `tests/fixtures/security-rls/remote-shape.sql` reconstruye esas condiciones, **no es un dump remoto**. Los tipos de campos de negocio, defaults y nombres de constraints no entregados se modelan según los consumidores del repositorio. Se usan stand-ins mínimos de Auth y Storage; las políticas de fotos, la función de reset y la migración de objetivos se cargan desde los SQL versionados sin modificarlos.

Para una autorización de despliegue todavía falta cotejar el catálogo completo de columnas/tipos/defaults y versiones PostgreSQL/PostgREST, nombres y acciones exactas de todas las FKs, roles heredados y funciones/RPC con privilegios elevados. No se inventa una ausencia de políticas ni se equipara el fixture a una certificación del remoto. El preflight aborta ante variantes de estructura que la propuesta no admite.

## Reproducciones sintéticas

Identidades fijas de prueba: A termina en `...0001`, B en `...0002`, ambas presentes en `auth.users` local. Todas las filas y JWT son sintéticos; las operaciones destructivas de prueba se limitan al clúster descartable o se revierten con ROLLBACK.

### Identidad de perfil

Con la política OR, A puede crear `id=A,user_id=B`: satisface la rama `id=A`, la PK está libre y ambas FKs apuntan a identidades existentes. B puede leerlo por la rama `user_id=B`. También se reproduce actualizar el `user_id` de un perfil de A a B; B puede leer y cambiar su nombre. PostgREST local confirma INSERT por A y SELECT singular por B con JWT distintos válidos.

Cambiar `profiles.id` de A a B también funciona cuando ese id está libre y no hay referencias que lo impidan. Con id ocupado o referencias existentes la operación falla por PK/FK; **no se clasifica como cambio siempre posible**. No se atribuye el rechazo a una protección RLS inexistente: son restricciones efectivas de cada caso.

Causa: dos identificadores de autorización editables unidos por OR; ninguna restricción exige una sola identidad. Las FKs independientes sólo prueban que A y B existen, no que sean la misma cuenta.

### Asociaciones ajenas

A puede insertar una comida o ejercicio con `user_id=A,daily_log_id=día_de_B`; puede también cambiar el parent_id de su propia entrada a ese día. La política sólo verifica el propietario del hijo y la FK simple sólo verifica que el día exista. A puede cambiar el `profile_id` de su propio día a B por el mismo motivo.

**No se reprodujo lectura directa del contenido del día de B por A:** su RLS lo oculta; B tampoco ve el hijo de A bajo RLS. Es una ruptura de integridad referencial y aislamiento de asociaciones, no evidencia de que todo el contenido del padre quede automáticamente expuesto. Los efectos de joins o RPC privilegiados remotos requieren revisión específica.

Las transferencias de `daily_logs.user_id`, `meals.user_id` y `workouts.user_id` de A a B fueron rechazadas por WITH CHECK. No se presentan como vulnerabilidades confirmadas.

### Privilegios excesivos

TRUNCATE omite RLS: se demuestra que el rol authenticated en SQL directo puede vaciar también las filas sintéticas de B; el test revierte la transacción. Los grants de REFERENCES, TRIGGER y MAINTAIN se verifican como privilegios efectivos.

Esto **no prueba acceso SQL directo de un usuario de la app**. Una petición HTTP con método TRUNCATE a PostgREST local devuelve 405. No se demostraron exploits HTTP de REFERENCES/TRIGGER/MAINTAIN ni se supone que PostgREST exponga cualquier comando SQL. Deben retirarse como privilegios innecesarios y revisar RPCs que pudieran exponer operaciones elevadas. No se ejecutó VACUUM, ningún trigger malicioso ni DDL sobre un remoto.

## Propuesta de RLS, identidades y referencias

Se conservan las políticas existentes para trazabilidad y se añade una puerta **RESTRICTIVE/PUBLIC/ALL** con USING/WITH CHECK. Las políticas permisivas se combinan por OR; la puerta restrictiva se combina por AND, de modo que agregar otra permisiva no evita la restricción. Se añaden políticas explícitas SELECT/INSERT/UPDATE/DELETE para authenticated. El preflight rechaza políticas restrictivas preexistentes que requieran reconciliación.

- Perfil: `auth.uid()=id AND auth.uid()=user_id`, más CHECK id=user_id. Sólo una cuenta puede satisfacer ambas identidades.
- Día: propietario por user_id; profile_id puede ser NULL (sin asociación) o debe ser la misma identidad. CHECK equivalente y FK compuesta `(profile_id,user_id)` → `profiles(id,user_id)`.
- Hijos: propietario por user_id; FK compuesta `(daily_log_id,user_id)` → `daily_logs(id,user_id)`. User_id y vínculo diario son obligatorios; si un remoto admite hijos independientes, el preflight debe detenerse para una decisión explícita.
- UNIQUE adicionales `(profiles.id,user_id)` y `(daily_logs.id,user_id)` sirven de claves referenciadas. Se conservan PKs y UNIQUE usuario/día existentes.

**Se conservan los NULL documentados** de profile_id y fechas de los hijos; no se rellenan ni rechazan automáticamente. Las FKs de dos columnas garantizan propiedad aun si la fecha es NULL. Este PR no impone una nueva igualdad de fechas ni modifica períodos de negocio; la calidad de fechas sigue siendo un tema de integridad separado.

La propuesta reemplaza la FK simple existente por la compuesta, con el mismo nombre, acciones ON UPDATE/DELETE y deferrabilidad. No deja dos relaciones paralelas que provocarían PGRST201 en `meals(*)`/`workouts(*)`. Se prueban las variantes NO ACTION y CASCADE, incluida una FK inicialmente diferida. SET NULL/SET DEFAULT se rechazan por necesitar un diseño específico para claves compuestas; no se cambian silenciosamente. Tras commit se notifica la recarga de esquema de PostgREST.

## Grants mínimos y compatibilidad con clientes antiguos

Se revoca ALL de tabla y de columnas a PUBLIC/anon/authenticated antes de conceder lo necesario. Esto elimina TRUNCATE/REFERENCES/TRIGGER/MAINTAIN y grants de columna anteriores. Anon queda sin acceso a estas cuatro tablas. Authenticated conserva SELECT para leer sus filas y confirmar escrituras; INSERT limitado al payload del cliente y UPDATE a sus campos editables. No puede actualizar fechas, timestamps o identidades/vínculos de días e hijos. DELETE se permite para días/hijos propios; no se concede DELETE de perfil porque el cliente no lo necesita. Reset de registros sigue disponible mediante su función invoker y no borra perfiles.

**Excepción explícita de compatibilidad:** UPDATE(id,user_id) del perfil se conserva porque el upsert ON CONFLICT DO UPDATE de main lo exige incluso cuando inserta o asigna los mismos valores. No permite cambiar sus valores: la fila original y la nueva deben tener ambos identificadores iguales al mismo auth.uid, además del CHECK. Se prueban los intentos de transferencia y el inicializador real de main. El inicializador DO NOTHING del PR #70 también funciona, y evita además la carrera de defaults que main todavía tiene.

Los permisos de postgres/service_role no cambian. Los clientes no deben ser propietarios de tablas ni tener BYPASSRLS/superuser. El postflight comprueba privilegios efectivos, incluyendo los heredados: si un rol auxiliar conserva privilegios excesivos, la transacción aborta. No se amplían grants para disimular una prueba fallida.

## Actualización preparada y recuperación

Todos los scripts quedan fuera de `supabase/migrations`; no se copian ni ejecutan automáticamente. `001_clean_baseline.sql` y `002_atomic_records.sql` del PR #70 no se utilizan ni se modifican.

1. `000_preflight.sql`: transacción read-only/repeatable-read; incluye `010_checks.sql`. Comprueba esquema, PK/FKs/unique, RLS/roles, triggers/columnas desconocidas y consistencia de propietarios. Los errores dan conteos y categorías, sin imprimir nombres personales ni filas.
2. `020_upgrade.sql`: una transacción, lock_timeout 5 s y statement_timeout 60 s; bloquea las cuatro tablas en orden con ACCESS EXCLUSIVE. Vuelve a ejecutar el preflight bajo bloqueo para evitar cambios entre comprobación y aplicación. Añade constraints, sustituye relaciones, aplica RLS/grants y ejecuta el postflight antes del commit. No contiene UPDATE/DELETE/TRUNCATE de datos ni recrea tablas.
3. `030_postflight.sql`: aserciones read-only de privilegios y confirmación SELECT, también dentro de la actualización para revertir ante un fallo.
4. `040_readonly_recovery.sql`: rollback operativo a mantenimiento de sólo lectura; revoca escrituras de tabla/columna, conserva SELECT aislado, datos y restricciones. No reinstala las políticas o grants vulnerables.

`row_security=off` en los chequeos no otorga bypass: hace fallar una consulta que fuera filtrada por RLS. Se requiere propietario de migración sin filtrado, sin usar JWT/service_role para fingir una prueba de aislamiento. Los locks pueden interrumpir solicitudes; se exige ventana de mantenimiento. Un timeout/fallo antes de commit revierte DDL, grants y políticas juntos. Se prueban fallo inyectado y comparación exacta de filas/catálogos.

### Respaldo y revisión controlada — sólo después de autorización

Confirmar proyecto/entorno y el inventario completo, revisar los scripts contra ese catálogo y aprobar un entorno de ensayo. Antes de una operación autorizada, obtener respaldo completo y de esquema con un procedimiento seguro del proyecto; conservarlo cifrado, con acceso limitado y retención acordada. No poner DSN, claves o dumps reales en el chat ni en Git. Ensayar restauración en una base aislada, sin tráfico de clientes. La prueba local usa pg_dump/psql únicamente contra el loopback sintético y comprueba igualdad de datos restaurados.

Si el preflight encuentra identidades mixtas, asociaciones ajenas, huérfanos o estructuras desconocidas, **detenerse**. No decidir el dueño a partir de id o user_id, no rekeyear, borrar ni normalizar en masa. Requiere revisión autorizada, trazabilidad y una reparación separada que considere referencias, fotos y objetivos. Los datos originales se conservan.

En ensayo, ejecutar con psql `-X -v ON_ERROR_STOP=1 -f .../000_preflight.sql`; después de revisión/backup, `.../020_upgrade.sql`. Son scripts psql con `\ir`, no bloques para pegar parcialmente en el SQL Editor. Verificar ambas cuentas, caché de relaciones, fotos, objetivos, reset y los clientes soportados antes de autorizar un despliegue. Ante problemas posteriores al commit, entrar en sólo lectura con 040 y preparar una corrección hacia adelante. Restaurar un backup con políticas antiguas sólo en una base aislada; no reabrir tráfico con permisos vulnerables ni perder escrituras posteriores al backup.

## Compatibilidad comprobada con PR #70

Se guardan copias de `db.ts` y `useAppStore.ts` de `3bc5d62` como strings JSON, con SHA-256 del código decodificado normalizado a LF, sin cambiar el PR ni el código de la app. La codificación conserva los espacios originales sin introducir whitespace al final de líneas del diff. Las funciones se decodifican, transpilan y ejecutan; no se reimplementa su persistencia en el test.

Por HTTP a PostgREST local real se comprueban inicialización, onboarding, syncProfile, alta/actualización de día, comidas/ejercicios, edición/borrado, notas/foto/distancia/ritmo, lecturas anidadas, reset y confirmaciones `.select('id').single()`, antes y después del endurecimiento. Escrituras sobre filas ausentes rechazan; un JWT con firma alterada da 401. El store real del fixture, montado con React/JSDOM, guarda perfil y un día con comida/ejercicio y publica el estado compartido sólo con las confirmaciones del backend real.

Auth del store se simula para proporcionar la identidad inicial; PostgREST sí verifica HMAC, establece el rol y aplica RLS en PostgreSQL. **No es una prueba de Supabase Auth remoto**, renovación de sesión, OAuth o revocación de tokens. El adaptador de transporte de supabase-js sólo quita el prefijo `/rest/v1` para llegar a PostgREST directo; no simula respuestas.

Storage y objetivos: se prueban por SQL las políticas versionadas de fotos (INSERT/SELECT/UPDATE/DELETE propios y denegación ajena), rutas de foto en persistencia y aceptación/seguimiento por versión de objetivos propios. No se levanta el servicio HTTP de Supabase Storage, ni se certifican uploads, MIME/tamaño o URLs firmadas reales. La suite existente conserva las regresiones de objetivos, sesiones, Coach y cuotas.

## Resultados y reproducción

Resultados finales y manifiesto en `docs/security-hardening-v9-1-validation.json`. La suite dedicada usa PostgreSQL 17.5 y PostgREST 16.5, ambos locales, con bases descartables. El binario oficial Windows de PostgREST se obtuvo del release v16.5 y su SHA-256 se cotejó con el digest publicado: `17f595b0d8dd37473d0231417dea07c5ac9f791282ff5b017fae51ff29e5de2f`. Sus DLL de libpq provienen de PostgreSQL ya instalado, copiadas junto al ejecutable en el directorio de herramientas, sin alterar PATH ni variables de entorno. No se versionan binarios, configs efímeras, tokens ni dumps.

**Resultado: 396/396 pruebas en 35 archivos**, lotes disjuntos 141 + 138 + 117; cero fallos, cancelaciones y omisiones. La suite dedicada aporta 18 casos contando sus contenedores. TypeScript frontend (`tsc -b` dentro del build) y ambas API, lint, build y diff check aprobados. Se mantienen 11 advertencias previas de lint y el aviso de tamaño de chunk. Los harness de React muestran avisos de act; no quedan pruebas fallidas. El lote afectado se repitió tras corregir la consulta del test que concatenaba el tipo interno PostgreSQL `char` sin convertirlo a texto; la migración no necesitó ese cambio y las aserciones se conservaron.

Ejecutar `node --test tests/security-hardening.test.mjs`. El helper crea un clúster exclusivo en loopback y usa binarios instalados; PostgREST se detecta en `../security-tools/postgrest/postgrest.exe` en Windows, o mediante la ruta de test ya configurada. En otro equipo debe prepararse esa dependencia desde la fuente oficial. Una ejecución que omita PostgreSQL/PostgREST **no cumple** la validación de seguridad/HTTP. No consume una URL remota ni la configuración de Production.

Los primeros intentos HTTP encontraron el runtime libpq ausente y un plazo de arranque demasiado corto en Windows. Se completaron dependencias locales y se amplió sólo la espera de disponibilidad del proceso de test; no se añadieron reintentos de registros, de IA o del producto. Los logs permanecen fuera del repositorio y contienen fixtures, no información personal.

## Condiciones de aprobación y beta

- El PR #70 puede revisarse por separado: sus confirmaciones son compatibles con las políticas SELECT actuales descritas y con este endurecimiento en PostgreSQL/PostgREST local. Ese resultado no equivale a autorizar aplicar SQL en Production ni a certificar datos legacy.
- Para aprobar el endurecimiento: cotejo final del catálogo, preflight autorizado sin inconsistencias, estrategia para toda fila legacy incompatible, respaldo restaurable, ensayo con Auth/Storage reales y clientes soportados, ventana de mantenimiento, recuperación read-only y revisión de RPCs/roles elevados.
- Antes de habilitar usuarios externos, las vulnerabilidades de identidad y asociaciones deben estar corregidas y verificadas en el entorno autorizado. Publicar este PR no las corrige remotamente. Main conserva la carrera de inicialización y otras debilidades de confirmación que atiende el PR #70: no omitir esa entrega independiente.
- Los conflictos entre dispositivos, guardados multiconsulta parciales e idempotencia de la intención completa siguen pendientes de una integración coordinada de cliente y base. No se activa el protocolo atómico ni se promete que el endurecimiento por sí solo resuelva esos riesgos.
- Para V9.2: cerrar esos gates de datos/seguridad y las pruebas autenticadas reales antes de ampliar funcionalidades. No hacer merge ni despliegue automático de ninguno de los PR.

Referencias: [RLS y combinación de políticas](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), [seguridad por columna](https://supabase.com/docs/guides/database/postgres/column-level-security), [representación singular y error PGRST116](https://docs.postgrest.org/en/stable/references/api/resource_representation.html), [release oficial PostgREST v16.5](https://github.com/PostgREST/postgrest/releases/tag/v16.5).
