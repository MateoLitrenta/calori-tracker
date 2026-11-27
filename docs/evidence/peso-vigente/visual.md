# Evidencia de Perfil y peso vigente

La comparación usa el código de `a579065571584535408dd89b092de6619b520e27` como referencia y los mismos datos sintéticos en ambas versiones. La fecha de referencia es el 27 de noviembre de 2026 en Buenos Aires. El peso base es 77 kg. Hay 78 kg el 24 de noviembre, 80 kg el 26, una jornada sin medición el 27 y 120 kg el 28, que todavía es futuro. El registro del 24 tiene una versión posterior a la del 26.

## Capturas comparativas

- 375 px, Claro. [Antes](before/375-light-perfil.jpg) · [Después](after/375-light-perfil.jpg)
- 390 px, Oscuro. [Antes](before/390-dark-perfil.jpg) · [Después](after/390-dark-perfil.jpg)
- 1440 px, Claro. [Antes](before/1440-light-perfil.jpg) · [Después](after/1440-light-perfil.jpg)
- 1440 px, Oscuro. [Antes](before/1440-dark-perfil.jpg) · [Después](after/1440-dark-perfil.jpg)
- 375 px, Claro. [Perfil sin medición válida](after/375-light-sin-medicion.jpg) · [Edición del peso base](after/375-light-peso-base.jpg)

## Comprobaciones de navegador

- **Lectura del peso.** La referencia mostraba 77 kg. El candidato muestra 80 kg, «Medición del 26 de noviembre de 2026» y el peso base de 77 kg. Se comprobaron el texto visible y la fecha semántica del elemento `time`.
- **Fecha consultada y ediciones.** Con el 24 seleccionado en Inicio, Perfil muestra la medición del 26. Editar el peso del 24 a 81,5 conserva la lectura de 80 kg. Editar la del 26 a 80,5 actualiza Perfil. Registrar 82 kg el 27 lo convierte en el peso vigente. Los tres guardados se verificaron en el almacén de prueba.
- **Retiro de mediciones.** Se actualizaron los snapshots sintéticos con Perfil abierto para retirar los pesos del 27, 26 y 24 en ese orden. Perfil mostró 80,5 kg del 26, 81,5 kg del 24 y finalmente el peso base de 77 kg sin fecha. La medición futura se mantuvo en el fixture.
- **Peso base y estimaciones.** El gasto histórico del 24 fue 2.321 kcal y su TMB, 1.719 kcal, con la referencia y con el candidato antes y después de guardar las mediciones. La edición explícita del peso base a 79 kg guardó una actualización de perfil y conservó las fechas del conjunto de registros.
- **Presentación.** La zona de Perfil registró 0 px de desbordamiento horizontal y la lectura quedó por encima de la cápsula en las muestras móviles.

Resultados por motor. [Chromium antes](before/chromium.json) · [Chromium después](after/chromium.json) · [WebKit antes](before/webkit.json) · [WebKit después](after/webkit.json).

## Repetir la comparación localmente

Sobre una copia con las dependencias QA existentes, iniciá los dos servidores en terminales separadas. El modo `--before` extrae la referencia del commit indicado y usa la misma fecha de prueba.

```text
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --weight-current --before --port=5193
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --weight-current --port=5194
```

Ejecutá `node scripts/fitness-global/peso-vigente.mjs --before` y `node scripts/fitness-global/peso-vigente.mjs`. Para WebKit, agregá `--webkit` y apuntá `PLAYWRIGHT_BROWSERS_PATH` a los binarios QA instalados si usás una ubicación local distinta de la predeterminada.

## Alcance de la evidencia

El recorrido usa el servidor QA local y el almacén en memoria. Se registraron cero llamadas externas o de IA. No se cambió ningún registro ni configuración remotos. El retiro se verifica mediante un snapshot que ya no incluye la medición, con el mismo mecanismo de actualización que usa el fixture. La prueba no certifica un control de borrado individual ni una sesión en Safari de iPhone físico.
