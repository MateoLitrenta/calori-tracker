# Seguridad y confiabilidad de IA

## Auditoría previa (9 de octubre de 2026)

Base: `main`, con #51, #52 y #53 integrados; rama `codex/ai-security-reliability-v1`.

- La app usa Supabase Auth con `getSession` y `onAuthStateChange`; el SDK mantiene y refresca la sesión. El cliente contiene únicamente URL y clave publicable del proyecto `ziclplqhbrpvcqjjqoau`.
- Hay un único endpoint de IA: `/api/ai/chat`, que multiplexa chat, estimaciones de comidas/ejercicios (texto e imágenes) y transcripción de audio. Las tres rutas de cliente usan `src/services/aiService.ts`; ninguna envía actualmente un access token.
- `GEMINI_API_KEY` y `GEMINI_MODEL` se leen solo en el servidor. No se encontró una service role key en código ni variables privadas de IA usadas por Vite.
- Se conservan límites de mensajes, texto, medios, MIME, contexto semanal, validación de acciones/fechas, confirmación de comidas/ejercicios, persistencia por usuario/conversación, snapshots y constructor único de métricas.
- Falta autenticación en el endpoint, cuota persistente y timeout de Gemini. Algunos logs de errores externos imprimen mensajes sin control; el cliente intenta interpretar JSON antes de distinguir el estado HTTP.
- Hay migraciones PostgreSQL/Supabase en el repositorio. No se pudo verificar el esquema remoto: el conector Supabase devuelve una referencia distinta de la del cliente. **No se ejecutó SQL en ese proyecto.** No se comprobó ninguna infraestructura de cuotas existente.
- El conector Vercel previamente devolvió 403 para el equipo de Calori; no se asume acceso actual a variables, logs ni protección del preview.

## Decisiones externas pendientes antes de activar

Preparar la migración para PostgreSQL existente y validar en una base desechable; no agregar Redis ni servicios pagos. El servidor necesitará una clave privada de Supabase del mismo proyecto, únicamente para un RPC de cuotas reservado a `service_role`. Los clientes no podrán invocarlo ni elegir límites. No hay autorización para crear/rotar claves ni modificar un proyecto remoto no verificado.

