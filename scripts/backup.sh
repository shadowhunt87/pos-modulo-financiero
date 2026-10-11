#!/usr/bin/env bash
# Respaldo del ambiente de pruebas del modulo financiero (base de datos + adjuntos).
# Uso:  scripts/backup.sh        (lo corre cron a las 2:30 a.m.)
# Sale con codigo distinto de 0 si algo falla. Detalle completo: docs/OPERACION-BACKUPS.md
set -Eeuo pipefail
umask 077

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/home/claude/claude-docker/proyectos/Software/financiero-backups}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-financiero-pruebas}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
WEEKLY_DOW=7                      # domingo: ese respaldo tambien se guarda como semanal
HELPER_IMAGE="postgres:18-alpine" # ya existe en el servidor; solo se usa para empaquetar adjuntos

mkdir -p "$BACKUP_DIR/diarios" "$BACKUP_DIR/semanales"
chmod 700 "$BACKUP_DIR" "$BACKUP_DIR/diarios" "$BACKUP_DIR/semanales"
LOG="$BACKUP_DIR/backup.log"
log() { printf '%s [backup] %s\n' "$(date '+%F %T')" "$*" | tee -a "$LOG"; }

TMP=""
fail() { log "FALLA: $1 (linea ${2:-?})"; [ -n "$TMP" ] && rm -rf "$TMP"; exit 1; }
trap 'fail "error inesperado" "$LINENO"' ERR

# Un solo respaldo a la vez
exec 9>"$BACKUP_DIR/.lock"
flock -n 9 || { log "FALLA: ya hay otro respaldo corriendo"; exit 1; }

# Credenciales: solo se leen, nunca se imprimen
[ -f "$PROJECT_DIR/.env.production" ] || fail "no existe .env.production"
set -a; . "$PROJECT_DIR/.env.production"; set +a
: "${POSTGRES_USER:?}" "${POSTGRES_DB:?}"

PG_CID="$(cd "$PROJECT_DIR" && docker compose -p "$COMPOSE_PROJECT" -f docker-compose.prod.yml -f docker-compose.pruebas.yml --env-file .env.production ps -q postgres)"
[ -n "$PG_CID" ] || fail "el contenedor postgres no esta corriendo"
UPLOADS_VOL="${COMPOSE_PROJECT}_uploads"
docker volume inspect "$UPLOADS_VOL" >/dev/null || fail "no existe el volumen $UPLOADS_VOL"

STAMP="$(date +%Y%m%d-%H%M%S)"
TMP="$(mktemp -d "$BACKUP_DIR/.tmp.XXXXXX")"
DUMP="db-$STAMP.dump"
ADJ="adjuntos-$STAMP.tar.gz"
log "inicio $STAMP"

# 1) Base de datos (formato custom, comprimido)
docker exec "$PG_CID" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$TMP/$DUMP" \
  || fail "pg_dump fallo"
[ -s "$TMP/$DUMP" ] || fail "el dump quedo vacio"
NOBJ="$(docker exec -i "$PG_CID" pg_restore --list < "$TMP/$DUMP" | grep -vc '^;')" \
  || fail "pg_restore --list no pudo leer el dump (dump corrupto)"
[ "$NOBJ" -gt 0 ] || fail "el dump no contiene objetos"
log "dump verificado: $NOBJ objetos"

# 2) Adjuntos (volumen uploads, montado solo lectura)
docker run --rm -v "$UPLOADS_VOL":/data:ro "$HELPER_IMAGE" tar czf - -C /data . > "$TMP/$ADJ" \
  || fail "no se pudo empaquetar el volumen de adjuntos"
tar tzf "$TMP/$ADJ" >/dev/null || fail "el tar.gz de adjuntos esta corrupto"
log "adjuntos verificados"

# 3) Checksums y publicacion (solo si todo salio bien)
( cd "$TMP" && sha256sum "$DUMP" "$ADJ" > "sha256-$STAMP.txt" )
mv "$TMP/$DUMP" "$TMP/$ADJ" "$TMP/sha256-$STAMP.txt" "$BACKUP_DIR/diarios/"
rmdir "$TMP"; TMP=""
log "guardado: $DUMP ($(du -h "$BACKUP_DIR/diarios/$DUMP" | cut -f1)), $ADJ ($(du -h "$BACKUP_DIR/diarios/$ADJ" | cut -f1))"

# 4) Copia semanal (domingos)
if [ "$(date +%u)" = "$WEEKLY_DOW" ]; then
  cp -p "$BACKUP_DIR/diarios/"{"$DUMP","$ADJ","sha256-$STAMP.txt"} "$BACKUP_DIR/semanales/"
  log "copia semanal guardada"
fi

# 5) Retencion: 14 diarios y 8 semanales (por conjunto de fecha)
prune() { # carpeta, cuantos conservar
  local dir="$1" keep="$2" old
  old="$(ls -1 "$dir"/db-*.dump 2>/dev/null | sort -r | tail -n +"$((keep+1))")" || true
  for f in $old; do
    s="$(basename "$f" .dump)"; s="${s#db-}"
    rm -f "$dir/db-$s.dump" "$dir/adjuntos-$s.tar.gz" "$dir/sha256-$s.txt"
    log "retencion: borrado conjunto $s de $(basename "$dir")"
  done
}
prune "$BACKUP_DIR/diarios" "$KEEP_DAILY"
prune "$BACKUP_DIR/semanales" "$KEEP_WEEKLY"

# 6) Gancho opcional para copia FUERA del servidor (pendiente de elegir destino)
[ -f "$BACKUP_DIR/offsite.env" ] && . "$BACKUP_DIR/offsite.env"
if [ -n "${OFFSITE_CMD:-}" ]; then
  log "copia externa: ejecutando OFFSITE_CMD"
  export BACKUP_DIR BACKUP_DB="$BACKUP_DIR/diarios/$DUMP" BACKUP_ADJUNTOS="$BACKUP_DIR/diarios/$ADJ" BACKUP_SHA="$BACKUP_DIR/diarios/sha256-$STAMP.txt"
  bash -c "$OFFSITE_CMD" >>"$LOG" 2>&1 || fail "OFFSITE_CMD fallo (el respaldo local SI quedo guardado)"
  log "copia externa OK"
else
  log "AVISO: sin copia externa configurada (OFFSITE_CMD vacio): los respaldos viven solo en este servidor"
fi
log "fin OK"
