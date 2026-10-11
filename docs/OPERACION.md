# Operación del módulo financiero

Para respaldos y restauración vea `docs/OPERACION-BACKUPS.md`. Este archivo cubre tareas periódicas.

## Exportar los comentarios de las contadoras (cada semana o al cerrar cada fase)

Las contadoras envían comentarios desde la pantalla de Ayuda. Se guardan en la tabla `Feedback` del ambiente de pruebas (finanzas.biodesch.com). Este guion los saca a un archivo CSV para hacer el triaje y convertirlos en tareas (docs/PLAN-v0.2.md, 10.3). Es de solo lectura: no cambia nada en la base.

**Paso a paso**
1. Abra una terminal en el servidor (la misma que usa para los respaldos).
2. Escriba y pulse Enter: `cd /home/claude/claude-docker/proyectos/Software/financial-backend`
3. Escriba y pulse Enter: `scripts/feedback-export.sh`
4. Al final debe decir `OK: N comentario(s) exportados a ...csv`. Ese archivo queda en `/home/claude/claude-docker/proyectos/Software/financiero-backups/feedback/` (carpeta privada, solo el usuario `claude` puede leerla).
5. Para ver los archivos: `ls -lh /home/claude/claude-docker/proyectos/Software/financiero-backups/feedback`
6. Abra el CSV con su programa de hojas de cálculo (Excel, LibreOffice) o cópielo a su computadora por SFTP.

**Opciones** (todas opcionales)
- Solo los nuevos desde una fecha: `scripts/feedback-export.sh --desde 2026-10-17`
- Solo un estado: `scripts/feedback-export.sh --estado NEW`
- Otra carpeta de salida: `FEEDBACK_DIR=/ruta scripts/feedback-export.sh`

**Columnas**: fecha (UTC), empresa, usuario, rol_actual (el rol que tiene hoy, no el de cuando escribió; vacío si el usuario ya no existe), tipo (CONFUSING = no entendí, BROKEN = algo no funciona, IDEA), ruta (pantalla), mensaje, estado, respuesta, taskRef (número de la tarea).

**Si dice `FALLA: la tabla "Feedback" no existe`**: la actualización de la base que incluye los comentarios todavía no se ha desplegado. No es un error del guion; avise a Claude. No se crea ningún archivo en ese caso.

**Notas de seguridad**
- Los comentarios son texto escrito por usuarios; el guion antepone una comilla a los textos que empiezan con `=`, `+`, `-` o `@` para que la hoja de cálculo no los ejecute como fórmula.
- Los CSV contienen nombres y comentarios de las contadoras: no los suba a sitios públicos ni al repositorio.
- El guion no imprime claves: usuario y base se toman de dentro del contenedor.

## Manual de ayuda (nginx)

Los archivos de `/manual/` (ayuda.json, .md e imágenes) se sirven con `Cache-Control: no-cache`: el navegador revalida en cada uso y los cambios del documentador se ven al recargar, sin esperar. El resto de estáticos (js, css, png...) sigue con caché de 1 año; la excepción `location ^~ /manual/` en `frontend/deploy/nginx.conf` es la que hace que el manual no caiga en esa regla.
