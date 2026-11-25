# Perfil y formularios · Auditoría de noviembre, etapa 4

En Perfil, **Datos personales** reúne los valores usados para estimar el gasto, su explicación y la acción **Editar perfil**. La foto se gestiona junto al avatar. En los cuatro formularios de comida y ejercicio, el selector nativo **Hora** y el botón **Ahora** comparten una disposición que se adapta al espacio disponible.

## Comparación visual

Referencia del PR #94, commit `1fb0e34efd7a82bfd35913a462e77bb5de3f4cab`. Las dos versiones utilizan la misma cuenta ficticia, los mismos registros y la misma zona horaria. Las imágenes y el video se obtuvieron en un navegador local. Cada enlace abre una captura a tamaño completo.

| Escena | Antes | Después |
| --- | --- | --- |
| Perfil móvil, 375 px, Claro | [Lectura](antes/375-light-perfil-lectura.jpg) | [Lectura](despues/375-light-perfil-lectura.jpg) |
| Perfil escritorio, 1440 px, Oscuro | [Lectura](antes/1440-dark-perfil-lectura.jpg) | [Lectura](despues/1440-dark-perfil-lectura.jpg) |
| Explicación del gasto, 375 px, Oscuro | [Desplegada](antes/375-dark-perfil-calculo.jpg) | [Desplegada](despues/375-dark-perfil-calculo.jpg) |
| Edición, 1440 px, Claro | [Nombre y peso](antes/1440-light-perfil-edicion.jpg) | [Nombre y peso](despues/1440-light-perfil-edicion.jpg) |
| Error al guardar, 375 px, Claro | [Aviso](antes/375-light-perfil-error.jpg) | [Error junto a Guardar](despues/375-light-perfil-error.jpg) |
| Hora en comida, alta, 375 px, Oscuro | [Comida](antes/diario-375-dark-add-meal.jpg) | [Comida](despues/diario-375-dark-add-meal.jpg) |
| Hora en ejercicio, alta, 375 px, Oscuro | [Ejercicio](antes/diario-375-dark-add-workout.jpg) | [Ejercicio](despues/diario-375-dark-add-workout.jpg) |
| Hora en comida y ejercicio, edición, 375 px, Claro | [Comida](antes/diario-375-light-edit-meal.jpg) · [Ejercicio](antes/diario-375-light-edit-workout.jpg) | [Comida](despues/diario-375-light-edit-meal.jpg) · [Ejercicio](despues/diario-375-light-edit-workout.jpg) |

[Video de Perfil · 22 s, edición, fallo y reintento](despues/perfil-edicion.webm) · [Guía y resultados de los formularios](formularios.md)

## Objetivos y comprobaciones

| Objetivo | Comprobación con datos sintéticos | Resultado |
| --- | --- | --- |
| Asociar estimaciones y datos | Abrir la explicación y localizarla dentro de Datos personales. Revisar peso en lectura y edición, selector de tema, Cuenta y seguridad y Gestión de datos. | Se conservan la explicación de TMB, pasos, ejercicio y solapamiento y la distinción entre peso de perfil y medición diaria. [Explicación](despues/1440-light-perfil-calculo.jpg) |
| Dar prioridad a la edición | Comparar Editar perfil, Cambiar foto y Eliminar foto. Seleccionar una imagen mientras se edita el nombre y el peso, cancelar la foto, volver a seleccionarla, guardarla y eliminarla. | El borrador conserva los valores y las tres operaciones de foto producen cero escrituras de datos personales. [Foto pendiente](despues/375-light-perfil-foto.jpg) |
| Recuperar el guardado | Introducir un nombre largo y 75,5 kg, simular una actualización de edad a 38, forzar un fallo, reintentar y observar el estado ocupado. | El error permanece en el formulario con anuncio accesible. Al completar se guardan los dos cambios en una escritura y se conserva la nueva edad. La medición diaria continúa en 72,8 kg. [Error](despues/375-light-perfil-error.jpg) · [Guardado](despues/375-light-perfil-guardado.jpg) |
| Preservar borradores y foco | Cancelar la edición, comprobar el foco inicial de Seguir editando, continuar, volver a cancelar y descartar. Cambiar ancho y apariencia del sistema con el nombre enfocado. | Se conserva el texto al continuar, la selección de Sistema y el foco durante el cambio. Después del descarte el foco vuelve a Editar perfil. La prueba de componente comprueba el envío doble. [Pruebas de Perfil](../../../tests/public-entry.test.mjs) |
| Mantener el alcance de Gestión de datos | Abrir la sección, cancelar, comprobar confirmación y bloqueo, simular fallo y reintentar con dos cuentas ficticias. | La otra cuenta conserva sus registros. Aprobado a 320, 375 y 1440 px. [Recorridos](despues/flows.json) · [Gestión abierta](despues/1440-dark-perfil-gestion.jpg) |
| Conservar legibilidad y áreas de acción | Medir a 320, 375, 768 y 1440 px en ambos temas. Ampliar texto al 200 % a 320 px y medir colores efectivos, incluido el guardado ocupado. | Sin desbordamiento horizontal en esas vistas. Editar y Guardar alcanzan 8,05:1, y Guardar deshabilitado, 5,81:1 en Claro y 7,77:1 en Oscuro. Los controles medidos tienen al menos 44 × 44 px. [Mediciones](despues/perfil-mediciones.json) · [Texto ampliado](despues/320-dark-perfil-200.jpg) |
| Mantener Hora completa y Ahora independiente | Probar las cuatro variantes, minutos y período del reloj nativo de 12 h, el cambio manual, Ahora y la fecha elegida. | En 320 px con texto al 200 %, el selector mide 296 px y Ahora pasa a la siguiente fila con 8 px de separación en las cuatro variantes y ambos temas. [Comida](despues/diario-320-dark-edit-meal-200.jpg) · [Ejercicio](despues/diario-320-dark-edit-workout-200.jpg) |
| Revisar las pantallas que comparten estilos | Desde Inicio abrir Ver desglose, comprobar Hábitos, desplegar Historial y visitar Datos y Coach a 375 px en ambos temas. | Las vistas cargan, el desglose incluye la TMB y Datos y Coach caben en el ancho de la ventana. [Recorrido entre vistas](despues/perfil-mediciones.json) |
| Revisar las vistas que comparten estilos | En ambos temas a 375 px, abrir Ver desglose en Inicio, localizar Hábitos y abrir Historial. Navegar a Datos y Coach. | El desglose muestra la TMB, Historial abre y las vistas de Datos y Coach caben en el ancho disponible. [Recorridos](despues/perfil-mediciones.json) |
| Conservar las acciones diarias y el flujo móvil | Probar peso diario, separación de Guardar y Cancelar, guardado lento, error, recuperación, recibos por tipo e ID y clic explícito de estimación tras perder foco. | Los recorridos locales cubren Chrome y WebKit con servicios simulados. [Formularios y reproducción](formularios.md) · [Resultados WebKit](despues/diario-webkit.json) |