El usuario definió cupos piloto: **30 llamadas de texto, 10 de imágenes y 10 de audio por día y usuario**, con presupuesto de referencia **US$ 20/mes**. Son provisionales para desarrollo/pruebas, no cupos comerciales Free/Pro/Ultra. La [tarifa oficial de Gemini](https://ai.google.dev/gemini-api/docs/pricing) depende del modelo, modalidad y tokens; el modelo del repositorio es `gemini-2.5-flash`, pero el valor desplegado y la facturación real no se pudieron comprobar. Los contadores limitan llamadas reales al proveedor, incluyendo la corrección temporal interna existente. Una solicitud de audio seguida de chat consume audio y texto por separado. Las estimaciones solo con texto comparten el cupo de texto; una imagen con texto consume imagen.

No habilitar el endpoint protegido sin aplicar la migración y configurar los secretos/cupos del entorno correspondiente. Ante configuración o almacenamiento ausentes, bloquear consumo de Gemini con un error transitorio controlado; nunca dejar una vía ilimitada.

## Autenticación y credenciales

El cliente obtiene el access token actual con `supabase.auth.getSession()` y lo envía por `Authorization: Bearer` en todas las modalidades. No añade un ID de usuario. Se mantiene el refresco normal del SDK, sin cerrar sesión ni reintentar automáticamente solicitudes a IA.

El backend usa el [mecanismo oficial de verificación del servidor Auth](https://supabase.com/docs/guides/auth/jwts#verifying-with-a-shared-secret-signing-key): `GET /auth/v1/user` con la clave publicable y el bearer. Funciona con claves de firma simétricas y asimétricas, sin asumir que JWKS contiene una clave. Después del éxito del proveedor, exige ID/subject coincidentes, issuer del proyecto compartido con el cliente, audience `authenticated`, role `authenticated`, expiración vigente y `nbf` válido cuando existe. Decodificar claims sin el éxito previo del proveedor nunca autoriza. Fallos de red/Auth devuelven 503, no un falso 401 que fuerce cerrar sesión.

La configuración pública se movió sin cambiar valores a `src/lib/supabaseConfig.ts`. **Es una clave publicable, no una credencial privada.** La clave privada de cuotas permanece solo en variables del servidor. No se creó ni rotó ninguna credencial. El SDK de Supabase no se importa en la función serverless; el verificador y el RPC usan REST del proyecto fijo.

## Cuotas persistentes y concurrencia

Aplicar `supabase/migrations/202610090001_ai_usage_quotas.sql` al proyecto verificado. Crea `ai_private.daily_usage`, con RLS habilitada y sin permisos de esquema/tabla para clientes, y `public.reserve_ai_quota`, ejecutable solo por `service_role`. Se fija `search_path = ''`. No cambia tablas de registros, Auth, perfiles ni políticas existentes.

El servidor deriva el usuario del token verificado y envía solo esa identidad al RPC con su clave privada. Los límites nunca vienen del cuerpo del cliente. Un único UPSERT reserva cada llamada bajo bloqueo de fila, con clave `(user_id, quota_day, category)`, sin lectura y escritura separadas. Funciona entre instancias y regiones contra la misma base.

La fecha y el próximo reinicio se calculan en PostgreSQL en **UTC**, independientemente del reloj/fecha enviados por el cliente. El RPC conserva el menor límite visto durante el día para que una instancia anterior no eleve el cupo: los aumentos se aplican al siguiente día UTC; las reducciones no deshacen uso ya consumido. Un límite 0 pausa esa modalidad. No borrar contadores para ampliar cuotas.

Se reserva antes de cada invocación de Gemini, incluyendo el segundo intento de corrección temporal existente. Solicitudes inválidas no reservan. Intentos con timeout, fallo del proveedor o resultado malformado conservan la reserva: el costo real podría haberse producido aunque no recibamos la respuesta. Un timeout de RPC podría reservar sin llamar Gemini; no hay devolución insegura ni vía gratuita por fallos. Los buckets nuevos evitan bloqueos permanentes. Un 429 incluye `Retry-After` y `retryAfterSeconds`; un fallo de almacenamiento devuelve 503 con reintento, sin invocar Gemini.

## Variables de Vercel (solo servidor)

| Variable | Requerida | Valor piloto / significado |
| --- | --- | --- |
| `GEMINI_API_KEY` | Existente | Mantener la credencial del proyecto Gemini verificado |
| `GEMINI_MODEL` | Existente, opcional | Se conserva `gemini-2.5-flash` como fallback del código |
| `SUPABASE_AI_SECRET_KEY` | Nueva | Clave privada `sb_secret_…` o legacy service role del **mismo proyecto de Calori** |
| `AI_TEXT_DAILY_LIMIT` | Nueva | `30` |
| `AI_IMAGE_DAILY_LIMIT` | Nueva | `10` |
| `AI_AUDIO_DAILY_LIMIT` | Nueva | `10` |
| `AI_GEMINI_TIMEOUT_MS` | Nueva, opcional | `30000` por defecto, entero entre 1 y 30000 ms |

Los tres cupos se configuran explícitamente; no hay fallback ilimitado. No usar prefijo `VITE_` para variables privadas ni copiar `.env` al repositorio. No configurar secretos en el preview de un fork no confiable. No compartir service role en cliente, respuestas o logs. Usar proyectos y credenciales separados para pruebas cuando estén disponibles; si preview/producción comparten la base, comparten también los contadores por usuario.

## Errores y tiempo de ejecución

Respuestas JSON con `error` y `code`, `Cache-Control: no-store`, y tiempo de reintento cuando existe. 400: petición inválida; 401: bearer ausente/inválido/expirado; 429: cuota propia agotada; 500: fallo interno inesperado; 502: respuesta inválida/rechazada del proveedor; 503: Auth, cuotas o proveedor temporalmente indisponibles. Un 429 del proveedor se presenta como indisponibilidad temporal (503), separado del cupo propio.

Auth tiene timeout de 8 s, lectura del request de 10 s, cuotas de 5 s y Gemini de 30 s como máximo, incluido el consumo del cuerpo de respuesta. La ventana restante del request limita las llamadas a Gemini a 55 s desde el inicio, con `maxDuration: 60` en la función y 60 s en el cliente. Validar este valor en Vercel antes de activar. El cuerpo JSON está limitado a 4.4 MB sin confiar en Content-Length; se mantienen los límites previos de medios/mensajes/contexto.

El cliente distingue el estado HTTP incluso si Vercel devuelve HTML o JSON roto; nunca muestra mensajes sin controlar del proveedor. No reintenta automáticamente ni borra historial. Comidas/ejercicios siguen siendo propuestas que se guardan con Confirmar. La transcripción muestra también los errores de sesión/cuota.

## Monitoreo por modalidad y presupuesto

Vercel → proyecto → **Logs / Runtime Logs**, filtrar `/api/ai/chat` y evento `ai_request`. Cada solicitud emite endpoint, estado, duración, modalidad, modo, resultado, categoría y cantidad de llamadas al proveedor. Incluye solo conteos numéricos de `usageMetadata`; `tokenCoverage` distingue datos completos, parciales y ausentes. Sin metadata se usa null, no un consumo cero inventado. No hay usuario, token, clave, conversación, nutrición ni excepción cruda en esos eventos.

Para un resumen persistente de llamadas reservadas por modalidad, ejecutar como administrador en SQL Editor del proyecto verificado:

```sql
select quota_day, category, sum(used) as reserved_calls
from ai_private.daily_usage
group by quota_day, category
order by quota_day desc, category;
```

Esto mide reservas, no dólares ni exactamente llamadas facturadas. Los tokens de logs pueden faltar en timeouts y no sustituyen facturación. No se agregó un servicio de monitoreo pago. Los contadores tienen FK a Auth con CASCADE para no conservarlos al eliminar una cuenta; definir una retención operativa y purgar buckets antiguos solo después del período de auditoría que se decida.

### Alertas US$ 20 mensuales

En la cuenta de facturación asociada al **proyecto Gemini realmente usado**: Billing → Budgets & alerts → crear presupuesto mensual fijo **USD 20**, filtrando ese proyecto y el servicio de facturación que cubra su Gemini Developer API. Verificar ese service ID y no confundirlo con Vertex AI. Configurar umbrales de gasto real **50 %, 80 % y 100 %** (US$ 10, 16 y 20) y los destinatarios autorizados. `docs/ai-budget-alerts.example.json` proporciona una plantilla de la Budget API con placeholders obligatorios; no aplicarla hasta reemplazar proyecto/servicio y confirmar la cuenta y permisos. **Las alertas no fueron creadas ni activadas remotamente.** No hay credenciales ni acceso verificado a Cloud Billing.

Los [presupuestos de tipo alerts-only](https://docs.cloud.google.com/billing/docs/how-to/budgets) avisan, pero no detienen consumo. Los límites diarios por usuario **no garantizan US$ 20/mes**: aumentan con la cantidad de usuarios, el tamaño del contexto, imágenes/audio, errores facturados y otras aplicaciones que usen la misma credencial/proyecto. Los avisos y datos de facturación pueden llegar con demora.

Para control global, evaluar y verificar la disponibilidad del [spend cap del proveedor](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps) en el servicio/cuenta reales; no asumir que aplica a esta cuenta. También configurar cuotas globales del proyecto Gemini y limitar la cantidad de cuentas piloto. Un corte exacto desde la app requeriría presupuesto global persistente y reservas conservadoras de costo máximo por llamada, contabilizando todas las aplicaciones y el retraso del proveedor; no se implementa una falsa estimación como techo. Como pausa operativa del endpoint, fijar los tres cupos a 0 y redesplegar todos los entornos activos; no supone un corte instantáneo de llamadas ya iniciadas ni del uso externo a Calori. No deshabilitar facturación de otros servicios.

## Despliegue manual seguro (pendiente)

1. Confirmar proyecto Supabase de Calori, esquema, roles y credencial privada. Aplicar la migración en un entorno de pruebas del proyecto correcto y verificar que el RPC admite solo el rol del servidor. El conector apuntó a otro proyecto; no usarlo hasta corregirlo.
2. Configurar secretos/cupos en el preview correcto, revisar el modelo y el límite de duración de la función. Desplegar la rama sin merge. Si falta una variable, la función debe devolver 503 y no gastar Gemini.
3. Verificar con sesión real: sin bearer → 401; bearer inválido/expirado → 401; sesión vigente → 200 en chat, imagen y audio. No poner tokens en comandos de ejemplo, capturas o logs. Probar desde el cliente autenticado o un cliente HTTP que lea credenciales de forma privada.
4. En el entorno de prueba usar un cupo pequeño: varias solicitudes simultáneas del mismo usuario no deben excederlo; otro usuario/modalidad conserva su cupo. Comprobar 429 y Retry-After. Restaurar 30/10/10 para el piloto; los aumentos surten efecto en el siguiente bucket UTC. No realizar pruebas destructivas en producción.
5. Verificar persistencia de contadores entre invocaciones/instancias, fallo seguro si el RPC no está disponible, tarjetas, “¿Cómo comí en los últimos 7 días?”, “¿Cómo vengo entrenando?”, gasto diario y confirmación de registros. Revisar Runtime Logs sin datos personales.
6. Crear/verificar las alertas de presupuesto con el procedimiento anterior y probar sus canales. Solo después de esas comprobaciones, configurar producción y solicitar revisión del PR. **No realizar merge ni activar restricciones de producción automáticamente.**
7. Proteger o retirar previews antiguos que tengan la implementación anterior para que no queden rutas de consumo abiertas fuera de esta protección. No relajar Deployment Protection para ejecutar pruebas.

## Evidencia local y límites

Los tests usan mocks de Auth/Gemini y PostgreSQL local PGlite para ejecutar la migración y su RPC. Verifican permisos, atomicidad del UPSERT, concurrentes, aislamiento, rechazo de tokens, errores, timeouts y privacidad. PGlite serializa sus consultas locales: no es una prueba de carga distribuida del PostgREST desplegado; esa comprobación figura en el procedimiento manual.

La regresión del endpoint compila sus dependencias reales y ejecuta solo JavaScript con TypeScript nativo desactivado, haciendo POST HTTP a la función. Se conserva `rewriteRelativeImportExtensions` del #53 y se validan las importaciones nuevas del servidor/configuración pública. La compilación y mocks no validan firma/configuración Supabase real, disponibilidad del RPC desplegado, Gemini real ni presupuesto/alertas reales. No afirmar ejecución remota sin esa evidencia.

Validación del 9 de octubre: suite completa **224/224**, TypeScript del cliente y del endpoint, lint sin errores (13 advertencias en líneas existentes), build de producción y `git diff --check`. Además se generó localmente el artefacto con el builder oficial `@vercel/node@23.0.0`, TypeScript 6.0.3 y runtime Node.js: cargó con TypeScript nativo desactivado y pasó un POST sin token (401) y tres POST de Coach (200), con Auth/cuotas/Gemini simulados. La inspección de los 18 archivos de `dist` no encontró los identificadores de variables privadas ni las claves sintéticas de las pruebas. No se aplicaron migraciones, variables ni alertas remotas.

## Actualización de validación v1.1 (9 de octubre de 2026)

La evidencia anterior corresponde a la implementación inicial. Posteriormente el usuario informó que aplicó la migración en el proyecto correcto, configuró `SUPABASE_AI_SECRET_KEY` y cupos 30/10/10 **solo en el Preview de esta rama**, y redesplegó. Reportó dos consultas reales de Coach con Gemini, tarjetas y valores correctos y contador de texto `used=1` y luego `used=2`, con `daily_limit=30`. También comprobó existencia de tabla/RPC y permisos de ejecución: `anon` y `authenticated` denegados; `service_role` permitido. **Son comprobaciones remotas aportadas por el usuario, no ejecutadas por el agente.** Production y las alertas de presupuesto no se consideran configuradas por estos resultados.

### Evidencia ejecutada en v1.1

- Validación final después de la corrección: **226/226 tests**, TypeScript del endpoint y del cliente, lint sin errores (13 advertencias existentes), build de producción y `git diff --check` correctos. El bundle de 18 archivos no contiene identificadores de variables privadas ni claves sintéticas de las pruebas.
- No se encontró una vulnerabilidad o regresión nueva en el endpoint. Se confirmó un defecto de comunicación de errores en los formularios de estimación de comida/ejercicio: un 401 de sesión expirada mostraba “Agregá más detalle” en lugar de indicar la sesión; también ocultaban cuota y servicio no disponible. Una prueba falló antes de corregirlo y pasó después. `DailyPanel.tsx` ahora muestra únicamente mensajes de `AIRequestError` (transporte seguro), manteniendo el fallback para errores ajenos al transporte. No cambia diseño, campos, confirmación, llamadas al proveedor ni persistencia. Los 23 tests de formularios pasan, incluyendo conservación de foto/datos, cero guardados y ausencia de reintentos automáticos. Los demás cambios de v1.1 son pruebas y documentación.
- Se corrigió una posible intermitencia de la fixture de firma inválida: alterar el último carácter Base64url puede modificar únicamente bits de relleno y conservar los bytes originales. Ahora se altera el primer carácter de la firma, garantizando una firma distinta. No cambia la verificación del servidor.
- El endpoint real importado en los tests rechaza bearer ausente, malformado, firma inválida y expiración con 401, sin reserva ni llamada al modelo; las restricciones de issuer/audience/role/nbf se mantienen. Los logs no incluyen token/identidad/secretos.
- PostgreSQL local PGlite ejecuta la migración original y verifica permisos de esquema/tabla para `anon` y `authenticated`, RLS habilitada sin políticas de acceso de clientes, RPC reservado al servidor, aislamiento por usuario/modalidad, agotamiento y fallo seguro de almacenamiento. 25 solicitudes simultáneas al handler con cupo sintético 5 producen 5 respuestas 200, 20 respuestas 429 y solo 5 invocaciones al modelo simulado. **PGlite serializa consultas: esto no es una carga distribuida contra PostgREST remoto.**
- Una base PGlite adicional, desechable, reemplaza exclusivamente la dependencia de reloj `pg_catalog.statement_timestamp()` mediante una función de prueba. La migración se carga sin editarla. Con zona de base `America/Argentina/Buenos_Aires`, a `2026-10-09 23:59:59 UTC` se agota un cupo 1 y Retry-After es 1; a `2026-10-10 00:00:00 UTC` se permite otra llamada en un bucket distinto y Retry-After es 86400. El reloj simulado existe únicamente en esa base temporal, nunca en una migración o proyecto real.
- Imagen y audio: el cliente transmite el bearer y el adjunto; los contadores PostgreSQL de la prueba quedan texto=1, imagen=2 y audio=1 después de chat, estimación de imagen, propuesta de comida por imagen y transcripción. Agotar los buckets sintéticos de imagen/audio produce 429 sin invocar Gemini ni agotar texto. Los errores 400/401/429/500/502/503 se comprueban en los tres flujos. Estimaciones siguen sin acciones de escritura; Coach solo devuelve propuestas y la UI conserva Confirmar. La transcripción llena el cuadro de texto; enviar ese texto posteriormente es otra solicitud de texto, iniciada por el usuario, no un consumo automático de texto al transcribir.
- Artefacto compilado: POST HTTP sin bearer, con token inventado/malformado/expirado → 401 y cero reservas/modelo; cuota simulada agotada → 429 y Retry-After; almacenamiento simulado caído → 503; ambos sin llamadas adicionales a Gemini. Se conservan las tres consultas exitosas y métricas oficiales del #53. Se repitió además el mismo probe sobre el artefacto generado por el builder oficial de Vercel, con TypeScript nativo desactivado. Auth, cuotas y Gemini de este probe están simulados.
- Remoto, ejecutado por el agente contra la **API pública del proyecto Calori**: Auth rechaza un token inventado con 403; el handler convierte ese rechazo en 401 (comprobado localmente). Un RPC anónimo con identidad nula y límite 0 devuelve 401 / `42501` (permiso denegado); la identidad nula impide reservar aun ante un permiso accidental. Acceso REST a `ai_private` con límite de resultados 0 devuelve 406 / `PGRST106` (esquema no expuesto). No se leyeron filas privadas ni se usaron sesiones o secretos reales. Estas comprobaciones no sustituyen inspección de ACL/RLS remota ni prueban `/api/ai/chat` desplegado.
- Acceso al Preview: el comentario de Vercel identifica el redespliegue como Ready; el intento de acceso autenticado mediante el conector protegido devuelve 403. No hay CLI autenticada ni OIDC local. Se conservó Deployment Protection. El conector Supabase sigue apuntando a un proyecto distinto; no se ejecutó SQL allí.

### Comprobaciones remotas pendientes

No existe acceso verificado a un Supabase aislado ni a usuarios de prueba autorizados. **No reducir el cupo de la cuenta habitual, borrar sus contadores ni crear cuentas reales para agotar cuotas.** La prueba remota de agotamiento/concurrencia/reinicio entre instancias requiere una base aislada y usuarios de prueba autorizados; hasta entonces queda pendiente. El mínimo observado se conserva durante todo el bucket UTC, también entre despliegues.

Desde un navegador con acceso legítimo al Preview, comprobar POST sin bearer, bearer inventado y una sesión de prueba realmente expirada, manteniendo Deployment Protection. Una respuesta `Protected deployment` pertenece a Vercel y no demuestra el 401 del handler. Para demostrar cero reservas/modelo ante rechazo, correlacionar con Runtime Logs (`providerCalls=0`, `category=unauthorized`) y, en la base aislada, contadores antes/después. No reutilizar tokens de usuarios reales en logs, capturas o ejemplos públicos.

Imagen y audio con Gemini real siguen pendientes: usar medios sintéticos sin datos personales y una cuenta de prueba autorizada; comprobar respectivos contadores, errores y confirmación antes de guardar registros. Las dos consultas reales aportadas solo validan texto/Coach. Preservar el cupo y los registros de la cuenta habitual.

Para completar la revisión de permisos del proyecto correcto, el administrador puede ejecutar **solo estas consultas de catálogo, sin modificar cuotas ni devolver identidades de usuarios**:

```sql
select role_name,
  has_schema_privilege(role_name, 'ai_private', 'USAGE') as private_schema_usage,
  has_table_privilege(role_name, 'ai_private.daily_usage',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as any_table_privilege,
  has_function_privilege(role_name, 'public.reserve_ai_quota(uuid,text,integer)', 'EXECUTE') as rpc_execute
from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name);

select relrowsecurity, relforcerowsecurity
from pg_class where oid = 'ai_private.daily_usage'::regclass;

select policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'ai_private' and tablename = 'daily_usage';

select prosecdef, proconfig
from pg_proc where oid = 'public.reserve_ai_quota(uuid,text,integer)'::regprocedure;
```

Para `anon`/`authenticated`, acceso de esquema, privilegios de tabla y ejecución RPC deben ser falsos; para `service_role`, ejecución RPC verdadera. Esperado: RLS habilitada y ninguna política que permita acceso de clientes; función SECURITY DEFINER y `search_path` vacío. No se exige FORCE RLS: la función del servidor debe poder reservar como propietario sin una política pública. Si alguna comprobación difiere, investigar antes del merge; no ejecutar otra migración automáticamente.

Las alertas de presupuesto y la activación de Production siguen siendo tareas separadas pendientes. La rama y el PR #54 permanecen en borrador, sin merge. Ningún paso de v1.1 modificó variables remotas, Production, cuentas, límites ni contadores de la cuenta habitual.

## Corrección de sincronización Coach → Inicio / Datos

### Causa comprobada, 9 de octubre

`useAppStore()` era un hook con `useState` local: cada llamada de App, Coach, Datos o Perfil creaba otra copia de `activeProfile` y otra suscripción a Auth. `applyActions()` creaba un registro nuevo sin mutar sus arrays; `updateRecord()` persistía en Supabase y refrescaba únicamente la copia de Coach. Inicio recibía la copia de App, que conservaba los registros anteriores. Recargar ejecutaba otra lectura de Supabase y hacía visible lo ya guardado.

Se reprodujo antes de cambiar el producto con React/ReactDOM reales: confirmar una comida sintética de 500 kcal guardaba una sola comida y mostraba “Registrado hoy”, pero navegar a Inicio mostraba **0 kcal**. No se atribuye el problema a Gemini, fórmulas o cuotas. El store de `main` (`c0139f5`) y el de la rama anterior a esta corrección (`50ca15e`) tienen el mismo blob `bf3a38bd44c4608ed006f53ccb0c6c0c0a05502f`. `applyActions()` y `confirmActions()` tampoco cambiaron en el PR #54: el defecto ya existía en main. No se inspeccionaron las filas ni las peticiones Supabase del caso real del usuario; la reproducción y comparación del código demuestran el fallo de estado compartido.

### Cambio mínimo

`src/hooks/useAppStore.ts` ahora mantiene la misma lógica de Auth, carga y persistencia dentro de `AppStoreProvider`; `useAppStore()` consume ese contexto. `src/main.tsx` monta un único provider para toda la app. Todas las pantallas observan el mismo perfil y mapa de registros, con las actualizaciones inmutables existentes; no se agregan recargas, polling, nuevos cálculos ni escrituras adicionales.

Se reprodujo también una carrera durante el guardado: al cambiar la cuenta mientras `ensureDailyLog()` esperaba, el resultado podía copiar el registro de la cuenta anterior al perfil nuevo. Las actualizaciones optimista, final y de recuperación ahora verifican el perfil y usuario que iniciaron la operación. La escritura iniciada sigue asociada a su usuario original; su resultado no modifica otro perfil.

La confirmación explícita de comidas/ejercicios y sus mensajes se conservan: éxito solo después de `await updateRecord()` exitoso; error cuando falla el guardado. Agua, pasos y peso conservan su flujo actual. No se modificaron ChatView, db, fórmulas energéticas, pantallas, endpoint, autenticación del servidor ni cuotas.

### Evidencia y límites

- `tests/coach-store-sync.test.mjs` monta el entry point real bajo StrictMode, App, provider, Coach, Inicio/DailyPanel y Datos/ChartsView en JSDOM. Simula exclusivamente Auth, persistencia, respuesta de IA y dependencias visuales ajenas al caso; no reemplaza los hooks de React ni el store.
- Siete regresiones: propuesta sin guardado previo, doble clic en Confirmar con una única escritura, éxito después de resolver el guardado, comida/calorías/balance y lista visibles al navegar Inicio → Datos → Coach, registros compartidos con historial, comida/ejercicio, agua, pasos, peso, recuperación sin falso éxito y aislamiento al cambiar cuenta con escritura pendiente. La navegación no causa nuevas lecturas del perfil. El historial recibe el mismo mapa de registros; su render gráfico está simulado.
- `tests/public-entry.test.mjs` y `tests/reset-data.test.mjs` adaptan sus harnesses al provider y conservan las pruebas anteriores de onboarding, sesión y borrado. `jsdom@26.1.0` es una dependencia solo de desarrollo compatible con Node usado en estas pruebas.
- Suite completa **233/233**, `tsc -p api/ai/tsconfig.json --noEmit`, TypeScript del cliente mediante `npm run build`, lint sin errores (**13 advertencias existentes**), build y `git diff --check`. La suite conserva el POST HTTP al endpoint compilado con Auth/cuotas/Gemini simulados; no se usa el build como prueba funcional.
- **Preview real:** el usuario aportó el fallo previo. La corrección no está validada por el agente con una sesión real en Preview: Deployment Protection y falta de acceso autorizado impiden esa comprobación. El estado Ready del despliegue no demuestra esta interacción. Repetir allí propuesta → Confirmar → Inicio → Datos sin recargar, verificar balance y una sola fila, y comprobar error de guardado con un entorno/cuenta de prueba autorizados.

Se actualiza únicamente el PR #54, sin merge, cambios de variables remotas, cuotas ni registros de usuarios.
