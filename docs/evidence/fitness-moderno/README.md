# Comparación visual de Inicio

Cada lámina presenta, de izquierda a derecha, el PR #79 en `1fafb3e`, el prototipo B original y la implementación integrada. Las tres capturas tienen 375 × 812 píxeles y escala 1. En Inicio se abre la pantalla desde el principio. Para las vistas de hábitos y registros el navegador desplaza su sección hasta donde permite el contenido. Los formularios y el calendario se abren mediante sus botones.

| Vista | Tema claro | Tema oscuro |
| --- | --- | --- |
| Inicio | [Comparar](compare-home-light.jpg) | [Comparar](compare-home-dark.jpg) |
| Hábitos | [Comparar](compare-habits-light.jpg) | [Comparar](compare-habits-dark.jpg) |
| Registros | [Comparar](compare-records-light.jpg) | [Comparar](compare-records-dark.jpg) |
| Comida | [Comparar](compare-meal-light.jpg) | [Comparar](compare-meal-dark.jpg) |
| Ejercicio | [Comparar](compare-exercise-light.jpg) | [Comparar](compare-exercise-dark.jpg) |
| Calendario | [Comparar](compare-calendar-light.jpg) | [Comparar](compare-calendar-dark.jpg) |

Las altas muestran sus valores iniciales originales. La aplicación toma la hora local simulada de las 12:00 y la exploración B propone 13:00. Esta diferencia sólo afecta al campo de un registro nuevo. Los registros existentes y los totales del día coinciden en las tres fuentes.

Las imágenes individuales de Inicio cubren 320 × 740, 375 × 812, 393 × 852, 440 × 900, 768 × 1024 y 1440 × 900. Los archivos se nombran por fuente (`before`, `concept`, `integrated`), ancho, tema y vista. En 768 y 1440 px, el concepto móvil original se muestra centrado a 393 px en el mismo lienzo que las dos versiones de la aplicación. La aplicación sí se renderiza con todo el ancho disponible. [Geometría anterior](before.json) · [Geometría de B](concept.json) · [Geometría integrada](integrated.json) · [Resultados funcionales](journeys/journeys.json).

## Reproducción local

Se requiere Node 24, las dependencias del proyecto, Chrome y el módulo Playwright. Para comparar B se requiere también el prototipo local original de la exploración. Se puede indicar su `phone.html` mediante `CALORI_B_HTML` y la ruta del módulo Playwright mediante `PLAYWRIGHT_MODULE`.

Iniciar los dos servidores desde la raíz del checkout, uno por terminal.

```sh
node scripts/home-mobile/serve-qa.mjs --before-fitness
node scripts/home-mobile/serve-qa.mjs --fitness
```

Con ambos servidores activos, ejecutar la comparación y los recorridos en una tercera terminal.

```sh
node scripts/home-mobile/compare-fitness.mjs before concept integrated boards
node scripts/home-mobile/audit-journeys.mjs --fitness
```

El primer servidor extrae el árbol histórico de Git y el segundo carga el código del checkout. Cada uno tiene su propia caché de Vite. El navegador usa un perfil desechable y el 13 de noviembre de 2026, con zona horaria de Buenos Aires. Se comprueban el balance, el consumo y el gasto del mismo perfil sintético al abrir cada versión. Las solicitudes se limitan al origen local o a los archivos de la exploración.

En la aplicación se montan App, HomeView, DailyPanel, selectores, formularios y navegación reales. El acceso a la cuenta, el escritor de registros, Storage y el transporte de IA están sustituidos por servicios locales. Los resultados cubren la presentación y las operaciones observadas en esos componentes. El acceso remoto, Gemini real y la persistencia en Production quedan fuera de esta prueba.
