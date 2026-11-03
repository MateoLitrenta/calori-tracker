# Calori V9.1 — HTTP harness e integración de #70 y #71

Fecha: 2026-11-03. **INTEGRATION GATE: BLOCKED** mientras no se explique la terminación nativa descrita abajo. Este informe reemplaza el resultado inicial del gate, no los informes históricos de cada PR.

## Entradas y límites

- PR #70: `3bc5d62cd3ab4cf921b9e4a795d8295a58ff0e24`, conservado sin cambios.
- PR #71 antes de esta corrección: `847ec4fe74f3277c607b4fb89310db60dbd01c8a`.
- Base común, incluido #69: `8cbade05cc9339fd405421d88c5c5445f7931ace`.
- Worktree temporal detached sobre #70 con el diff de #71 aplicado, sin merge. El adaptador local del test carga los archivos reales `src/lib/db.ts` y `src/hooks/useAppStore.ts` de #70; se cotejan con los SHA-256 de los fixtures originales. No reemplaza respuestas HTTP ni reimplementa la persistencia.
- PostgreSQL 17.5 y PostgREST 16.5 Windows, loopback y bases descartables, dos identidades y JWT sintéticos. Auth del store y catálogo de Storage se simulan; la firma JWT, PostgREST, PostgreSQL, RLS y las escrituras HTTP son reales y locales. No certifica Supabase Auth/Storage remotos.
- Sólo cambia el harness del PR #71 y su documentación. Sin cambios de producto, SQL propuesto, dependencias, variables persistentes o PR #70; sin SQL remoto, datos personales, merge ni otro PR.

## Hallazgos comprobados y límites del diagnóstico

El harness anterior elegía un puerto con un socket auxiliar, lo cerraba y luego iniciaba PostgREST con ese número. Existe una ventana real entre reserva y uso. Manteniendo otro listener en ese puerto se reprodujo el fallo de arranque; un experimento terminó con código **3**, señal `null`, sin error de spawn, sólo `Starting PostgREST 16.5...`, PostgreSQL disponible y seis conexiones. Otras ejecuciones del conflicto terminaron con código **1**. El código real se conserva: no se normaliza a 3 ni se interpreta por sí solo como prueba de conflicto de puerto.

**Esta reproducción no demuestra que el fallo histórico fuera exclusivamente un conflicto de puertos.** Durante esta investigación hubo arranques normales que también terminaron con código 3 aun usando `server-port=0`, incluso en la primera repetición combinada. Fallaron antes de anunciar un puerto HTTP, con PostgreSQL disponible, `spawnError=null`, `signal=null`, sin solicitud de cierre del test. El diagnóstico ampliado encontró PostgreSQL activo, sin FATAL/PANIC y seis conexiones de un máximo de cien. No se encontró evidencia de agotamiento de conexiones, cierre anticipado del clúster o un error de permisos RLS: las operaciones HTTP de esos escenarios todavía no habían comenzado.

No había claves PG/PGRST/GHC heredadas en esos intentos. La comparación controlada del entorno heredado con una copia explícita encontró las mismas 74 claves, sin diferencias de valores; sólo se registraron nombres/conteos, nunca valores. Por tanto, el filtrado preventivo del entorno del hijo no se presenta como causa demostrada ni como solución del código 3. Tampoco se atribuye a la ejecución paralela sólo porque una ejecución aislada pase.

El stdout/stderr restante no proporciona una excepción nativa o stack que permita atribuir esa terminación a PostgREST, su runtime o una DLL. No se afirma que las políticas, las funciones de persistencia o una biblioteca concreta sean la causa. Para cerrar esa parte hace falta reproducir y capturar el fallo nativo con un stack del proceso, o aislarlo mediante una comparación controlada con otro runtime. Pasar repeticiones posteriores es evidencia de esos recorridos, no una explicación retrospectiva.

## Cambio acotado

- `tests/helpers/local-postgrest.mjs`: PostgREST enlaza directamente el puerto `0` asignado por el sistema; se obtiene el puerto real del log del proceso. Configuración única por instancia y entorno del hijo libre de PG/PGRST/GHCRTS externos. No cambia `process.env` ni `.env`.
- Diagnóstico sanitizado de etapa, PID, puerto solicitado/real, estado PostgreSQL, conexiones, salida, señal, error de spawn y cierre solicitado por el test. stdout y stderr se capturan; se eliminan URI, secretos sintéticos y JWT de los errores.
- La disponibilidad HTTP tiene un plazo total de 30 segundos, con solicitudes individuales acotadas; no hay reinicios automáticos del proceso. Un proceso que termina antes de estar listo hace fallar el escenario inmediatamente. El cierre es idempotente y espera `close` antes de borrar su configuración.
- `tests/helpers/security-postgres.mjs`: añade estado del proceso PostgreSQL y líneas fatales para diferenciar un servidor caído de un fallo de cliente.
- `tests/security-hardening.test.mjs`: conserva todos los escenarios y aserciones originales; consume/cancela las respuestas de disponibilidad/error y añade dos regresiones: conflicto de puerto deliberado y tres servicios simultáneos con puertos distintos y cierre independiente. La aserción nueva de conflicto exige una salida real no cero, sin señal ni error de spawn, con PostgreSQL disponible; no exige el 3 que resultó no ser estable en Windows.

