# Calori Desktop Experience V3

Base: `main` en `0a03a2c`, que incluye el PR #62 y Visual Polish V2. Rama: `codex/desktop-premium-polish-v3`. Esta iteración reorganiza presentación y scroll; conserva cálculos, datos, formularios y contratos de servicios.

## Auditoría y causas

- **Inicio:** la composición anterior colocaba journal e historial en columnas distintas mediante reglas `:has`. La lista tenía `max-height: clamp(180px, 24dvh, 240px)` y scroll interno: ocultaba registros aunque quedara espacio libre en la página. El heatmap utilizaba celdas fijas y un marco de 135 px, independientemente del ancho disponible.
- **Datos:** `align-items: stretch` vinculaba las alturas de ambas columnas. El bloque de ayuda/detalle reservaba 8–10 rem incluso sin selección. Las tarjetas inferiores añadían altura a etiquetas breves para simular alineación.
- **Perfil:** había reglas de composición tanto en `DesktopExperience.css` como en el CSS de la vista. Los controles de fotografía y apariencia tenían proporciones distintas a las demás acciones y tarjetas.
- **Coach:** la arquitectura de cabecera, compositor y transcript ya era adecuada. Se necesitaba consolidar alineación de avatares, ritmo entre mensajes y anchura de las tarjetas, sin modificar el funcionamiento de IA.

## Fase A: Inicio en tres filas

Checkpoint publicado: `3800eb8`.

1. Resumen energético a la izquierda y Agua/Pasos/Peso a la derecha.
2. Journal de ancho completo: encabezado y acciones en una misma franja, formulario cuando corresponde y registros debajo.
3. Historial de Actividad de ancho completo, después del journal.

La lista crece naturalmente con el contenido. Desde 1280 px, cuatro o más registros usan dos columnas; el orden de lectura sigue siendo cronológico por filas y coincide con el DOM. No se recortan descripciones, cifras ni registros, ni se fija una altura máxima. El estado vacío ocupa únicamente el espacio de su encabezado, acciones y mensaje.

Los wrappers de presentación del journal usan `display: contents` sólo en desktop. No se duplican controles ni encabezados, y se conserva el orden móvil anterior. Clases explícitas sustituyen selectores dependientes de la posición de los elementos.

El heatmap recibe su número real de columnas como variable de presentación. Desde 1280 px, unidades de contenedor calculan celdas cuadradas entre 12 y 22 px; filas de días, separaciones y etiquetas de meses comparten la misma geometría. En los cuatro anchos desktop comprobados se muestran las 53 semanas sin desplazamiento horizontal. En ventanas estrechas, el scroll queda dentro del calendario y las etiquetas Lun/Mié/Vie permanecen fuera del scrollport. Se conservan colores, leyendas, tooltips, selección y controles Año/Mes/Semana/Día; no cambian fechas, agregación ni balances.

## Fase B: Datos y Perfil

Checkpoint publicado: `63da8f4`.

**Datos** conserva resumen/gráfico y actividad/comparación en dos columnas desde 1280 px. Los paneles tienen altura natural con `align-items: start`; no se estiran para llenar la columna opuesta. El balance conserva la jerarquía principal y las métricas secundarias siguen completas, con tipografía legible.

Una franja real de métricas reemplaza el bloque vacío de ayuda: muestra una pista y valores «—» cuando no hay selección y el detalle correspondiente al enfocar, señalar o seleccionar una barra. La estructura permanece montada y permite quitar la selección mediante su control accesible. Se preservan títulos, cifras, cobertura de registros, categorías, períodos y animación del selector.

En las mediciones finales a 1440 y 1280 px, la franja mantiene **93,59–107,59 px según ancho y período**, tanto antes como después de seleccionar los casos comprobados con datos faltantes y cifras extremas, incluidas 1.004.500 kcal. El cambio de selección no desplaza las secciones inferiores; el texto ampliado puede crecer sin recortarse. No se usa una altura rígida de tarjeta para lograrlo.

