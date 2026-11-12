# Calori V9.3 — UX y confiabilidad

Base: `main` en `f9ba474` (V9.1 y V9.2 integradas). La fase funcional se conserva separada en `20f85d7`.

## Diagnóstico y correcciones funcionales

### Comida repetida en Coach

La secuencia del video muestra un almuerzo confirmado y una propuesta posterior que vuelve a incluirlo junto con una cena. No se consultaron filas personales de Production: una captura no permite certificar los identificadores de esas dos tarjetas.

Se reprodujo el recorrido con datos sintéticos y el código original: confirmar un almuerzo de 900 kcal y luego `[ese almuerzo, cena de 1000 kcal]` generaba tres IDs distintos y 2800 kcal. Cada propuesta nueva asignaba nuevos IDs. La RPC actuaba correctamente: eran intenciones distintas; su idempotencia no debe fusionar comidas por su contenido. El render de Inicio utiliza la colección canónica una vez por entrada.

Ahora una propuesta identifica coincidencias exactas con acciones **confirmadas en esa conversación**, comprobando que su ID siga presente y que sus campos canónicos coincidan. La tarjeta distingue lo ya registrado y lo que se guardará. El usuario puede elegir **Registrar otra comida igual**. Las comidas similares y las repeticiones explícitas siguen permitidas. Los reintentos de la misma propuesta conservan sus IDs y el mensaje de éxito enumera sólo las acciones guardadas.

Los recibos de confirmación se guardan como metadatos mínimos del historial local y no se envían al proveedor de IA. Conversaciones anteriores sin esos metadatos no se clasifican retrospectivamente. No se deduplicaron ni eliminaron registros existentes. La causa exacta de las filas del video sigue sin poder certificarse sin sus IDs/payloads originales; sí se corrigió el recorrido reproducido.

### Pasos, agua y borradores

Los dos temporizadores anteriores podían enviar otro snapshot mientras el primer guardado seguía pendiente. La regresión previa al cambio demuestra dos envíos simultáneos; el store rechazaba el segundo y aparecían conflictos/avisos sin conservar adecuadamente la secuencia de incrementos.

Una cola local comparte el debounce de 400 ms entre pasos y agua. Los cambios recibidos durante un guardado se mantienen y se envían después de su confirmación, usando exclusivamente los tokens canónicos devueltos por el store. Los totales no se vuelven a sumar al reintentar. Una respuesta ambigua pausa la cola y sólo un reintento explícito repite el payload original; una validación fallida permite corregir el dato. No se reintentan automáticamente conflictos CAS.

El borrador pertenece al owner/epoch del provider, para conservarse al navegar entre Inicio, Datos y Coach. El cambio de identidad cancela la cola y aísla los callbacks anteriores. La edición manual captura su base antes de que el input pierda el foco.

El diálogo de conflicto usa `EntryFormShell`: muestra valores guardados y propuestos, conserva el borrador, permite descartarlo o aplicar una revisión explícita. Si el día vuelve a cambiar durante la revisión, exige revisar de nuevo. Pasos y agua ya no dependen de `window.confirm()`.

La revisión también reprodujo un caso de reset/recreación con igual versión diaria y otra generación. El store ahora exige que **versión y generación** coincidan con el recibo antes de confirmar o continuar la cola. No se modificó ninguna RPC, política RLS o permiso.

### Feedback

Los hábitos informan Editando, Guardando, Guardado, No confirmado o Conflicto dentro del panel. Coach utiliza su respuesta contextual, sin duplicar el error mediante toast. Los errores generales de registros comparten un ID estable y el reset delega un único error a su formulario. Los toasts respetan la zona de navegación móvil. No se anuncia éxito antes de verificar recibo y lectura canónica.

## Polish visual

- Inicio: aviso de día incompleto antes del balance provisional, valor secundario sin cambiar su cálculo, fecha junto a registros/acciones y dentro de los cuatro formularios de comida/ejercicio.
- Hábitos: feedback fuera de las tres tarjetas, con controles accesibles y sin superposición.
- Coach: jerarquía de propuesta pendiente, campos y unidades claros, confirmación de guardado distinguible y tratamiento consistente en ambos temas. Los metadatos de confirmación determinan el estado confirmado.
- Datos: unidades y denominadores de los promedios existentes, etiquetas de selección precisas, **Quitar selección**, controles de período táctiles y estados vacíos claros. No cambian las estadísticas.
- Se conservan paleta principal, navegación, heatmap, arquitectura del chat, fórmulas, objetivos, autenticación y cuotas. No hay nuevas dependencias del producto.

## Evidencia y validación

La evidencia visual utiliza cuentas y registros sintéticos; las imágenes del video original no se publican. El baseline visual carga el código de `f9ba474` mediante Git, no una reconstrucción aproximada.

Anchos requeridos: **320, 375, 393, 430, 768 y 1440 px**, temas **claro y oscuro**, Inicio/Datos/Coach. Se distinguen las pruebas de presentación con backend simulado de PostgreSQL/PostgREST reales ejecutados en una base local descartable.

La suite completa de Linux aprobó **554/554 pruebas**, en 47 archivos, con **0 fallos, 0 omisiones, 0 cancelaciones y 0 pendientes**. Incluye PostgreSQL 17.6 y PostgREST 16.5 reales en un entorno local descartable: RLS endurecido, lecturas anidadas, rollback, recibos idempotentes, conflictos, reset e identidad. TypeScript del frontend, API de IA y Coach, lint, build y `git diff --check` aprobaron. Lint informó 12 advertencias y 0 errores. Fuente funcional y pruebas: `079165a11d6efd9d21e15039f34c28a4a2343ee7`; los commits posteriores sólo incorporan documentación/evidencia. El [manifiesto de calidad](evidence/v9-3/quality-results.json) conserva los comandos, versiones y resultados.

Se completaron **36 combinaciones antes y 36 después**, sin errores JavaScript, desbordamientos horizontales ni peticiones externas. Los 16 recorridos interactivos adicionales aprobaron 158 comprobaciones, incluyendo borradores, conflicto, reintento explícito, foco y acciones alcanzables en 320×568. La [galería antes/después](evidence/v9-3/README.md) enlaza las capturas y la [matriz responsive](evidence/v9-3/responsive-matrix.json).

La primera ejecución detectó dos incompatibilidades de harness: un import nuevo no resuelto por el transpiler de pruebas y dos expectativas del antiguo `window.confirm()`. Se corrigieron conservando las pruebas y sus aserciones de seguridad, y se repitió la suite completa. El contenedor oficial de PostgreSQL usa un wrapper `ldd` que hacía elegir bindings MUSL aunque Node usa glibc; sólo el entorno de validación se ajustó para usar su `ldd` GNU existente. No se cambiaron dependencias, binarios de PostgreSQL ni configuración del producto. La prueba nativa de PostgreSQL en Windows encontró `WSAEACCES 10013` del sandbox; ese intento no se cuenta como aprobado ni sustituye al gate Linux.

## Límites y revisión

- Ninguna prueba consulta o modifica datos personales de Production. No se cambiaron Supabase ni Vercel Production.
- Los recorridos de IA de los fixtures son simulados; no certifican una llamada real a Gemini ni un consumo remoto.
- La matriz de navegador no sustituye una revisión en Safari/iOS y Android físicos ni la revisión visual del Preview con las cuentas del usuario.
- El PR debe permanecer Draft, sin merge automático.
