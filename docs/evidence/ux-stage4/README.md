# Etapa 4 · Perfil y acabado transversal

La referencia es el merge del PR #84, `a740e1b1897b83dfea35ffa4d85373c3afbf51ed`. El arnés monta las vistas de Calori y sustituye los límites de red, sesión, archivos y escritura por fixtures locales. La cuenta A tiene 73 kg de perfil y una medición diaria de 72,8 kg. La cuenta B tiene registros independientes.

## Qué revisar

| Escena | Antes | Después |
| --- | --- | --- |
| Perfil, 375 px, oscuro | [Referencia](before/375-dark.jpg) | [Candidato](after/375-dark.jpg) |
| Cuenta y gestión, 375 px, claro | [Referencia](before/375-light-gestion.jpg) | [Candidato](after/375-light-gestion.jpg) |
| Edición, 375 px, oscuro | [Referencia](before/375-dark-edicion.jpg) | [Candidato](after/375-dark-edicion.jpg) |
| Perfil, 1440 px, claro | [Referencia](before/1440-light.jpg) | [Candidato](after/1440-light.jpg) |

Las carpetas [antes](before) y [después](after) incluyen el mismo estado de Perfil en Claro y Oscuro a 320, 375, 393, 440, 768 y 1440 px. La [matriz de referencia](before/matrix.json), la [matriz candidata](after/matrix.json) y los [recorridos funcionales](after/flows.json) contienen las mediciones.

## Matriz de hallazgos de esta etapa

| Hallazgo | Reproducción | Cambio | Prueba y resultado |
| --- | --- | --- | --- |
| UX-16 · Peso ambiguo | Perfil decía «Peso» junto a edad y altura. | «Peso de perfil» y explicación en lectura y edición. | Editar a 75,5 kg conserva 72,8 kg en el día. Se conserva la edad actualizada por otro cambio durante la edición. |
| UX-16 · Borrador personal | Cancelar descartaba inmediatamente. Una actualización de los datos reiniciaba el nombre. | Campos editados sobre una copia al abrir. Se aplican los campos modificados al perfil vigente. Un cambio de sección con un borrador pide confirmación. | Las 12 combinaciones conservan «Alex borrador» tras refrescar y rechazar el descarte. Se probaron cancelación limpia, descarte aceptado, navegación, foto, Sistema y A→B→A. |
| UX-16 · Guardado lento | Dos envíos en el mismo turno iniciaban dos operaciones y el botón no indicaba el estado. | Bloqueo inmediato, campos deshabilitados, «Guardando…» y éxito tras confirmación. | Dos envíos producen una sola llamada en las 12 combinaciones. El fallo simulado conserva los campos y permite reintentar. |
| UX-16 · Gestión de datos | La advertencia permanente omitía pasos y agua y terminaba en «Confirmar». | Desplegable después de Cuenta. Explica las cinco clases de datos, pregunta por el borrado, ofrece «Cancelar» y «Borrar registros», y presenta el error junto al reintento. | Cancelar conserva los registros. Durante la espera se bloquean ambas acciones. Al reintentar solo se vacían los días de A. B, el peso de perfil y la foto permanecen. Eliminar foto y cancelar el cierre de sesión se prueban aparte. |
| UX-16 · Continuidad | A 375 px, volver desde Coach llevaba el scroll de Perfil de 200 a 0. | La restauración busca la raíz que realmente monta Perfil. En móvil la barra inferior tiene su propio espacio delante de las últimas acciones. | A 375 px vuelve a 200. Cada combinación compara con su propio desplazamiento posible, incluso cuando el contenido entero cabe en escritorio. |
| UX-17 · Capas y acciones | El descarte diario usaba una confirmación nativa del navegador. «Guardar» también podía referirse a una foto. | Diálogo de Calori con «Seguir editando» enfocado inicialmente. El formulario cede Escape y foco a la capa superior. «Guardar foto» y «Cancelar foto» distinguen las acciones. | Cámara simulada → Escape → formulario → Escape → diálogo → Escape conserva texto, foto, hora, fecha y foco. Aceptar el descarte devuelve el foco a «+ Comida». Las confirmaciones por conflictos de versión siguen su recorrido existente. |
| UX-17 · Lectura y tema | «Apariencia» estaba subordinada a otro encabezado. Dos opciones excedían su ancho a 320 px con texto duplicado. | Un único encabezado, selector que puede ocupar dos filas y tokens de color y tipografía de Fitness Moderno. | Recorridos en Sistema con formularios abiertos. Cinco pares de colores de texto superan 4,5:1 en ambos temas. A 200% CSS se comprueba el ancho del área principal y de las tres etiquetas. |
| Regresión de etapas 1–3 | Gráfico anual al estrecharlo, hora y fecha del formulario, observación y punto de lectura del Coach. | Se reutilizan las cuatro vistas y su navegación. | Doce meses y actividad visible al pasar a 375 px. El selector conserva 19:54 y «Ahora» usa la hora de la fixture. Doce mensajes sintéticos, observación recogida y posición de lectura restaurada. |

