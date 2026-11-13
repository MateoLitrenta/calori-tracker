# V10.1: comprobación funcional posterior al despliegue

**IA real: PENDIENTE.** Este procedimiento no se ejecutó y no autoriza acciones actuales sobre Production. Solo se realizará después de aprobar el PR #77, hacer merge y comprobar el despliegue correspondiente.

El Preview no dispone de la configuración completa para Gemini/Coach. No se intentará certificar IA real allí ni se modificarán sus variables. Production conserva su configuración funcional; no se copiarán secretos ni se cambiarán cupos para esta comprobación.

## Prerrequisitos

- Confirmar aprobación del usuario, commit publicado, estado del despliegue y cuenta de prueba autorizada.
- Acordar registros y cambios de prueba identificables, con fechas, horas y cantidades explícitas; evitar datos de otras cuentas.
- Anotar los registros, objetivos y contador de cuota iniciales de esa cuenta, sin exportar información privada.
- Tener acceso autorizado al monitoreo existente. Limitar la sesión a los recorridos siguientes; no ejecutar carga, reintentos masivos ni agotamiento de cuota.

## Recorrido controlado

1. **Apertura.** Abrir Coach y comprobar que la observación corresponde a los registros actuales. Comparar su evidencia y período con los datos de la cuenta. Confirmar que abrir, desplegar evidencia y consultar sugerencias no invocan Gemini ni incrementan la cuota.
2. **Conversación proactiva.** Pulsar una acción contextual y comprobar una respuesta real pertinente. Preguntar por qué apareció la observación. La explicación debe respetar cifras, fechas, denominadores y límites; no afirmar actividades ausentes, jornadas completas, recuperación o resultados físicos sin evidencia. Las estimaciones deben conservar su incertidumbre.
3. **Cambio de evidencia.** Tras un cambio de prueba autorizado en los registros, comprobar la actualización de observación/sugerencias. Si la conversación conserva una referencia anterior, debe explicar la evidencia disponible ahora sin reconstruir cifras obsoletas ni atribuir un cambio cuando solo falta acceso.
4. **Objetivos.** Solicitar un objetivo pequeño de prueba y revisar su propuesta antes de confirmar. Confirmarlo, consultarlo en una conversación nueva, actualizarlo mediante una nueva confirmación y cancelarlo. Verificar el estado guardado y el progreso calculado a partir de registros; aceptar un objetivo no debe crear una actividad.
5. **Acciones.** Pedir un único registro de prueba autorizado, con sus datos observables explícitos. Comprobar que primero aparece una propuesta, que no se anuncia guardado y que no cambia el historial antes de confirmar. Confirmar una sola vez y comprobar un único registro en Inicio/Datos. Una respuesta de consejo o una propuesta descartada no debe guardar registros.
6. **Cuotas.** Comparar el contador antes y después de cada recorrido. Apertura, evidencia y confirmaciones sin IA deben sumar cero llamadas. Cada envío debe reflejar las llamadas reales al proveedor; un eventual intento correctivo existente también debe estar contabilizado. No cambiar límites ni agotar el cupo para provocar un 429.
7. **Errores acotados.** Cuando esté incluido en la sesión aprobada, comprobar un 400 con una petición inválida sin datos personales y un 401 sin credenciales; ninguno debe invocar Gemini ni reservar cuota. No utilizar tokens ajenos. Revisar que los errores sean comprensibles y no aparenten guardado o respuesta exitosa.
8. **Fallo del proveedor.** Validar el comportamiento con la simulación automatizada ya disponible. Si ocurre un fallo real durante la sesión, revisar su manejo sin reintento automático adicional ni pérdida de propuestas. No provocar una caída, alterar credenciales, bloquear tráfico o modificar el proveedor en Production. Un fallo real no observado permanece sin certificar como ensayo remoto.

## Monitoreo y registro del resultado

- Registrar commit, despliegue, hora, recorrido, resultado y referencias de solicitud permitidas.
- Revisar latencia observada, estado HTTP, `providerCalls`, `tokenCoverage` y uso de tokens cuando el proveedor lo informe. Una cobertura no disponible debe seguir marcada como tal, sin estimar tokens como si fueran medidos.
- Correlacionar llamadas reales con la cuota. Los intentos fallidos pueden conservar una reserva si el proveedor pudo haber incurrido en costo; no asumir devolución.
- No incluir mensajes completos, comidas, identidad, credenciales, cabeceras de autenticación o claves en capturas, logs, issues ni el informe público. Usar resultados resumidos y datos sintéticos identificables.

## Aprobar o detener

**Aprobar** solo los recorridos ejecutados con evidencia: personalización correcta, explicación fiel, confirmaciones efectivas, ausencia de duplicados, cuota coherente y errores visibles. La latencia y el consumo deben informarse con sus muestras y límites, sin atribuirles un objetivo de rendimiento no acordado.

**Detener** ante actividad/cifras inventadas, datos de otra cuenta, guardado sin confirmación, duplicados, consumo automático al abrir, discrepancias de cuota o exposición de información privada. Conservar referencias mínimas para diagnóstico y comunicar el hallazgo; no corregirlo cambiando secretos, datos o cupos de Production dentro de esta sesión.

Hasta completar la comprobación, el estado de IA real seguirá siendo **PENDIENTE**. Después se documentará cada recorrido como aprobado, fallido o pendiente, manteniendo explícitas las pruebas remotas que no se hayan realizado. No equivale a una certificación general del modelo.
