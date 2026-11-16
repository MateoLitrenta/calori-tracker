# Comparación de Fitness Moderno en las cuatro pestañas

Las imágenes se tomaron en Chrome con la misma fecha de aplicación, el 13 de noviembre de 2026, y la misma cuenta ficticia. La referencia es el árbol de producto archivado desde `1011721`. El candidato usa los componentes del PR. Cada combinación comienza en un contexto de navegador nuevo. Las cuatro pestañas se abren desde la navegación real.

| Pestaña | Antes y después en 375 px | Antes y después en 1440 px |
| --- | --- | --- |
| Inicio | [Comparar Inicio móvil](comparisons/375-inicio.jpg) | [Comparar Inicio escritorio](comparisons/1440-inicio.jpg) |
| Coach | [Comparar Coach móvil](comparisons/375-coach.jpg) | [Comparar Coach escritorio](comparisons/1440-coach.jpg) |
| Datos | [Comparar Datos móvil](comparisons/375-datos.jpg) | [Comparar Datos escritorio](comparisons/1440-datos.jpg) |
| Perfil | [Comparar Perfil móvil](comparisons/375-perfil.jpg) | [Comparar Perfil escritorio](comparisons/1440-perfil.jpg) |

Cada lámina conserva el viewport completo. Las capturas originales de [antes](before/) y [después](after/) incluyen Claro, Oscuro, Sistema con dispositivo claro y Sistema con dispositivo oscuro a tamaño nativo en ambos anchos. Por ejemplo, se puede comparar el selector de Perfil [siguiendo al dispositivo claro](after/375-system-light-perfil.jpg) y [siguiendo al dispositivo oscuro](after/375-system-dark-perfil.jpg).

## Lectura de las capturas

- **Inicio.** El marcador claro pasó de grafito a una superficie arena. Los consumos, el gasto, los registros y la fecha mantienen su posición. En el día parcial, el titular explica que faltan comidas y el importe calculable se conserva en el desglose. [Día parcial](interactions/inicio-dia-parcial.jpg)
- **Coach.** La acción de la observación, las sugerencias y el campo de escritura se distinguen al primer vistazo. El texto conversacional mantiene una familia de lectura y la botonera comparte la jerarquía visual de Inicio. La propuesta visible requiere una acción explícita. [Estado con evidencia abierta](coach-flows/375-light-evidencia.png)
- **Datos.** En la muestra semanal se leen los mismos −828 kcal/día con tres días de ingesta y cuatro días energéticos. La etiqueta «Déficit Alto» tiene tratamiento neutro. El trazado diferencia las barras por color y trama. El usuario puede solicitar los valores exactos. [Comparación de cifras por período y por cuenta](numerical-parity.json)
- **Perfil.** Apariencia precede a los controles de seguridad. Nombre, foto, edición y datos personales siguen agrupados. El diálogo conserva foco inicial en Cancelar y devuelve el foco a la acción de sesión al salir. [Diálogo de salida](interactions/dialogo-perfil-sistema-claro.jpg)

## Pruebas y reproducción

| Evidencia | Alcance |
| --- | --- |
| [Matriz anterior](before/matrix.json) y [matriz del candidato](after/matrix.json) | 320, 375, 393, 440, 768 y 1440 px × cuatro apariencias × cuatro pestañas. Mide ancho real, navegación, solapamiento con compositor y llamadas al abrir cada vista. |
| [Contraste por muestra](contrast.json) | Color computado del texto frente a su fondo sólido compuesto, con umbral 4,5 para texto corriente y 3 para texto grande. Se toman muestras en ambas resoluciones de tema. |
| [Inicio e Historial](home-journeys/journeys.json) | Comprensión del balance, calendario, comidas, ejercicio, agua, pasos, peso, borrador protegido, foco, error, reintento, edición, borrado y aislamiento de dos cuentas. |
| [Cambios de apariencia y estados](interactions/journeys.json) | Cambio en vivo, cambio del SO con formulario y modal abiertos, persistencia al recargar, cuatro pestañas, guardado de perfil, recuperación tras fallo, carga y datos vacíos/parciales/completos. |
| [Datos y Perfil](views-flows/checks.json) | Semana/Mes/Año, detalle con teclado, foto local, contraseñas, borrado cancelado y contadores en claro y oscuro. |
| [Coach](coach-flows/) | Conversación con respuesta sintética, evidencia, historial, edición y confirmación, objetivos, cuotas y adjuntos locales. |

Las barras pueden desplazarse dentro de su propio gráfico cuando el ancho es insuficiente. La matriz distingue ese contenedor alcanzable del desbordamiento de la página. La revisión de contraste se limita al texto muestreado. La miniatura del marcador usa los datos de la fixture, no representa una recomendación nutricional.

Con las dependencias bloqueadas del repositorio ya instaladas y una instalación de Playwright que pueda iniciar Chrome, arrancar cada servidor desde la raíz en su propia terminal.

```sh
node scripts/home-mobile/serve-qa.mjs --before-global
node scripts/home-mobile/serve-qa.mjs --global
```

Los servidores escuchan sólo en loopback, en los puertos 5193 y 5194. La variable opcional `PLAYWRIGHT_MODULE` señala el archivo `index.mjs` de una instalación de Playwright. `QA_BROWSER_CHANNEL` permite elegir el canal instalado. Con ambos servidores activos se puede repetir la evaluación.

```sh
node scripts/fitness-global/matrix.mjs --before
node scripts/fitness-global/matrix.mjs
node scripts/fitness-global/boards.mjs
node scripts/fitness-global/readability.mjs
node scripts/fitness-global/journeys.mjs
node scripts/fitness-global/views-flows.mjs
node scripts/fitness-global/coach-flows.mjs
node scripts/fitness-global/numeric-parity.mjs
node --experimental-strip-types scripts/home-mobile/audit-journeys.mjs --global
```

El arnés monta App, ThemeProvider y las cuatro vistas reales. Sustituye la sesión, almacenamiento de fotos, actualizaciones de perfil y escrituras de registros por servicios locales. El cliente de IA y el de objetivos procesan respuestas HTTP sintéticas en memoria. Las aserciones de persistencia comprueban el comportamiento de la interfaz tras guardar y recargar esa cuenta local. Gemini, las credenciales, cuotas reales, permisos físicos de dispositivos, Supabase y Production quedan fuera de estas pruebas. El navegador es Chromium de escritorio con viewports emulados.