La [regresión del registro diario](regresion-registros/flows.json) reproduce alta, edición, error y reintento sobre el día elegido. Los incrementos rápidos y la foto usan la fixture de etapa 2. Solo la acción explícita de estimar produce una llamada simulada. Los [24 casos del campo Hora](regresion-hora/results.json) verifican altas y ediciones de comida y ejercicio a 320, 375 y 1440 px en ambos temas, incluido el espacio disponible para el sufijo y la visibilidad del pie.

### Alcance de los datos

`src/lib/db.ts` lee `profiles.weight_kg` en `UserProfile.weight` y `syncProfile` escribe el peso editado. `calculateBMR` en `src/utils/helpers.ts` usa ese valor para la estimación basal. La medición del día pertenece al registro diario. Editar el perfil conserva el efecto vigente sobre los cálculos que usan el perfil actual.

`resetData` usa el protocolo de registros vigente. La operación de reinicio selecciona los días del titular y sus entradas relacionadas, incluidos comidas, ejercicios, pasos, agua y peso diario. La interfaz limita su promesa a ese historial. Cuenta, objetivos, conversación y archivos tienen otros recorridos. La prueba de navegador usa un escritor en memoria. La CI comprueba por separado el protocolo de escritura en un entorno desechable.

## Estado de los 17 hallazgos

«Resuelto» se refiere al criterio de interfaz cubierto por la evidencia indicada. La aceptación de los cambios de esta rama queda en revisión.

