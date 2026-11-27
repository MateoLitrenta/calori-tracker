# Liquid Glass · Inicio etapa 2C

La referencia es `5ff742305c9bb8b0fbc2ea5639aeea2dc0143370`, merge de #107. Incluye el calendario semanal y Hábitos aprobados y la resolución de peso por fecha integrada en #106.

## Material y alcance

- Las altas y ediciones de comida y ejercicio adoptan el radio de 26 px en el diálogo de escritorio, con controles de escritura de 14 px. En móvil se conserva el editor de pantalla completa y las acciones sobre el área de escritura. El encabezado integra la fecha del registro, un reflejo superior y un cierre circular de 44 px. Las superficies de escritura son sólidas y los campos conservan los selectores nativos y un mínimo de 16 px en móvil.
- Ahora, galería, cámara, estimación y deportes usan el mismo tratamiento de controles redondeados. Las acciones principales y el deporte seleccionado usan el naranja de Calori `#ff9a53`. Los estados de foco, guardado, error y estimación conservan sus mensajes y acciones.
- «Elegir fecha» toma los mismos radios y materiales. El día seleccionado usa el naranja y la fecha actual se identifica por el subrayado. La hoja conserva los siete días de lunes a domingo y sus objetivos táctiles a 320 px. El modal de escritorio conserva su foco y navegación.
- El atributo del diálogo limita el estilo de formulario a las cuatro altas y ediciones. El calendario tiene sus propios selectores. Los portales de estos diálogos comparten los cuatro tokens de espaciado que necesitan para calcular radios y márgenes fuera de la aplicación. El detalle, el descarte, el formulario de peso y el resto de Inicio conservan su estilo. Los mecanismos de teclado, `visualViewport`, áreas seguras, persistencia, IA y cálculo conservan su implementación.

## Evidencia

Chrome y WebKit completaron 140 comprobaciones por versión y dos recorridos completos por motor. El candidato mantuvo los objetivos táctiles de al menos 44 × 44 px y registró 0 px de desborde horizontal. En las muestras activas, el contraste mínimo fue 5,97:1 para texto y 8,05:1 para pictogramas. [Comparativas, resultados por motor y reproducción](navegador.md)

Pasaron 11 pruebas focalizadas de las altas y ediciones, el calendario y el aislamiento de peso y detalle. La comprobación de Hora nativa cubrió las cuatro variantes en Chrome a 375 px. [Medición de Hora](after/chromium-hora.json)

## Recorrido en iPhone

1. Confirmá «Versión de Preview» en Perfil. En Inicio consultá otra fecha y abrí «Agregar comida». Verificá el día del registro y el cierre.
2. Con el teclado abierto probá descripción, Calorías y notas. Comprobá que el cursor permanezca visible, que Hora abra el selector nativo y que Guardar y Cancelar sigan accesibles al rotar. Si se pide confirmar descarte, elegí conservar primero y descartá al terminar.
3. Abrí el calendario mensual, recorré un mes anterior y verificá que la fecha cambie al elegir el día. Probá Hoy y la restauración del foco. Repetí en ambos temas.
4. Con una cuenta de prueba autorizada, comprobá los permisos de cámara y galería. Revisá las ediciones de comida y ejercicio y el estado de guardado en esa cuenta.

## Recorrido en escritorio

1. Abrí las cuatro variantes mediante teclado. Verificá el foco en el cierre, el recorrido con Tab y Mayús+Tab, y Escape. Comprobá que el foco vuelva al disparador.
2. En ejercicio, seleccioná un deporte y revisá duración, calorías, Hora y notas. En comida, revisá el selector de tipo, fotos y notas. Confirmá que el cierre de una edición devuelve el punto de lectura.
3. En «Elegir fecha», usá las flechas, Home, End, PageUp y PageDown. Confirmá que mover el foco no cambia el día de Inicio hasta activar una fecha.

Los recorridos automatizados usan datos sintéticos. La comprobación de teclado, cámara y áreas seguras de iPhone físico corresponde a la revisión en el dispositivo.

## Pendientes de Inicio

**2D.** Detalle de comida y ejercicio, confirmaciones de eliminación y descarte, formulario de peso y sus mensajes de guardado y error.

**2E.** Salto de distribución al editar agua y pasos, espacio final de la tarjeta en Tu actividad, controles secundarios, resúmenes, desplegables, espaciado y auditoría integral de Inicio.
