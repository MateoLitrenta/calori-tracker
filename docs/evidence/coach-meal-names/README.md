# Nombres de comidas del Coach · 26 de noviembre de 2026

Base: `c4ed2f221121bec448e7aa08e161e4fa82c60bd5`, merge del PR #98.

## Problema y criterio

El contrato de `add_meal` exigía un nombre no vacío, pero no distinguía un título reconocible de la categoría. La interfaz ya utilizaba el mismo `payload.name` para la propuesta, el recibo y el registro. El ajuste empieza en el contrato de IA y prepara una sola vez los títulos genéricos al recibir una respuesta válida.

| Respuesta recibida | Propuesta preparada |
| --- | --- |
| Nombre «Almuerzo»; detalles «Milanesa con papas y cerveza» | Nombre «Milanesa con papas y cerveza»; categoría Almuerzo; detalles conservados |
| Nombre «Merienda»; detalles «Café con dos tostadas y queso» | Nombre «Café con dos tostadas y queso»; categoría Merienda |
| Nombre «Comida»; detalles «Sin azúcar» o «Porción mediana» | Borrador completo en edición; nombre vacío con explicación junto al campo |
| Nombre «Comida»; detalles «Al horno, sin aceite» | Conserva la nota y pide completar el nombre |
| Nombre concreto o nombre editado manualmente | Se conserva exactamente al navegar, confirmar o reintentar |
| Repetición exacta de un genérico ya confirmado en esa conversación | Conserva la identificación por recibo e ID y muestra «Ya registrado» |

## Decisiones

- El prompt pide nombres basados en los alimentos y bebidas, con categoría y hora en sus propios campos. La descripción completa conserva cantidades, preparación y notas explícitas. No se pide otra llamada al proveedor para generar el título.
- `prepareCoachMealAction` solo modifica placeholders inequívocos. Recupera texto de los detalles de **esa misma acción** y conserva los detalles originales, incluidos los saltos de línea. No busca alimentos en mensajes de otras comidas ni transforma registros históricos.
- La recuperación es conservadora: rechaza notas y metadatos reconocibles sin un alimento. No es un analizador general del idioma ni una garantía de que el proveedor respete siempre el contrato. Un nombre irrecuperable deja el borrador disponible para completarlo.
- Los títulos recuperados tienen un máximo de 96 caracteres, con corte por palabra y elipsis. Los nombres concretos o manuales no se recortan. El campo de nombre ocupa el ancho del editor y los títulos de lectura admiten salto de línea.
- La preparación ocurre antes de mostrar la propuesta, una sola vez. Confirmar guarda el texto revisado; navegar, editar la categoría y reintentar no vuelven a generar el nombre.
- Antes de preparar un nombre se comprueba si la acción corresponde exactamente a un registro confirmado por ID en esa conversación. Esto conserva el aviso de duplicado de los registros anteriores con títulos genéricos, sin agrupar comidas similares de otros registros.

## Evidencia funcional

Las pruebas de `tests/coach-meal-names.test.mjs` verifican el contrato enviado por la API con proveedor simulado, el aislamiento de varias comidas, las descripciones largas, las notas ambiguas, la conservación de los detalles y la ausencia de mutaciones.

`tests/coach-store-sync.test.mjs` utiliza App, React, navegación, store y manejadores reales. Los nuevos recorridos comprueban:

1. Dos comidas recuperan nombres propios y coinciden en tarjeta, recibo, Inicio, datos enviados a Historial, detalle y edición.
2. Un nombre manual —incluido «Cena»— y la categoría sobreviven a la navegación y al error/reintento. El reintento reutiliza el ID y no consulta de nuevo a la IA.
3. El nombre vacío conserva el resto de la propuesta y su explicación accesible; no permite guardar hasta completarlo.

Las pruebas de ChatView cubren además la compatibilidad con los recibos de comidas genéricas confirmadas anteriormente. La validación completa de Linux se adjunta al PR para su commit final.

Validación local del candidato: **175/175** pruebas focalizadas, sin omisiones; TypeScript de frontend, IA y Coach, build y `git diff --check` aprobados. Lint conserva las diez advertencias de la base. El build mantiene el aviso existente del bundle principal mayor de 500 kB. El script de QA también pasó lint y su comprobación HTTP/módulos.

## Reproducción visual local

```bash
npm ci
node scripts/coach-meal-names/serve.mjs
```

Abrir `http://127.0.0.1:5194/app?case=standard&theme=light&reset=1`. El servidor solo se vincula a loopback. App, vistas, estilos, ThemeProvider, AITransport y CoachConversationStore son reales; autenticación, proveedor y escrituras son sintéticos. El fixture bloquea las solicitudes a servicios remotos.

El panel «Prueba sintética de nombres» permite preparar el próximo caso y simular un error de guardado. Después de preparar un caso, abrir Coach y enviar un mensaje. También se puede elegir el caso en la URL:

| Parámetro | Caso |
| --- | --- |
| `case=standard` | Genérico con descripción reconocible |
| `case=missing` | Nota insuficiente para un nombre |
| `case=long` | Título concreto largo y detalles completos |
| `case=multi` | Dos comidas distintas |
| `theme=light` / `theme=dark` | Apariencia |
| `controls=0` | Ocultar controles de QA |

`node scripts/coach-meal-names/serve.mjs --check` comprueba HTTP y transformación de los módulos. Ese comando no valida geometría ni interacciones de navegador.

## Revisión de aceptación en Preview

1. Confirmar la versión indicada en Perfil.
2. En Coach, pedir una comida concreta con hora: «Hoy a las 13:30 comí una milanesa con papas y tomé una cerveza». Si pide una cantidad o preparación, completar el dato observable.
3. Verificar que nombre, categoría y detalles representan esa comida. Cambiar el nombre, salir a Inicio y volver a Coach: debe conservarse.
4. Confirmar y localizar el registro en Inicio. Abrir el detalle y editar: mismo nombre, kcal, hora y descripción revisados.
5. Comprobar un título largo en móvil y escritorio, Claro y Oscuro: texto legible, calorías y acciones visibles. En iPhone, editar el nombre con el teclado abierto y confirmar que se conservan los arreglos de navegación.

## Límites de la evidencia

Los servicios remotos de las pruebas son sintéticos. El contrato de IA se comprueba con respuestas simuladas; Gemini real requiere la comprobación de Preview con una sesión autorizada. No se modifican variables de entorno ni cuotas.

El navegador disponible rechazó la conexión al servidor local por `ERR_CONNECTION_REFUSED`. No se obtuvieron capturas ni se afirma una validación visual en navegador o iPhone físico. El fixture queda disponible para reproducir esa comprobación en un equipo que pueda acceder a su loopback.