**Perfil** mantiene sus dos columnas y formularios: identidad/datos y preferencias a la izquierda, cuenta/seguridad y zona de peligro a la derecha. Se uniforman encabezados y padding. La acción de fotografía pasa a tratamiento secundario; Apariencia dispone de todo el ancho de su tarjeta. Zona de peligro conserva advertencias, botón destructivo y confirmaciones, con superficie y encabezado más discretos. La edición, validación y persistencia no cambian.

## Fase C: sistema compartido y Coach

Cada responsabilidad tiene una ubicación canónica:

- `src/DesktopExperience.css`: contenedor desktop, tokens comunes y geometría de Coach. Se retiran de aquí las reglas de composición de Inicio, Datos y Perfil para evitar overrides duplicados.
- `src/components/HomeVariants.css`: presentación de Inicio, journal y geometría del calendario, junto a sus estilos existentes.
- `src/components/PremiumViews.css`: composición de Datos y Perfil junto a sus estilos de vista; también conserva los patrones de mensajes y controles existentes.
- `src/index.css`: radios, movimiento y tratamiento común de scrollbars.

Se reutilizan separación exterior/padding de 24 px, inset de 16 px, títulos de tarjetas de 17 px y métricas secundarias de 28 px. Los radios continúan usando `--radius-panel`, `--radius-widget`, `--radius-control` y `--radius-pill`. Las superficies y acentos siguen utilizando los tokens existentes de cada vista; no se introduce una nueva identidad visual ni dependencias de diseño.

Inicio, Datos y Perfil desplazan el contenedor principal cuando su contenido lo requiere. Coach conserva un único scroll vertical del transcript, con cabecera y compositor fuera de él. Calendario y gráfico pueden desplazarse horizontalmente cuando su contenido lo necesita; los modales largos conservan su scroll propio. Las scrollbars necesarias son finas, discretas y más visibles en hover, sin ocultarlas ni desactivar teclado o interacción táctil. El gutter estable del main evita cambios de ancho al aparecer el scroll.

Coach mantiene un máximo de 1150 px, avatares alineados arriba, ritmo de 20 px entre mensajes en tablet y 24 px en desktop, burbujas de lectura acotada y tarjetas estructuradas más amplias. Las regresiones de seguimiento al final y lectura de mensajes antiguos siguen aprobadas: **16/16 pruebas enfocadas de Coach**. No cambian prompts, Gemini, endpoints, objetivos, cuotas ni persistencia.

## Evidencia de navegador y escenarios

Se utilizaron componentes reales de la aplicación en un navegador real, servidos por un fixture Vite fuera del repositorio. La cuenta, 365 días de historial, registros, conversaciones y objetivos son **sintéticos**. Los servicios remotos están sustituidos en el fixture: estas capturas no acreditan una sesión real autenticada en Preview, una respuesta real de Gemini ni persistencia remota. El fixture no forma parte del build; no se modifican archivos adjuntos del usuario, base de datos o configuración remota.

- **Inicio:** 0, 1, 5 y 32 registros, descripciones largas y palabras sin espacios, cifras grandes e historial anual abundante. Se comprueba crecimiento natural, orden temporal y ausencia de scroll interno de la lista.
- **Datos:** Semana/Mes/Año sin selección y con selección, además de períodos con registros faltantes. Se miden franja de detalle, altura del gráfico y posición de la fila inferior antes/después.
- **Perfil:** visualización normal, formulario abierto y validación nativa de Edad = 0, con mensaje visible y guardado impedido; también ajustes/información expandidos. No se completa un guardado remoto.
- **Coach:** conversación vacía, conversación extensa, mensaje largo del usuario y respuesta local simulada, tarjeta de objetivo y Mis objetivos abierto. Tras la respuesta simulada, la distancia al final del transcript fue 0 px; al ampliar el viewport, una lectura anterior conservó exactamente su scrollTop de 1090,5 px. Las pruebas de comportamiento también cubren lectura anterior sin arrastrar al usuario. La aceptación con servicios y cuenta reales permanece pendiente.

