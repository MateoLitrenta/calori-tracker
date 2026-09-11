# Borrado de registros

Aplicar `supabase/migrations/202609110001_delete_daily_records.sql` antes de desplegar el cliente.
El RPC usa la sesión autenticada y RLS (SECURITY INVOKER), sin aceptar IDs de otros usuarios.
Inspecciona las FK reales de meals/workouts a daily_logs: utiliza CASCADE cuando existe;
en caso contrario elimina primero los hijos dentro de la misma transacción. También
elimina registros independientes del usuario. Las demás relaciones con CASCADE se
resuelven al borrar daily_logs; una restricción incompatible provoca rollback y error.
No modifica perfiles, activity_level ni Auth.

La consulta administrativa del esquema remoto no estuvo disponible por falta de
credenciales de Supabase. La migración queda pendiente de aplicación y comprobación
en ese entorno. Si falta el RPC o falla el borrado, la app muestra error y conserva
su estado; nunca anuncia éxito ante una respuesta sin confirmación.

Verificación SQL reproducible, únicamente en una base desechable:
instalar `@electric-sql/pglite` en una carpeta temporal y ejecutar
`node supabase/tests/verify-deletion.mjs <URL-file-del-modulo-pglite/dist/index.js>`.
La prueba crea el esquema de prueba y verifica CASCADE/RESTRICT, aislamiento con RLS,
huérfanos, rollback, conservación de perfiles y rechazo sin sesión.

Las estadísticas alimentarias cuentan solo días hasta hoy con al menos una comida.
El promedio excluye días sin comidas; sin comidas se muestra “Sin datos”.
La racha cuenta días consecutivos y admite que hoy todavía no tenga una comida
si ayer sí la tuvo. Esto no cambia las fórmulas energéticas ni el historial.
