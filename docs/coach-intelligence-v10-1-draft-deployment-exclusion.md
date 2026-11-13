# Exclusión temporal de despliegues del Draft V10.1

El usuario autorizó publicar el Draft de las correcciones posteriores al despliegue, con una única exclusión en `vercel.json`:

```json
"git": {
  "deploymentEnabled": {
    "codex/coach-goal-natural-date-range-fix": false
  }
}
```

La clave es un nombre de rama exacto, sin comodines. Según la [configuración oficial de Vercel](https://vercel.com/docs/project-configuration/git-configuration#gitdeploymentenabled), las ramas no especificadas mantienen el valor predeterminado `true`. No desactiva `main`, Production ni otras ramas. Los cuatro rewrites permanecen intactos. No se cambiaron ajustes del proyecto en Vercel, variables, secretos o integraciones.

La comprobación estática valida que la única clave sea la rama indicada, con valor `false`, y que al quitar el bloque `git` el JSON restante coincida con el de `44c79e8`. Tras publicar se consulta por separado la lista de deployments de esa rama y el despliegue Production vigente; esa observación se registra en la descripción del Draft.

## Retirar antes del merge

1. Conservar la regla mientras el usuario mantenga la condición de no crear nuevos despliegues. Una autorización para revisar o ejecutar CI no autoriza a retirarla.
2. Obtener autorización expresa para retirar la exclusión y subir el nuevo commit. Ese push puede generar automáticamente una Preview; acordar la transición antes de ejecutarlo. El estado Draft por sí solo no evita el despliegue.
3. En la rama del PR, eliminar únicamente `git.deploymentEnabled["codex/coach-goal-natural-date-range-fix"]`. Si los objetos `deploymentEnabled` y `git` quedan vacíos, quitar ambos. No sustituir la regla por `false` global ni agregar comodines.
4. Revisar `git diff -- vercel.json` y validar JSON. Si no hubo otros cambios de configuración, el archivo debe ser idéntico al de `44c79e8`, con sus cuatro rewrites. Si hubo cambios posteriores, conservarlos y comprobar que sólo desaparezca esta exclusión temporal.
5. Subir el commit de retiro autorizado, esperar la CI del nuevo HEAD y revisar sus resultados. El código y los resultados de este Draft no sustituyen la comprobación del HEAD final.
6. Verificar que la regla temporal ya no forme parte del diff final. Mantener el PR sin merge hasta la autorización específica del usuario. Después de un despliegue autorizado, repetir los dos casos corregidos con Gemini real en la cuenta de prueba autorizada.

Este documento describe un paso futuro; no autoriza ni ejecuta el retiro, el merge o un despliegue. La exclusión aplicada al Draft no debe quedar como configuración temporal innecesaria en `main`.
