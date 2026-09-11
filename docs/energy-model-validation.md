# Modelo de gasto diario dinámico

Este documento reemplaza la especificación anterior basada en TDEE.

## Fórmulas centralizadas en src/utils/helpers.ts

- Gasto del día = TMB + pasos registrados × 0.04 + suma exacta de calorías de WorkoutEntry.
- Meta dinámica = gasto − 400 (Déficit), gasto (Mantenimiento), gasto + 300 (Superávit).
- Consumidas = suma de comidas/bebidas; nunca se descuentan pasos o ejercicios de este valor.
- Restantes = meta − consumidas. Un valor negativo se muestra como Exceso.
- Balance energético histórico = consumidas − gasto calculado de ese día.
- TDEE = TMB × multiplicador habitual, solo como referencia de perfil. Sedentario 1.20,
  Moderado 1.375, Activo 1.55; el fallback sigue siendo Sedentario.

La fórmula de TMB y la persistencia de activity_level no cambian. No hay nuevas
migraciones ni dependencias. Cambiar actividad habitual afecta TDEE pero no gasto ni meta.
Las calorías por pasos, gasto diario, meta, restantes y balances se redondean a kcal enteras
con Math.round. Los valores registrados de comida/ejercicio se conservan como entradas.
Las medias gráficas también se redondean. No se aplican correcciones arbitrarias por solapamiento:
pasos y ejercicio pueden describir parte de la misma actividad y sobreestimar el gasto.

## Vistas y estado

DailyPanel calcula la meta desde las props actuales en cada render: los cambios optimistas
del store al cambiar pasos o agregar/editar/eliminar ejercicios actualizan la meta.
Muestra Consumidas, Meta de hoy, Restantes/Exceso, gasto estimado, TMB y el desglose de
pasos y ejercicio. Para fechas pasadas usa las etiquetas del día seleccionado.
ProfileView conserva TDEE como referencia y calcula la meta con los registros de hoy.
ChatView usa buildDailyEnergyContext para distinguir TDEE habitual del gasto dinámico,
con desglose y advertencias para Gemini de no recalcular ni sumar actividad otra vez.

Heatmap y agregaciones excluyen días vacíos (también solo agua/peso), ausentes o futuros.
Una fecha con comidas pero sin actividad tiene gasto TMB. Pasos/ejercicio sin comidas
constituyen datos energéticos. Las fechas se deduplican y se suman gastos y metas reales
de cada fecha. ChartsView usa metas diarias específicas, medias por días con datos y la
suma de metas para sus macros aproximados; conserva sus ventanas de períodos existentes.
Los históricos usan la TMB del perfil actual, ya que no hay snapshots biométricos históricos.

## Validación y límites

npm test incluye fórmulas, fracciones de calorías, tres objetivos, independencia de
activity level, pasos/ejercicio añadidos/editados/eliminados, consumidas, Sin datos,
restantes/exceso, agregaciones de 7/30/365 días, contexto Gemini y regresión del guardado/carga
de actividad. DailyPanel también se renderiza con datos cambiantes para verificar etiquetas
y metas sin duplicar sus fórmulas en la prueba. Las pruebas de persistencia usan Supabase
simulado; no escriben en producción. El contexto de Gemini se prueba, no una respuesta viva.

Ejemplo: masculino 70 kg, 170 cm, 30 años → TMB 1618. Con 7000 pasos (280 kcal) y un
entrenamiento registrado de 450 kcal, gasto 2348; metas 1948 / 2348 / 2648 según objetivo.
TDEE Activo = 2508, pero no participa en ninguno de esos resultados diarios.

Lint conserva advertencias de React/hooks preexistentes. Build puede advertir sobre el
bundle mayor a 500 kB. No se ha desplegado ni hecho merge. La migración de activity_level
incluida en el cambio anterior sigue siendo requisito de la versión desplegada.
