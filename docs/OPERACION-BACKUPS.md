# Operación de respaldos (ambiente de pruebas del módulo financiero)

Cumple el principio P10 de `docs/GUIA-PRODUCTO.md` ("respaldos automáticos probados").

## Regla de oro

**No se cargan datos reales hasta tener, los tres a la vez:**
1. **Respaldos automáticos probados** (restauración ensayada; este documento).
2. **2FA** (autenticación en dos pasos) disponible para todos.
3. **Exportación completa** de los datos del cliente.

Hoy solo está el punto 1, y a medias: falta la copia fuera del servidor (ver más abajo). Mientras tanto, solo datos ficticios.

## Qué se respalda y dónde queda

| Qué | Cómo | Archivo |
|---|---|---|
| Base de datos (Postgres) | `pg_dump` formato custom | `db-AAAAMMDD-HHMMSS.dump` |
| Adjuntos (volumen `uploads`) | tar.gz | `adjuntos-AAAAMMDD-HHMMSS.tar.gz` |
| Control de integridad | sha256 | `sha256-AAAAMMDD-HHMMSS.txt` |

Carpeta (fuera del repo, permisos 700, nunca se sube a git):
`/home/claude/claude-docker/proyectos/Software/financiero-backups/`
- `diarios/`: los últimos 14.
- `semanales/`: los últimos 8 (el respaldo de cada domingo).
- `backup.log` y `restore-test.log`: el historial.

Programación (cron del usuario `claude`, hora del servidor):
- Todos los días 2:30 a.m.: `scripts/backup.sh`
- Domingos 4:00 a.m.: `scripts/restore-test.sh`

Además, el respaldo general de `claude-docker` de las 3:00 a.m. incluye esta carpeta, pero sigue siendo el mismo servidor.

## Para Claude

- Respaldar ahora: `cd /home/claude/claude-docker/proyectos/Software/financial-backend && scripts/backup.sh` (código 0 = bien).
- Probar restauración: `scripts/restore-test.sh`. Levanta un Postgres temporal, restaura el último respaldo, compara filas de User, Company, Partner, Invoice, JournalEntry y AuditLog contra la base viva, imprime OK o FALLA y borra el temporal. No toca la base en uso.
- Revisar salud: `tail -20 .../financiero-backups/backup.log` y `restore-test.log`; buscar "FALLA". Como cron manda la salida a /dev/null, **los logs son la única señal**: revisarlos a diario mientras no haya alertas.
- Restaurar de verdad (emergencia), solo con aprobación de Carlos y tras un respaldo nuevo del estado actual:
  1. `docker compose -p financiero-pruebas -f docker-compose.prod.yml -f docker-compose.pruebas.yml --env-file .env.production stop api web`
  2. Recrear la base vacía: `docker exec financiero-pruebas-postgres-1 psql -U <usuario> -d postgres -c 'DROP DATABASE <db>' -c 'CREATE DATABASE <db>'` (usuario y db están en `.env.production`; no imprimirlo).
  3. `docker exec -i financiero-pruebas-postgres-1 pg_restore -U <usuario> -d <db> --no-owner --exit-on-error < diarios/db-FECHA.dump`
  4. Adjuntos: `docker run --rm -i -v financiero-pruebas_uploads:/data postgres:18-alpine sh -c 'cd /data && tar xzf -' < diarios/adjuntos-FECHA.tar.gz`
  5. Levantar de nuevo: mismo comando de compose con `up -d` y confirmar que la app responde.

## Para Carlos (si Claude no está disponible)

No hace falta saber programar, pero sí entrar al servidor por terminal (la pantalla negra donde se escriben comandos).

**Comprobar que los respaldos se están haciendo**
1. Conéctese al servidor por SSH como el usuario `claude`.
2. Escriba y pulse Enter: `ls -lh /home/claude/claude-docker/proyectos/Software/financiero-backups/diarios`
3. Debe ver archivos con fecha de hoy o de ayer. Si el último es más viejo, algo falló.
4. Para leer el historial: `tail -20 /home/claude/claude-docker/proyectos/Software/financiero-backups/backup.log`. Busque la palabra FALLA.

**Probar que un respaldo sirve (no daña nada)**
1. `cd /home/claude/claude-docker/proyectos/Software/financial-backend`
2. `scripts/restore-test.sh`
3. Espere unos segundos. Al final debe decir `RESULTADO: OK`. Si dice FALLA, avise a Claude.

**Si hay que recuperar los datos de verdad**: no lo haga solo la primera vez; pida a Claude los pasos de "Restaurar de verdad" arriba. Lo que sí puede hacer siempre es **copiar los archivos de `diarios/` a su computadora** (con `scp` o su programa de archivos por SFTP): con ese `.dump` y el `.tar.gz` se puede reconstruir todo en cualquier servidor.

## Copia FUERA del servidor (pendiente de decisión de Carlos)

Hoy, si el servidor se pierde, se pierden también los respaldos. Está el gancho listo; solo falta elegir destino. Para activarlo se crea el archivo `financiero-backups/offsite.env` (fuera del repo) con una línea `OFFSITE_CMD='...'`. El comando recibe las variables `BACKUP_DB`, `BACKUP_ADJUNTOS`, `BACKUP_SHA` (rutas del respaldo recién hecho). Si el comando falla, el script sale con error.

Opciones (costos aproximados, verificar precios vigentes):

| Opción | Costo aprox. | Notas | Ejemplo de `OFFSITE_CMD` |
|---|---|---|---|
| Backblaze B2 (almacenamiento de objetos) | ~US$6/TB/mes; los primeros 10 GB gratis. Para este proyecto, centavos | Barato, con `rclone`; conviene cifrar antes de subir | `rclone copy "$BACKUP_DB" b2:bucket/financiero/ && rclone copy "$BACKUP_ADJUNTOS" b2:bucket/financiero/` |
| Segundo almacenamiento en otro proveedor (Hetzner Storage Box 1 TB) | ~€4 a 5/mes | Se usa por SFTP/rsync, otro proveedor distinto de Contabo | `rsync -a "$BACKUP_DB" "$BACKUP_ADJUNTOS" usuario@host:financiero/` |
| Copia a la computadora o disco de Carlos (rsync/SFTP manual o programado) | US$0 | Depende de que su equipo esté encendido; sirve de arranque | desde su equipo: `rsync -a claude@servidor:.../financiero-backups/ ./respaldos/` |

Recomendación: Backblaze B2 con cifrado (`rclone crypt`), por precio y por estar en otro proveedor. Datos reales exigirán esto además de 2FA y exportación completa.

## Cómo está construido (resumen técnico)

- `scripts/backup.sh` verifica cada dump con `pg_restore --list`, el tar con `tar tzf`, escribe checksums, publica solo si todo salió bien (si falla, no deja archivos a medias) y aplica la retención. Usa un candado para que no corran dos a la vez.
- `scripts/restore-test.sh` usa `postgres:18-alpine` con base en memoria, sin puertos publicados, y lo borra siempre (también si falla). Si la base viva tiene más filas que el respaldo (la usaron después), lo reporta como OK con aviso; si la restauración tiene MÁS filas que la viva, es FALLA.
- Variables: `BACKUP_DIR`, `KEEP_DAILY` (14), `KEEP_WEEKLY` (8), `COMPOSE_PROJECT`.
