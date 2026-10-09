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