| ID | Estado | Evidencia |
| --- | --- | --- |
| UX-01 | Parcial. Los períodos se muestran con fechas. Unificar lunes–domingo sigue pendiente de decisión funcional. | [Política semanal](../../ux-stage1-week-policy.md) |
| UX-02 | Resuelto. Bases de los promedios identificadas. | [Etapa 1](../ux-stage1/README.md) |
| UX-03 | Resuelto. Año con actividad visible y doce meses, también al reducir el ancho. | [Corrección #82](../ux-stage2/README.md) |
| UX-04 | Resuelto. Días y períodos rotulados, con scroll local en pantallas estrechas. | [Etapa 1](../ux-stage1/README.md) |
| UX-05 | Resuelto. Ancho de edición en escritorio y protección del borrador. | [Etapa 2](../ux-stage2/README.md) y recorridos de esta rama |
| UX-06 | Resuelto. Selector nativo y acción «Ahora» diferenciados. | [Evidencia de Hora](../ux-stage2/entry-time/README.md) |
| UX-07 | Resuelto. Foto visible, estimación explícita y notas secundarias. | [Etapa 2](../ux-stage2/README.md) |
| UX-08 | Resuelto. Observación compacta durante la conversación. | [Etapa 3](../ux-stage3/README.md) |
| UX-09 | Resuelto. Carga inicial y actualización estables. | [Etapa 3](../ux-stage3/README.md) |
| UX-10 | Resuelto. Sugerencias breves y detalle accesible. | [Etapa 3](../ux-stage3/README.md) |
| UX-11 | Resuelto. Fecha consultada y fecha editable diferenciadas. | [Etapa 2](../ux-stage2/README.md) |
| UX-12 | Resuelto. Acceso al detalle móvil desde Historial. | [Etapa 2](../ux-stage2/README.md) |
| UX-13 | Resuelto. Balance, consumo, gasto y cobertura con jerarquía explícita. | [Etapa 1](../ux-stage1/README.md) |
| UX-14 | Resuelto. Magnitudes de hábitos y alta/edición del peso diario. | [Etapa 2](../ux-stage2/README.md) |
| UX-15 | Resuelto. Comparación con fechas y cobertura del período anterior. | [Etapa 1](../ux-stage1/README.md) |
| UX-16 | Resuelto en el candidato. Perfil, significado del peso y gestión de datos. | Matriz de esta etapa |
| UX-17 | Resuelto en el candidato para las cuatro vistas auditadas. Nombres, estados, jerarquía y descarte. | [Etapa 2](../ux-stage2/README.md), [Etapa 3](../ux-stage3/README.md) y matriz de esta etapa |

## Reproducir desde otra computadora

1. Con Git, tar, Node 24 y Chrome instalados, obtener esta rama y ejecutar `npm ci`. Instalar Playwright 1.56.1 fuera del árbol de producto, por ejemplo con `npm install --prefix ../qa-tools playwright@1.56.1`. El arnés usa Chrome instalado. También acepta una ruta absoluta a `playwright/index.mjs` en `PLAYWRIGHT_MODULE`.
2. Arrancar `node scripts/home-mobile/serve-qa.mjs --stage4 --before`. El servidor extrae la revisión de referencia a un directorio hermano y escucha solo en loopback. En otra terminal ejecutar `node scripts/fitness-global/profile-stage4.mjs --reference` y cerrar ese servidor.
3. Arrancar `node scripts/home-mobile/serve-qa.mjs --stage4`. Ejecutar en secuencia `node scripts/fitness-global/profile-stage4.mjs` y `node scripts/fitness-global/profile-stage4-flows.mjs`. Cerrar el servidor. Las capturas, medidas y recorridos se generan dentro de este directorio.
4. Ejecutar `node --test --test-concurrency=1 tests/public-entry.test.mjs tests/daily-panel.test.mjs tests/workout-entry-premium.test.mjs tests/home-date-navigation.test.mjs`, `npm run lint`, `npm run build` y `git diff --check`. El workflow Linux del PR ejecuta TypeScript de frontend y APIs, comprueba el manifiesto completo de tests y ejecuta la regresión con PostgreSQL y PostgREST locales. Los resultados remotos y el SHA están enlazados en el PR.

Para repetir los dos controles de etapa 2, iniciar `node scripts/home-mobile/serve-qa.mjs --stage2` y ejecutar `node scripts/ux-stage2/check.mjs --flows` y `node scripts/ux-stage2/time-layout.mjs` sucesivamente. Configurar `CALORI_QA_OUTPUT` con el directorio de resultados deseado para cada ejecución.

El borrador personal vive en memoria durante la edición. Recargar la página o finalizar la sesión termina esa edición. Chrome de escritorio ejecuta las pruebas de teclado y emula los viewports. La ampliación duplica fuentes y alturas de línea calculadas con el viewport fijo. Las relaciones de contraste corresponden a los pares medidos. Quedan pendientes la comprobación física en iOS/Android, el zoom nativo, lectores de pantalla y cámara física. La Preview se verifica por estado y SHA. Las operaciones con cuentas reales y servicios de IA quedan fuera de estas pruebas.
