# Fitness Moderno en las cuatro pestañas

## Diagnóstico previo

Base de comparación: `1011721` del PR #79. El recorrido auditado empieza en la aplicación autenticada y alcanza sus cuatro destinos, las hojas de registro y los diálogos de Perfil y Coach.

| Prioridad | Observación en la base | Causa | Intervención |
| --- | --- | --- | --- |
| Crítica | Claro conserva grandes bloques grafito en Inicio y controles oscuros en los portales. | El marcador y sus textos tienen un único tratamiento oscuro. Inicio, Coach, Perfil y la hoja móvil incluyen una clase dark local. | Resolver la apariencia en html. Diseñar la superficie y las tintas del marcador para ambos temas. |
| Crítica | Un día con movimiento y cero comidas destaca un saldo negativo. | DailyPanel ya conoce el estado provisional pero reutiliza el titular completo. | Usar la cobertura como titular y preservar el importe exacto en el desglose. |
| Alta | Al cambiar de pestaña cambian la navegación activa, los titulares y los controles. | Los tokens Fitness viven bajo Inicio. PremiumViews, DesktopExperience y HomeVariants contienen reglas de distintas generaciones. | Publicar los tokens desde la raíz, compartir navegación y retirar las hojas y compensaciones sustituidas. |
| Alta | Sistema sigue al dispositivo pero algunos elementos no siguen al documento. | ThemeProvider ya observa matchMedia. Las clases locales, los colores fijos y los portales contradicen esa decisión. | Conservar una sola preferencia persistida. Heredar el tema resuelto en superficies, portales y controles nativos. |
| Alta | Coach mezcla paletas en observación, mensajes, acciones, objetivos y cámara. | Reglas móviles dispersas, utilidades dark y correcciones específicas de Claro, incluso en Enviar. | Consolidar la presentación de Coach y sus diálogos preservando la lectura, el scroll y la confirmación. |
| Alta | Datos asocia un déficit con éxito y oculta parte de la cobertura en móvil. | Tintas semánticas propias y reglas que esconden el detalle. | Distinguir consumo, gasto, saldo y cobertura. Conservar cálculos, unidades y acceso al detalle. |
| Alta | Perfil y la confirmación de sesión lucen diferentes en ambos temas. | Fondos, colores y controles locales compiten con las utilidades de tema. | Agrupar identidad, preferencias y seguridad con campos, selección y diálogos del sistema compartido. |
| Media | Calendarios, estados de carga y controles secundarios parecen de otra generación. | Foco, rellenos, bordes y radios duplicados o fijos. | Compartir roles de color y control manteniendo las distinciones informativas de Historial. |