No se ampliaron los timeouts de la aplicación, omitieron escenarios, sustituyeron fallos por resultados de otra ejecución ni modificaron códigos de salida.

## Validaciones

Resultados finales, manifiestos completos y códigos de cada ejecución en `integration-gate-v9-1-validation.json`. Cada ejecución combinada descubre todos los archivos `tests/*.test.mjs`, los divide en tres lotes disjuntos y conserva el resultado independiente de cada lote. Las dos ejecuciones no se suman para disimular fallos. Los logs completos permanecen en el workspace local fuera de Git.

La comprobación funcional incluye inicialización de perfil, onboarding, actualización, días, comidas y ejercicios, edición, eliminación, reset, confirmaciones de filas afectadas, firma inválida, aislamiento entre dos usuarios, referencias ajenas, relaciones anidadas y publicación del store real después de persistir. Las propuestas de transacciones/idempotencia/versiones se prueban en sus bases locales separadas y no se activan en la aplicación.

En la combinada 1 fallaron el arranque del escenario de ataque legacy y el endurecido; en la combinada 2 fallaron un arranque del escenario paralelo y el endurecido. Cada resultado incluye esos dos fallos y los dos contenedores que los propagan. Todos son salida 3 antes de disponibilidad HTTP, sin señal/error de spawn, con PostgreSQL disponible y entre seis y diez conexiones de cien. Seguridad focalizada falla en el endurecido y sus dos contenedores. El resto de las pruebas termina sin fallos; no se sustituye ningún escenario omitido por el resultado aislado.

Una ejecución preliminar separada de integridad encontró `initdb` sin permiso para renombrar el WAL en TEMP del sandbox; el log se conservó. La ejecución focalizada final usa una carpeta descartable del workspace mediante la variable exclusiva del proceso hijo, y pasa 21/21. No se modificó el helper ni la rama del PR #70 para eludir ese error del entorno.


Resultados de cierre: HTTP aislado 3/3; seguridad 17/20; integridad 21/21. Combinada 1: 420/424, 4 fallidas. Combinada 2: 420/424, 4 fallidas. Cada combinada incluye 37 archivos, cero omisiones/cancelaciones. TypeScript frontend/ambas API, lint, build y diff check aprobaron; 11 advertencias previas de lint. Los resultados no se sustituyen ni se suman para declarar aprobación.

## Decisión y siguiente paso

No se ha demostrado una incompatibilidad entre las confirmaciones de #70 y las políticas propuestas en #71. Eso no equivale a aprobar este gate: la terminación nativa sin explicar impide afirmar que el harness es confiable. Mantener ambos PR en borrador y no autorizar el despliegue basándose sólo en recorridos aislados o compilación.

Una vez resuelto el bloqueo, el orden recomendado para revisión e integración es **#70 y después #71**: primero las confirmaciones de guardado y la inicialización sin sobrescrituras; después el harness y la propuesta de endurecimiento. Integrar el código no ejecuta el SQL. Repetir la prueba combinada si cambian los commits.

La siguiente etapa de despliegue exige autorización explícita del entorno de ensayo y sus operaciones: cotejo de catálogo, preflight sin inconsistencias, decisión separada para legacy incompatible, respaldo restaurable, pruebas con Auth/Storage reales y clientes soportados, ventana controlada, aplicación revisada de `020_upgrade.sql`, postflight y recuperación de sólo lectura. No se ejecutó ninguna de esas acciones remotas.

`001_clean_baseline.sql` no es un upgrade de la base existente. `002_atomic_records.sql` revoca escrituras directas y requiere otro protocolo de cliente; continúa separado e inactivo. No combinarlo con el endurecimiento ni prometer solución de guardados parciales/conflictos entre dispositivos sin una entrega coordinada. La beta permanece condicionada a esos riesgos y a verificar el endurecimiento en el entorno autorizado.

Referencias del comportamiento del puerto: [configuración oficial PostgREST](https://docs.postgrest.org/en/stable/references/configuration.html#server-port), [binario oficial v16.5](https://github.com/PostgREST/postgrest/releases/tag/v16.5). Las conclusiones sobre fallos se basan en los experimentos locales, no en atribuciones de incidentes de terceros.