### Altura de Perfil en lectura

Medición del contenedor de Perfil, en píxeles CSS, con la explicación y la gestión plegadas. Los dos temas dieron el mismo resultado. En escritorio, la nueva distribución ocupa 8 px adicionales.

| Ancho | Antes | Después |
| --- | ---: | ---: |
| 320 | 1118 | 1070 |
| 375 | 1071 | 958 |
| 768 | 1012 | 961 |
| 1440 | 655 | 663 |

[Mediciones de referencia](antes/perfil-mediciones.json) · [Mediciones de la rama](despues/perfil-mediciones.json)

## Reproducción local

Desde la raíz, instalar las dependencias del lockfile con `npm ci`. El recorrido de Perfil usa Chrome y Playwright desde `../qa-tools/node_modules/playwright/index.mjs` o la ruta indicada por `PLAYWRIGHT_MODULE`. Para el video, el paquete de navegadores de Playwright debe incluir FFmpeg. Se puede indicar su ubicación con `PLAYWRIGHT_BROWSERS_PATH`.

Iniciar la referencia y el candidato en terminales independientes. La opción de referencia extrae las fuentes del commit indicado arriba.

```sh
node scripts/home-mobile/serve-qa.mjs --history-data --profile-november --before --port=5193
node scripts/home-mobile/serve-qa.mjs --history-data --profile-november --port=5194
```

Con los servidores listos, ejecutar los recorridos de a uno.

```sh
node scripts/fitness-global/perfil-noviembre.mjs --before
node scripts/fitness-global/perfil-noviembre.mjs
node scripts/fitness-global/perfil-noviembre.mjs --video
node scripts/fitness-global/profile-stage4-flows.mjs --perfil-noviembre
```

La fixture aísla las escrituras, la foto y la estimación. El error de Perfil se induce en memoria. El PR enlaza la CI Linux y la Preview del commit revisado. La CI usa servicios desechables. La comprobación de la Preview verifica la versión servida.

## Recorrido de Mateo en Safari de iPhone

1. Abrir la Preview con una cuenta de prueba y contrastar el código que muestra Perfil con el publicado en el PR. Desplegar «Cómo calculamos tu gasto». En Editar perfil, escribir un nombre largo y un peso decimal, elegir una foto y cancelar la foto. Comprobar que los dos valores siguen escritos.
2. Con Sistema seleccionado, alternar la apariencia de iOS y volver. Cancelar la edición, elegir «Seguir editando» y luego descartar. Comprobar el foco de regreso en «Editar perfil».
3. Con formato de doce horas, elegir en Inicio un día pasado de prueba. En comida y ejercicio, cambiar Hora, pulsar Ahora y comprobar la fecha del encabezado. En edición, comprobar que la primera hora visible coincide con la guardada.
4. Con el teclado abierto, escribir una descripción y notas de varias líneas, mover el cursor a la última línea y abrir el teclado numérico en calorías. Comprobar que la línea activa y las acciones superiores sean alcanzables con las barras flotantes de Safari. Cerrar y comprobar el retorno al punto de lectura.
5. Con registros de prueba, guardar una comida y un ejercicio y abrir cada uno desde su recibo «Ver registro». Para repetir el clic de «Estimar con IA» usar el entorno con el proveedor simulado. La evidencia adjunta simula teclado, barras y viewport. La geometría física de Safari, VoiceOver y la respuesta de servicios reales requieren comprobación en su entorno.
