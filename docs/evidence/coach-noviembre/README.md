# Coach y Mis objetivos · Auditoría de noviembre, etapa 2

Referencia `6842ae51e353c33386e261b1b4321c0766c7ef7e` (merge de #92). Los pares usan el mismo perfil sintético, la misma fecha local y el mismo objetivo. En este perfil hay **2 entrenamientos registrados de una meta de 12**.

## Comparativas

| Escena | Antes | Después |
| --- | --- | --- |
| Inicio de Coach | [375-claro](antes/375-light-inicio.jpg) · [375-oscuro](antes/375-dark-inicio.jpg) · [1440-claro](antes/1440-light-inicio.jpg) · [1440-oscuro](antes/1440-dark-inicio.jpg) | [375-claro](despues/375-light-inicio.jpg) · [375-oscuro](despues/375-dark-inicio.jpg) · [1440-claro](despues/1440-light-inicio.jpg) · [1440-oscuro](despues/1440-dark-inicio.jpg) |
| Lectura de una conversación de 18 mensajes | [375-claro](antes/375-light-lectura.jpg) · [375-oscuro](antes/375-dark-lectura.jpg) · [1440-claro](antes/1440-light-lectura.jpg) · [1440-oscuro](antes/1440-dark-lectura.jpg) | [375-claro](despues/375-light-lectura.jpg) · [375-oscuro](despues/375-dark-lectura.jpg) · [1440-claro](despues/1440-light-lectura.jpg) · [1440-oscuro](despues/1440-dark-lectura.jpg) |
| Mis objetivos | [375-claro](antes/375-light-objetivos.jpg) · [375-oscuro](antes/375-dark-objetivos.jpg) · [1440-claro](antes/1440-light-objetivos.jpg) · [1440-oscuro](antes/1440-dark-objetivos.jpg) | [375-claro](despues/375-light-objetivos.jpg) · [375-oscuro](despues/375-dark-objetivos.jpg) · [1440-claro](despues/1440-light-objetivos.jpg) · [1440-oscuro](despues/1440-dark-objetivos.jpg) |

- [Encabezado y compositor a 320 px con texto al 200 %](despues/320-light-inicio.jpg) · [Panel de objetivos ampliado](despues/320-light-objetivos.jpg).
- [Sin registros recientes](despues/375-light-sin-registros.jpg) · [Lista de objetivos vacía](despues/375-light-sin-objetivos.jpg). Estas dos escenas se capturaron después de ampliar la ventana a 1024 px en el recorrido iniciado a 375 px.

## Decisiones

En una conversación vacía confirmada, la observación, las preguntas complementarias y el compositor forman un conjunto centrado en el marco de Coach. El ancho de lectura en escritorio es de hasta 864 px con la fuente base. El encabezado conserva el ancho exterior de Inicio. Al abrir una conversación existente, la observación se pliega y el historial de mensajes recupera el espacio central. La caja de escritura conserva su nodo al enviar la primera consulta.

El titular usa la evidencia disponible para el tipo de observación. Los pasos conservan su umbral y los entrenamientos su unidad. El período, la explicación original y los límites permanecen consultables. La acción de la observación inicia una consulta. Mis objetivos abre la lista. El avance cuenta sólo registros disponibles y su cobertura se puede desplegar.

## Verificación

| Caso | Comprobación |
| --- | --- |
| Carga, conversación vacía y existente | Se restauraron 12 mensajes mientras la consulta de objetivos seguía pendiente. La bienvenida pertenece al estado vacío. Se probaron observación con objetivo, perfil sin registros, consulta fallida, reintento y lista vacía. |
| Lectura y respuesta tardía | Enfocar la caja conservó el desplazamiento a 120 px. Una respuesta simulada llegó mientras se leía a 150 px y se mantuvo el punto de lectura con tolerancia de 2 px. Se verificaron los 100 fragmentos de la respuesta y el seguimiento del final cuando correspondía. [Resultados del recorrido](despues/recorrido.json) |
| Sugerencias y cabecera | Se comparó el texto íntegro de la consulta recibida con la pregunta del botón. Se probaron Mis objetivos, Historial, conversación anterior en solo lectura, regreso a hoy y Nueva conversación. |
| Edición y cancelación | Las pruebas de integración de React verifican revisión y confirmación explícitas, actualización de la lista, fallos de consulta, conflictos de versión y devolución del foco al disparador. |
| Tema y ancho | Se comprobó que la misma caja de escritura mantiene el borrador, el foco y la foto adjunta al pasar de móvil a escritorio y cambiar el tema del sistema. |

Chrome 158.0.8127.36 en Windows, con datos y servicios locales simulados y sin tráfico de usuario hacia servicios externos. Para el reflujo se duplicaron los tamaños de fuente computados a 320 px. El caso de respuesta tardía usa transporte simulado. Quedan pendientes Safari en iPhone físico, teclado nativo, lector de pantalla y conversación con IA real.

## Reproducción

Iniciar las instancias locales con `node scripts/home-mobile/serve-qa.mjs --coach-november --history-data` y, en otra terminal, el mismo comando con `--before --port=5193`. Con la instalación de Playwright y Chrome de QA, ejecutar `node scripts/fitness-global/coach-november.mjs --before`, luego sin `--before`, y por último `node scripts/fitness-global/coach-stage3.mjs --november-flows`. El Draft enlaza la CI y la Preview del SHA final.
