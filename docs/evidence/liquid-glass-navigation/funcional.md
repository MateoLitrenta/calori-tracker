# Navegación y teclado

La referencia es el merge `80c9a1500b68d877e1de5c57c4f6eae8f7a431fa`. Los recorridos usan el mismo perfil, día y conversación sintéticos. Se montan los componentes reales de React. El servidor simula respuestas, autenticación y escrituras. Cada sesión de navegador bloquea peticiones a otros orígenes.

| Escenario | Comprobación |
| --- | --- |
| Navegación por teclado | Tab cambia el foco visible de Inicio a Coach. La selección permanece en Inicio hasta Enter. |
| Cambio de sección pendiente | Al solicitar una salida con el perfil editado, Perfil sigue seleccionado y el indicador conserva su posición. Volver al borrador mantiene el nombre editado. Descartar acepta la salida y mueve el indicador. |
| Conversación larga | Ir a Inicio y volver a Coach restaura 240 px de desplazamiento. |
| Compositor | Al abrir el teclado táctil simulado, la barra desaparece, libera su reserva y Enviar queda por encima del teclado. Se conservan texto, posición del cursor y lectura al girar y cruzar 767/768 px. Cerrar devuelve la selección a la vista. Un toque en Enviar genera una consulta simulada. |
| Propuestas | Al enfocar calorías de comida o detalles de ejercicio, la barra permanece oculta y el campo queda dentro del lector. Cambiar de sección y volver conserva la edición. |
| Recibo | Confirmar la comida guarda 235 kcal mediante una escritura simulada y el recibo se conserva al navegar. Cancelar el ejercicio no escribe. |
| Formularios diarios | En comida y ejercicio, la barra queda inerte y deja de verse. Escape cierra el formulario y devuelve el foco a su disparador. |

## Resultados

Chromium pasó Claro y Oscuro en la referencia y el candidato. WebKit pasó ambos temas sobre el candidato. En las cinco posiciones de teclado simulado, el compositor conservó Enviar visible y dejó 0 px de reserva para la barra. La altura visual efectiva fue de hasta 190 px al girar. Cada contexto realizó dos consultas sintéticas y una sola escritura explícita de comida. La edición y la cancelación de ejercicio conservaron el único recibo de la sesión.

En Chromium, el acceso lateral Cambiar Tema siguió operativo a 768 × 450 px con texto normal. Claro, Oscuro y Sistema ocuparon objetivos de 44 px y sus centros recibieron interacción. Elegirlos con Enter devolvió el foco al botón. Con Sistema seleccionado, cambiar la apariencia efectiva no modificó la preferencia ni la sección activa.

## Comparativas de Coach

Las capturas de Chromium usan un marco móvil de 375 × 667 px y uno de escritorio de 1440 × 900 px. La barra se oculta deliberadamente en las capturas de teclado y de propuestas.

| Vista | Claro | Oscuro |
| --- | --- | --- |
| Conversación móvil | [Antes](before/coach-conversacion-375-light.jpg) · [Después](after/coach-conversacion-375-light.jpg) | [Antes](before/coach-conversacion-375-dark.jpg) · [Después](after/coach-conversacion-375-dark.jpg) |
| Conversación escritorio | [Antes](before/coach-conversacion-1440-light.jpg) · [Después](after/coach-conversacion-1440-light.jpg) | [Antes](before/coach-conversacion-1440-dark.jpg) · [Después](after/coach-conversacion-1440-dark.jpg) |
| Compositor con teclado | [Antes](before/coach-teclado-375-light.jpg) · [Después](after/coach-teclado-375-light.jpg) | [Antes](before/coach-teclado-375-dark.jpg) · [Después](after/coach-teclado-375-dark.jpg) |
| Calorías de propuesta de comida | [Antes](before/coach-propuesta-375-light.jpg) · [Después](after/coach-propuesta-375-light.jpg) | [Antes](before/coach-propuesta-375-dark.jpg) · [Después](after/coach-propuesta-375-dark.jpg) |
| Detalles de propuesta de ejercicio | [Antes](before/coach-propuesta-ejercicio-375-light.jpg) · [Después](after/coach-propuesta-ejercicio-375-light.jpg) | [Antes](before/coach-propuesta-ejercicio-375-dark.jpg) · [Después](after/coach-propuesta-ejercicio-375-dark.jpg) |

[Chromium de referencia](before/coach-chromium-funcional.json) · [Chromium del candidato](after/coach-chromium-funcional.json) · [WebKit del candidato](after/coach-webkit-funcional.json)

## Reproducción

Levantá el servidor con los fixtures de esta etapa. Los puertos 5193 y 5194 sirven las dos versiones. El runner usa `PLAYWRIGHT_MODULE` si se indica o busca Playwright en `../qa-tools`.

```sh
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --before --port=5193
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --port=5194
```

Con los dos servidores abiertos, ejecutá los recorridos de a uno.

```sh
node scripts/fitness-global/liquid-glass-coach.mjs --before
node scripts/fitness-global/liquid-glass-coach.mjs
node scripts/fitness-global/liquid-glass-coach.mjs --webkit
```

Para WebKit, instalar el navegador de Playwright o indicar su directorio con `PLAYWRIGHT_BROWSERS_PATH`.

## Revisión en iPhone físico

1. Abrí la Preview y comprobá el código en Perfil. Probá Inicio, Coach, Datos y Perfil con la barra inferior de Safari visible y plegada.
2. En una conversación de prueba, escribí varias líneas, girá el teléfono con el teclado abierto y tocá Enviar una vez. Comprobá el cursor y la vuelta de la barra al cerrar el teclado.
3. Editá calorías en una propuesta de comida y después los detalles de un ejercicio. Cerrá el teclado, cambiá de sección y volvé. Comprobá que el valor editado y el punto de lectura se conservan. Confirmá únicamente si estás usando registros de prueba.
4. Desde Inicio, abrí un formulario y comprobá que la cápsula no cubra sus acciones. Repetí con movimiento reducido o con texto ampliado.

Las capturas automatizadas muestran una reducción sintética de `visualViewport`. Quedan para la comprobación física de Safari el teclado nativo, las barras dinámicas, las áreas seguras y el rendimiento gráfico del dispositivo.
