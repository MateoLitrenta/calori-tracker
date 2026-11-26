# Comparativas de Perfil y navegación

La referencia es `397a5d258c39c1cfc4309d28626bbd93fe201d4f` y ambas versiones usan las mismas fixtures sintéticas. Las capturas son de Chrome. WebKit repite las mediciones y los recorridos de la matriz.

## Perfil

En «Cuenta y seguridad» se alinea el divisor de Contraseña con el centro de la cápsula. En 440 px se abre «Cómo calculamos tu gasto» para que el divisor alcance esa posición en ambos cortes. Al final del scroll se abre «Gestión de datos» y se comprueba el botón final mediante hit test.

| Marco en px CSS | Tema | Cuenta y seguridad | Final del scroll |
| --- | --- | --- | --- |
| 375 × 812 | Claro | [Antes](before/perfil-375-light-cuenta.jpg) · [Después](after/perfil-375-light-cuenta.jpg) | [Antes](before/perfil-375-light-final.jpg) · [Después](after/perfil-375-light-final.jpg) |
| 375 × 812 | Oscuro | [Antes](before/perfil-375-dark-cuenta.jpg) · [Después](after/perfil-375-dark-cuenta.jpg) | [Antes](before/perfil-375-dark-final.jpg) · [Después](after/perfil-375-dark-final.jpg) |
| 390 × 844 | Claro | [Antes](before/perfil-390-light-cuenta.jpg) · [Después](after/perfil-390-light-cuenta.jpg) | [Antes](before/perfil-390-light-final.jpg) · [Después](after/perfil-390-light-final.jpg) |
| 390 × 844 | Oscuro | [Antes](before/perfil-390-dark-cuenta.jpg) · [Después](after/perfil-390-dark-cuenta.jpg) | [Antes](before/perfil-390-dark-final.jpg) · [Después](after/perfil-390-dark-final.jpg) |
| 440 × 956 | Claro | [Antes](before/perfil-440-light-cuenta.jpg) · [Después](after/perfil-440-light-cuenta.jpg) | [Antes](before/perfil-440-light-final.jpg) · [Después](after/perfil-440-light-final.jpg) |
| 440 × 956 | Oscuro | [Antes](before/perfil-440-dark-cuenta.jpg) · [Después](after/perfil-440-dark-cuenta.jpg) | [Antes](before/perfil-440-dark-final.jpg) · [Después](after/perfil-440-dark-final.jpg) |

A 390 × 844 px, la reserva externa de 64 px deja el final de `.app-main` en y = 780. La cápsula empieza en y = 782 y el scrollport corta la tarjeta incluso al retirar temporalmente los bordes. Al trasladar esa reserva al interior, el scrollport llega a y = 844 y el contenido de Cuenta llega a los cuatro puntos medidos detrás de la cápsula. El borde físico de la tarjeta se difumina al pasar bajo la barra. [Diagnóstico de referencia con bordes ocultos](before/diagnostico-sin-bordes.jpg)

Los dos clips reproducen el recorrido cerrado de Perfil de inicio a fin a 390 × 844 px en Oscuro. [Video antes](before/perfil-en-movimiento.webm) · [Video después](after/perfil-en-movimiento.webm)

## Pantallas de control

| Vista a 390 × 844 px | Claro | Oscuro |
| --- | --- | --- |
| Inicio | [Antes](before/control-inicio-390-light.jpg) · [Después](after/control-inicio-390-light.jpg) | [Antes](before/control-inicio-390-dark.jpg) · [Después](after/control-inicio-390-dark.jpg) |
| Datos | [Antes](before/control-datos-390-light.jpg) · [Después](after/control-datos-390-light.jpg) | [Antes](before/control-datos-390-dark.jpg) · [Después](after/control-datos-390-dark.jpg) |
| Coach | [Antes](before/control-coach-390-light.jpg) · [Después](after/control-coach-390-light.jpg) | [Antes](before/control-coach-390-dark.jpg) · [Después](after/control-coach-390-dark.jpg) |

## Mediciones

Chrome 158 y WebKit 26 pasaron las 12 escenas por versión. En ambas mediciones, el ajuste conserva el rango de desplazamiento, el margen útil al final, la posición de los divisores y las cajas de la cápsula, del marcador y de los rótulos. En Chrome a 390 px, el rango de Cuenta es 210 px en ambos casos. El botón «Borrar todos los registros» queda a 35 px por encima de la barra al final y su centro responde al hit test en las seis vistas de Perfil. La prueba no activa el borrado.

El contraste mínimo del texto de navegación fue 5,74:1 en Chrome y 5,82:1 en WebKit. Los iconos alcanzaron un mínimo de 5,45:1 en ambos motores. Las seis capturas de control coincidieron byte a byte y la geometría de Inicio, Datos y Coach coincidió en cada motor. Ambas ejecuciones WebKit registraron cero avisos de redimensionamiento. [Chrome antes](before/mediciones.json) · [Chrome después](after/mediciones.json) · [WebKit antes](before/mediciones-webkit.json) · [WebKit después](after/mediciones-webkit.json)

## Reproducción

Iniciá las fixtures en terminales separadas y corré las comparativas en serie. Las fixtures bloquean conexiones externas. El ajuste de `PLAYWRIGHT_MODULE` indica la ruta del módulo de Playwright. `PLAYWRIGHT_BROWSERS_PATH` indica la instalación de WebKit y FFmpeg.

```sh
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-profile --before --port=5193
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-profile --port=5194
```

```sh
node scripts/fitness-global/liquid-glass-visual.mjs --glass-profile --before
node scripts/fitness-global/liquid-glass-visual.mjs --glass-profile
node scripts/fitness-global/liquid-glass-visual.mjs --glass-profile --before --webkit
node scripts/fitness-global/liquid-glass-visual.mjs --glass-profile --webkit
```

La prueba de las barras dinámicas, el teclado y el área segura nativa de Safari requiere iPhone físico.