La matriz contiene las cuatro vistas en **nueve resoluciones**: 1920×1080, 1440×900, 1366×768, 1280×720, 1024×768, 768×1024, 430×932, 375×812 y 320×740. En las 36 combinaciones medidas no aparece overflow horizontal global. Por debajo de 1280 px se conserva la composición anterior de las vistas normales; móvil mantiene sus formularios y bottom sheets.

Con la densidad representativa de la matriz, Inicio necesita aproximadamente 28/164/286/323 px de scroll natural en los cuatro escritorios, respectivamente. Datos cabe en 1920 y 1440 y utiliza unos 144/229 px de scroll natural en 1366 y 1280. Perfil cabe en los cuatro. Coach mantiene cabecera y compositor dentro del viewport en las nueve resoluciones y desplaza únicamente los mensajes. Estas medidas no prometen que cualquier cantidad de datos entre en una pantalla: se priorizan contenido completo y legibilidad.

## Comparación antes/después

Capturas comparables a 1440×900, anteriores a V3 y posteriores a las tres fases:

- Inicio: [antes](screenshots/desktop-premium-v3/before-inicio-1440x900.jpg) · [después](screenshots/desktop-premium-v3/after-inicio-1440x900.jpg).
- Datos: [antes](screenshots/desktop-premium-v3/before-datos-1440x900.jpg) · [después](screenshots/desktop-premium-v3/after-datos-1440x900.jpg).
- Perfil: [antes](screenshots/desktop-premium-v3/before-perfil-1440x900.jpg) · [después](screenshots/desktop-premium-v3/after-perfil-1440x900.jpg).
- Coach: [antes](screenshots/desktop-premium-v3/before-coach-1440x900.jpg) · [después](screenshots/desktop-premium-v3/after-coach-1440x900.jpg).

Las capturas por densidad, interacción y móvil acompañan la selección final de evidencia en `docs/screenshots/desktop-premium-v3/`. Las mediciones completas permanecen fuera del producto, en `work/desktop-premium-v3-visual/`: `responsive-matrix.json`, `chart-selection.json` y `missing-selection-final.json`.

## Validaciones y cierre

- TypeScript de frontend, `api/ai` y `api/coach`: aprobado, exit 0.
- Lint: aprobado, exit 0, sin errores; permanecen las 13 advertencias preexistentes.
- Build de producción: aprobado, exit 0; permanece el aviso preexistente de chunk superior a 500 kB.
- Resultado final: **las 322 pruebas aprobadas**, sin omisiones ni pruebas pendientes. La primera suite completa aprobó 320/322: dos conexiones loopback quedaron bloqueadas por el sandbox (`EACCES`/Windows 10013), en PostgreSQL nativo y HTTP serverless compilado. Se concedió permiso de red y se repitieron únicamente esas dos pruebas: **2/2 aprobadas, exit 0**, sin cambios de código entre corridas. Pasan PostgreSQL/RLS nativo, concurrencia, versiones esperadas, rollback y HTTP serverless compilado. No fue el fallo de token restringido de V2 ni se modificó SQL para sortearlo.
- `git diff --check`: aprobado. Tras la última corrección de espaciado de cifras grandes, también pasan las 21 pruebas enfocadas de Datos. Los enlaces del PR en borrador y del Preview se incluyen en la entrega y en la descripción del PR.

Se diferencian las pruebas simuladas, la inspección visual real del fixture y la validación real de un despliegue. No se afirma que se hayan probado zoom nativo al 125 %/150 % o teclado móvil físico: requieren comprobación manual en un dispositivo real. También quedan pendientes la revisión visual del usuario y el flujo autenticado real en Preview. No se ejecutan migraciones, no se cambian variables remotas ni Production y no se realiza merge automático.
