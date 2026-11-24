# Coherencia de fechas, calorías y estados

Base de comparación: `09218c0` (merge de #91). Datos sintéticos en Chrome 158.0.8127.36 para Windows, con huso de Buenos Aires. Se usaron 320 px claro, 375 px oscuro y 1440 px en ambos temas.

| Problema reproducido | Referencia | Candidato |
| --- | --- | --- |
| Inicio situaba el viernes 13 en la semana 8–14 de noviembre. El viernes conserva su fecha y ahora pertenece al 9–15, como en Datos. | [320 px](antes/320-light-semana.jpg) | [320 px](despues/320-light-semana.jpg) |
| Con 1.200 kcal estimadas y 1.000 manuales, el resumen destacaba 1.200. Ahora destaca las 1.000 que se guardan y señala la estimación original debajo. | [320 px](antes/320-light-ajuste.jpg) · [1440 px](antes/1440-dark-ajuste.jpg) | [320 px](despues/320-light-ajuste.jpg) · [1440 px](despues/1440-dark-ajuste.jpg) |
| Un sábado futuro figuraba sin comidas. Al seleccionar esa barra ahora se lee «Fecha futura». | [375 px](antes/375-dark-futuro.jpg) · [1440 px](antes/1440-light-futuro.jpg) | [375 px](despues/375-dark-futuro.jpg) · [1440 px](despues/1440-light-futuro.jpg) |

El recorrido comprueba el resumen ante campo vacío, negativo y fraccionario. Tras completar 1.000, usa Guardar comida, comprueba la confirmación, sigue Ver registro y vuelve a abrir la edición. Cada combinación se ejecutó con una cuenta local aislada. El servicio de estimación y la escritura fueron simulados.

Las pruebas de calendario comparan las siete fechas de Inicio, Historial y Datos, la navegación con flechas y Home/End, los límites de año y mes, la selección y cuatro husos. El ejemplo de −686 kcal el domingo 22 y +734 el lunes 23 usa exactamente un día con comidas por semana. También se ejercitan los días sin registros, las comidas de cero kcal, balance cero, actividad sin ingesta y registros futuros excluidos de los promedios.

Para reproducir, iniciar `node scripts/home-mobile/serve-qa.mjs --audit-november --history-data` y otra instancia con `--before --port=5193`. Ejecutar `node scripts/fitness-global/november-coherence.mjs --before` y luego sin `--before`. Se requiere la instalación de Chrome y Playwright del entorno de QA. La prueba en Safari de iPhone físico queda pendiente. La CI Linux y la identidad del despliegue están enlazadas en el Draft.
