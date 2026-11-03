# Calori V9.1 — Cross-platform integration gate

Fecha: 2026-11-03.

**LINUX INTEGRATION GATE: PASSED**

**WINDOWS NATIVE HARNESS: UNRESOLVED**

## Evidencia y comparación

La validación final se ejecutó en [GitHub Actions, corrida 41650059705](https://github.com/MateoLitrenta/calori-tracker/actions/runs/41650059705), con dos VM independientes Ubuntu 24.04 y recursos nuevos en cada repetición. **Cada VM aprobó 424/424 pruebas combinadas en los mismos 37 archivos usados en Windows**, más **41/41 focalizadas**. Cero fallidas, omitidas, canceladas o pendientes en ambas. No se suman ejecuciones ni se reemplazan fallos por resultados aislados. [Resultados, manifiesto y procedencia](integration-gate-v9-1-linux-validation.json).

| Validación | Windows, evidencia conservada | Linux, dos VM independientes |
|---|---|---|
| HTTP legacy | CRUD aprobado; arranque intermitente con salida 3 en la combinada 1 | Aprobado en el foco y en la combinada de cada VM |
| HTTP hardened | Aislado 3/3; salida 3 antes de operaciones en las suites | Aprobado en el foco y en la combinada de cada VM |
| Seguridad RLS | Comprobaciones SQL de propiedad, grants y FKs aprobadas | Aprobadas, sin omisiones; dos identidades sintéticas |
| Integridad PR #70 | 21/21 focalizadas | 21/21 dentro del foco de cada VM |
| Suite combinada | 420/424 en cada una de dos ejecuciones | 424/424 en cada una de dos ejecuciones |

TypeScript frontend y ambos endpoints, lint, build y `git diff --check` (índice y worktree) aprobaron en las dos VM. Persisten **11 advertencias previas de lint** y el aviso de tamaño de chunk. No se cambió el producto para conseguir estos resultados.

El foco ejecuta seguridad completa, integridad de cliente y PostgreSQL: inicialización de perfil, onboarding, syncProfile, comidas/ejercicios, edición, eliminación, reset y confirmaciones `.select('id').single()`. Verifica aislamiento de las cuatro tablas y asociaciones entre cuentas, relaciones anidadas sin ambigüedad, store real y tres servicios simultáneos con puertos distintos y cierre independiente. Prueba el esquema legacy y el endurecido, conservando todas las aserciones anteriores.

Cada VM verificó disponibilidad PostgreSQL y respuestas HTTP 200 de PostgREST. No hubo terminaciones inesperadas, errores de spawn ni fallos de disponibilidad. El conflicto deliberado de puerto continúa rechazándose con salida real no cero (1 en Linux); no se oculta como arranque correcto. Los SIGTERM de limpieza son solicitados por el test. Los artefactos confirman cero directorios de clúster o configuraciones PostgREST pendientes después de terminar.

## Entradas exactas y entorno

- Base común: `8cbade05cc9339fd405421d88c5c5445f7931ace`.
- #70, intacto: `3bc5d62cd3ab4cf921b9e4a795d8295a58ff0e24`.
- #71 validado: `159e686b98cce98c3002bbeba8de183b2e7654fe`.
- Checkout de #70 en un worktree detached; se aplica el diff base→#71 sin merge ni modificación de main. Sólo se adaptan los dos loaders de test para ejecutar los archivos reales `src/lib/db.ts` y `src/hooks/useAppStore.ts`. Su igualdad con #70 se comprueba por contenido y SHA-256; los hashes y el árbol combinado quedan en el manifiesto. No se simulan sus escrituras ni respuestas HTTP.
- Node **24.4.1**, PostgreSQL **17.5** compilado desde la fuente oficial, PostgREST **16.5** Linux static x86-64. Mismas versiones de producto que en Windows. PostgreSQL se compila sin ICU/readline; no se cambian esquema o políticas para Linux. La versión de imagen del runner queda registrada en cada artefacto.
- SHA-256 de PostgreSQL: `fcb7ab38e23b264d1902cb25e6adafb4525a6ebcbd015434aeef9eda80f528d8` ([fuente y checksum oficiales](https://ftp.postgresql.org/pub/source/v17.5/)). SHA-256 del archivo PostgREST: `5099e7ada38f9f6846cd87c14c5f158b7c165f1e9959665ad412e61f4dceba95` ([release oficial](https://github.com/PostgREST/postgrest/releases/tag/v16.5)). Se comprueban antes de instalar. No se usa latest.
- Actions oficiales fijadas por SHA. Permisos `contents: read`, sin secretos de Production, Supabase o Gemini. Dependencias del proyecto mediante `npm ci`, sin cambio de lockfile ni dependencia nueva.

WSL devolvió E_ACCESSDENIED y Docker no tenía un motor Linux accesible desde el entorno local. Se eligió el runner autorizado, sin reinstalar servicios ni continuar investigando indefinidamente Windows. Una corrida Linux preliminar también aprobó dos veces 424/424; después se corrigió únicamente el contador de advertencias, porque GitHub usa anotaciones `::warning` en vez del formato textual de Windows. La corrida final vuelve a verificar todo con ese contador corregido. Ese ajuste no altera una aserción, salida de proceso ni resultado de test.

## Interpretación y decisión

La evidencia permite clasificar el fallo reproducible como **un problema del entorno/harness nativo Windows probado**, sin incompatibilidad funcional demostrada entre la persistencia de #70 y las políticas de #71. No demuestra la causa nativa exacta, una DLL responsable ni que todos los entornos Windows fallen. Los binarios y sus bibliotecas difieren entre sistemas; no se atribuye el resultado a una biblioteca sin stack. El [registro Windows](integration-gate-v9-1-windows.md) y su [manifiesto histórico](integration-gate-v9-1-validation.json) se conservan, con el estado UNRESOLVED.

**Se recomienda revisar e integrar #70 y después #71**, manteniendo Linux como entorno del gate comprobado. No hay un defecto funcional concreto de compatibilidad detectado que impida ese orden. Los PR permanecen en borrador y sin merge; esta recomendación no ejecuta la integración ni autoriza operaciones remotas. Repetir el gate si cambia código, pruebas, propuestas SQL, dependencias o entradas fijadas. El workflow está acotado al PR #71; los commits que sólo documentan sus resultados no vuelven a consumir dos compilaciones, ni cambian el código validado.

## Alcance comprobado y pendientes de despliegue

PostgreSQL, PostgREST, firma HMAC de JWT sintéticos, escrituras, RLS y FKs se prueban realmente en loopback. La sesión de Auth del store y el catálogo de Storage se simulan. **No se certifican Supabase Auth, uploads/URLs firmadas de Storage ni datos legacy remotos.** No se crearon usuarios reales ni se consultaron registros personales.

El siguiente paso es un ensayo autorizado: cotejar catálogo y preflight, resolver explícitamente inconsistencias legacy si aparecen, comprobar respaldo/restauración y clientes con Auth/Storage reales, y aprobar una ventana y recuperación antes de aplicar el endurecimiento. Estas operaciones requieren autorización explícita; no se realizaron en esta tarea. La publicación del PR o del workflow no aplica SQL remoto ni modifica Production.

`001_clean_baseline.sql` y `002_atomic_records.sql` siguen fuera de la cadena de migraciones y sin activar. Sus pruebas usan exclusivamente fixtures locales separados; el cliente no depende de una RPC nueva. Guardados multiconsulta parciales, idempotencia de la intención completa y conflictos entre dispositivos siguen siendo riesgos pendientes de una integración coordinada. Aprobar este gate de compatibilidad no equivale a habilitar la beta ni a dar por desplegada la seguridad.

## Reproducción y archivos

El workflow `.github/workflows/integration-v9-1.yml` crea dos VM sin compartir procesos ni bases. `scripts/integration/install-linux-v9-1.sh` obtiene/verifica las herramientas; `prepare-v9-1.mjs` combina los commits y verifica los archivos de #70; `run-linux-v9-1.mjs` exige el manifiesto Windows exacto, todos los casos, cero omisiones, disponibilidad, calidad y limpieza. No reinicia procesos fallidos ni amplía timeouts para ocultar fallos. El único ajuste del helper es crear su directorio de configuración en un entorno limpio.

Los logs y JSON completos están en los artefactos `linux-integration-1` y `linux-integration-2` de la corrida enlazada (retención de siete días), y se descargaron al workspace local con verificación del digest del ZIP. Los resúmenes versionados conservan resultados, inputs, hashes y diagnósticos después de esa retención. Los logs contienen únicamente fixtures sintéticos y diagnósticos sanitizados.
