# Tu actividad · Validación en navegador

## Capturas comparativas

La referencia es el commit `fb104d6c30832997e85f5e8fa8b211a0fafb162a` de Inicio 2D. Se capturó antes de editar Tu actividad. En ambas versiones, la aplicación real recibe los mismos registros sintéticos y el mismo reloj local de Argentina, con el viernes 13 de noviembre de 2026 consultado. Las capturas de los períodos comienzan en el encabezado de Tu actividad.

| Pantalla | Semana | Mes | Año |
| --- | --- | --- | --- |
| 375 × 812 · Claro | [Antes](before/375-light-semana.jpg) · [Después](after/375-light-semana.jpg) | [Antes](before/375-light-mes.jpg) · [Después](after/375-light-mes.jpg) | [Antes](before/375-light-a%C3%B1o.jpg) · [Después](after/375-light-a%C3%B1o.jpg) |
| 375 × 812 · Oscuro | [Antes](before/375-dark-semana.jpg) · [Después](after/375-dark-semana.jpg) | [Antes](before/375-dark-mes.jpg) · [Después](after/375-dark-mes.jpg) | [Antes](before/375-dark-a%C3%B1o.jpg) · [Después](after/375-dark-a%C3%B1o.jpg) |
| 1440 × 900 · Claro | [Antes](before/1440-light-semana.jpg) · [Después](after/1440-light-semana.jpg) | [Antes](before/1440-light-mes.jpg) · [Después](after/1440-light-mes.jpg) | [Antes](before/1440-light-a%C3%B1o.jpg) · [Después](after/1440-light-a%C3%B1o.jpg) |
| 1440 × 900 · Oscuro | [Antes](before/1440-dark-semana.jpg) · [Después](after/1440-dark-semana.jpg) | [Antes](before/1440-dark-mes.jpg) · [Después](after/1440-dark-mes.jpg) | [Antes](before/1440-dark-a%C3%B1o.jpg) · [Después](after/1440-dark-a%C3%B1o.jpg) |

El miércoles 11 contiene pasos y agua sin comidas. El detalle conserva el gasto estimado y la advertencia de provisionalidad. [Antes](before/375-dark-detalle-parcial.jpg) · [Después](after/375-dark-detalle-parcial.jpg).

## Cómo reproducir

El servidor QA usa los componentes reales. Los perfiles, el reloj y los límites de servicios se sustituyen localmente. La ejecución bloquea los destinos externos y comprueba que consultar fechas haga cero escrituras y cero llamadas de IA.

Con las dependencias instaladas y los navegadores Playwright disponibles, iniciar un solo servidor por vez. `--before` materializa el commit de referencia en una copia aislada con su propio caché.

```sh
# Referencia
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-home-2e --before --port=5193
node scripts/fitness-global/liquid-glass-home-2e.mjs --before --results=../home-2e-baseline-chrome.json
node scripts/fitness-global/liquid-glass-home-2e.mjs --before --webkit --results=../home-2e-baseline-webkit.json

# Candidato
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-home-2e --port=5194
node scripts/fitness-global/liquid-glass-home-2e.mjs --reference=../home-2e-baseline-chrome.json --results=../home-2e-after-chrome.json
node scripts/fitness-global/liquid-glass-home-2e.mjs --webkit --reference=../home-2e-baseline-webkit.json --results=../home-2e-after-webkit.json
```

`PLAYWRIGHT_MODULE` permite indicar la ruta a Playwright. `PLAYWRIGHT_BROWSERS_PATH` permite usar el binario WebKit descargado por Playwright. Con `--section=capturas` se reproducen solo las imágenes de Chrome.

## Escenarios comprobados

- **Semana.** Orden lunes–domingo, días entre meses, selección consecutiva, fecha actual por separado y estados reconocibles por texto accesible. La muestra incluye déficit, superávit, saldo de 0 kcal, actividad sin comidas, fechas vacías y un registro futuro deshabilitado. El detalle del saldo neutro muestra 0 y el detalle vacío no muestra un saldo.
- **Mes.** Navegación por meses con cinco y seis semanas, transición de febrero bisiesto a marzo, fecha del 29 de febrero con sello UTC del 1 de marzo y reloj local distinto de UTC. La comida queda en el día registrado. Se mantiene la fecha editable mientras se explora.
- **Año.** Doce meses presentes, mes actual, meses vacíos y futuros, apertura de diciembre del año anterior y cambio a enero siguiente. La selección y las doce tarjetas se conservan tras alternar entre 390, 1440 y 375 px.
- **Lectura y edición.** «Ver detalle del día» enfoca el detalle. «Ver y editar» cambia la fecha solo al activar la acción explícita. El regreso recupera el día consultado. Se verificaron escenarios sintéticos sin registros, con un día de hábitos y con datos de un mes más cargado.
- **Movimiento y foco.** La selección consecutiva por Tab y flechas conserva el foco visible. El selector se activa con Enter. Se observa la animación normal, se interrumpe al activar movimiento reducido y las siguientes transiciones quedan estáticas. Al cambiar el período desde el final del desplazamiento, la posición vertical varía 0 px.
- **Hoy a 320 px.** En Chrome, la referencia selecciona el domingo después del clic y deja 28 px de la celda fuera del calendario. El candidato desplaza el área local 28 px, revela la celda completa y conserva el scroll vertical. Se verificó una segunda activación por teclado cuando ese domingo ya estaba seleccionado. El foco permanece en «Hoy».

## Mediciones

La matriz cruza siete anchos de 320 a 1440 px, Claro y Oscuro, Semana/Mes/Año y texto al 100/200 %. Chrome 158 completó las 84 configuraciones del candidato con 0 px de desborde horizontal global, sin recortes de texto y con blancos interactivos de al menos 44 × 44 px. El control de edición quedó accesible con al menos 12 px de separación de la cápsula en móvil. En 548 muestras visibles a 375 y 1440 px, el contraste mínimo de texto activo fue 5,73:1 y el de iconos de control activos, 14,87:1. Las mediciones de Inicio y navegación coincidieron con la referencia en los 14 pares de ancho y tema.

A 320 px se retiene un desplazamiento horizontal local de hasta 30 px para mantener siete blancos de 44 px. Con texto al 200 % este desplazamiento también permite leer los valores y días en anchos donde las siete columnas ya no caben. La página mantiene el ancho del viewport.

WebKit 26 reprodujo en el candidato el calendario bisiesto, el cambio de año, el recorrido de edición explícita y el caso de «Hoy» con 0 px de recorte y 0 px de salto vertical. La referencia de WebKit completó 84 configuraciones. A 1440 px el motor informó `ResizeObserver loop completed with undelivered notifications.` al cambiar anchos y tamaños de texto. El mismo aviso apareció en la referencia y el candidato, con el foco y las medidas conservados en las filas observadas. El runner registra ese aviso exacto por separado y falla ante otros errores. Los resultados definitivos de ambos motores quedan en el PR.

## Alcance

Chrome y WebKit son motores ejecutados en escritorio con anchos y preferencias simulados. La ampliación aplica el doble del tamaño computado a los textos de Tu actividad. La separación de la barra se mide por coordenadas y con la prueba de que el punto central del control recibe el toque. Quedan para Safari en iPhone físico el gesto táctil a 320 px, la interacción con la cápsula y las barras dinámicas. La Preview remota se verifica por separado.
