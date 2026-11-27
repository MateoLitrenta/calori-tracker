# Liquid Glass · Inicio etapa 2D

La referencia es el candidato validado de #108, `965334e8f008b23e5a3af8fb6af6f3da07a5b733`. Al iniciar el trabajo, #108 seguía abierto en Draft. La etapa 2D se revisa contra `codex/liquid-glass-inicio-2c`. Cuando #108 llegue a `main`, la base y la validación de integración se actualizarán sobre ese estado.

## Decisiones de diseño

- El detalle reutiliza el encabezado y el cierre circular de 2C. El nombre y las kcal encabezan el cuerpo sólido. Categoría, hora y duración se leen como metadatos. Fecha y día de edición permanecen en el encabezado. Las fotos reutilizan la lectura existente de miniaturas y respetan sus proporciones. Las notas y los títulos largos pueden ocupar varias líneas.
- Editar toma el naranja de Calori. Eliminar y Descartar cambios usan la pareja de colores de peligro. Eliminar conserva nombre, fecha y calorías del registro en la confirmación. Al abrir las confirmaciones, el foco va a Cancelar o Seguir editando.
- Peso reutiliza el editor de 2C y conserva la unidad junto al rótulo. La lectura en Perfil y el gasto por fecha continúan usando la resolución integrada en #106. La regla de descarte se activa solo en Inicio.
- El recibo y los errores de registro llevan el borde y el reflejo de Inicio. El recibo conserva su reserva sobre la navegación, Ver registro y Cerrar. Se mantiene el acuse de la escritura como condición para mostrar éxito. Si aún queda visible el aviso de un intento fallido, el recibo confirmado tiene prioridad de capa mientras la vista está activa.
- El alcance comprende estas ventanas secundarias y sus avisos. Las altas y ediciones de 2C, Inicio, Hábitos y el calendario de Tu actividad se comparan con la referencia.

## Evidencia

[Comparativas, matriz y recorridos de Chrome y WebKit](navegador.md). Los recorridos usan fixtures sintéticas para fotos, escritura, fallos y reintentos. La prueba de teclado y rotación usa geometría simulada. No se prueban eliminaciones con registros personales.

El workflow remoto de regresión se activa con PR dirigidos a `main`. Para la rama dependiente se usa `scripts/staging/run-local-ci.mjs` sobre un checkout del SHA candidato en Ubuntu 24.04. El entorno reproduce Node 24.4.1, PostgreSQL 17.5 y PostgREST 16.5. La validación de GitHub se repite al cambiar la base a `main`.

## Recorrido en Safari de iPhone

1. Verificá el código en Perfil → Versión de Preview. En una cuenta de prueba, abrí una comida con foto y una descripción larga. Desplazá el cuerpo y verificá el cierre, Editar y Eliminar con las barras de Safari visibles.
2. Iniciá la eliminación de un registro sintético. Verificá su identidad, cancelá y comprobá que el foco y el punto de lectura vuelvan al detalle. Reabrí la confirmación y completá el borrado.
3. En la edición de una comida, cambiá notas y pedí cerrar. Elegí Seguir editando y comprobá el contenido, el cursor y la posición antes de descartar.
4. En Peso, con teclado decimal abierto, probá rotación, edición y guardado. Confirmá el peso vigente y su fecha en Perfil. Repetí las ventanas en ambos temas y revisá la separación de los avisos con la cápsula.

## Recorrido en escritorio

1. Abrí con teclado un detalle de comida y uno de ejercicio. Probá Tab, Mayús+Tab y Escape. Comprobá que Editar conserva la fecha del registro.
2. En la confirmación de eliminación, verificá foco inicial en Cancelar, lectura de los datos y foco de retorno al cancelar. Confirmá solo sobre una fixture de prueba.
3. Verificá guardado, Ver registro y el cierre del recibo. Repetí con texto al 200 % y movimiento reducido.

Queda pendiente validar barras del sistema, áreas seguras, cursor y teclado nativos en Safari de iPhone físico. El calendario de Tu actividad y la auditoría final de Inicio quedan para 2E.
