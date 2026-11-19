# Inicio, selectores y calendario de actividad

La referencia es el merge `297982fef0da8ca1cb59677c25496051c9a54457`. Las dos versiones muestran la misma cuenta sintética con fecha local 13 de noviembre. Las capturas y los videos se obtuvieron en Chrome de escritorio. Los tamaños móviles y los cambios de apariencia del sistema se emularon en el navegador.

## Ancho útil

| Viewport | Inicio anterior | Inicio candidato | Bordes del candidato |
| --- | ---: | ---: | --- |
| 375 × 812 | 375 px | 375 px | x = 0 y 375 |
| 1440 × 900 | 1024 px | 1126 px | x = 280 y 1406 |
| 1920 × 1080 | 1024 px | 1440 px | x = 363 y 1803 |

En escritorio, los extremos del encabezado, el esqueleto y el contenido de Inicio coinciden con los de Datos, Perfil y el marco exterior de Coach. La medición incluye el espacio de la barra de desplazamiento del navegador. En 375 px ambas capturas de Inicio, cargando y con datos, son idénticas a sus referencias.

| Pantalla | Antes | Después |
| --- | --- | --- |
| Inicio a 1440 px | [Carga](before/1440-inicio-carga.jpg) · [Contenido](before/1440-inicio.jpg) | [Carga](after/1440-inicio-carga.jpg) · [Contenido](after/1440-inicio.jpg) |
| Inicio a 1920 px | [Carga](before/1920-inicio-carga.jpg) · [Contenido](before/1920-inicio.jpg) | [Carga](after/1920-inicio-carga.jpg) · [Contenido](after/1920-inicio.jpg) |
| Datos a 1440 px | [Carga](before/1440-charts-carga.jpg) · [Contenido](before/1440-charts.jpg) | [Carga](after/1440-charts-carga.jpg) · [Contenido](after/1440-charts.jpg) |
| Perfil a 1440 px | [Carga](before/1440-profile-carga.jpg) · [Contenido](before/1440-profile.jpg) | [Carga](after/1440-profile-carga.jpg) · [Contenido](after/1440-profile.jpg) |
| Inicio a 375 px | [Carga](before/375-inicio-carga.jpg) · [Contenido](before/375-inicio.jpg) | [Carga](after/375-inicio-carga.jpg) · [Contenido](after/375-inicio.jpg) |

## Selectores

Las grabaciones recorren Datos, Historial y Apariencia. El indicador naranja se desplaza durante 200 ms en ambas direcciones, admite saltos de extremo a extremo y termina en la última opción pulsada. Con movimiento reducido, la duración computada es 0 s. Se verificaron el foco visible, la activación con espacio y las etiquetas en una línea a 320 y 375 px. Al elegir Sistema y alternar la apariencia del sistema operativo, el tema aplicado cambia y la preferencia sigue siendo Sistema. [Video en claro](after/selectores-light.webm) · [Video en oscuro](after/selectores-dark.webm)

## Calendario de Historial

La semana contiene un día vacío (8), déficit (9), equilibrio (10), actividad parcial sin comida (11), superávit (12), hoy (13) y futuro (14). El 9 está seleccionado y tiene foco de teclado. El 13 conserva su marca de hoy. La misma ingesta, gasto y categoría producen los mismos valores en ambas versiones.

| Tema y período | Antes | Después |
| --- | --- | --- |
| Claro · Semana | [Original](before/light-Semana.jpg) | [Candidato](after/light-Semana.jpg) |
| Oscuro · Semana | [Original](before/dark-Semana.jpg) | [Candidato](after/dark-Semana.jpg) |
| Claro · Mes | [Original](before/light-Mes.jpg) | [Candidato](after/light-Mes.jpg) |
| Oscuro · Mes | [Original](before/dark-Mes.jpg) | [Candidato](after/dark-Mes.jpg) |

Los resultados incluyen bordes por pantalla, fechas, categorías, colores y estados de selección. [Mediciones de referencia](before/mediciones.json) · [Mediciones del candidato](after/mediciones.json)

Para repetir con las dependencias de Playwright usadas por el proyecto, iniciar `node scripts/home-mobile/serve-qa.mjs --home-controls --port=5194` y ejecutar `node scripts/fitness-global/home-controls.mjs` desde otra terminal. Para la referencia, agregar `--before` a ambos comandos y usar el puerto 5193. La fixture utiliza servicios locales simulados.
