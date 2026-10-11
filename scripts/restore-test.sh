#!/usr/bin/env bash
# Prueba de restauracion: restaura el ULTIMO respaldo en un postgres temporal y desechable
# y compara conteos contra la base viva. NO toca la base en uso (solo la lee).
# Uso:  scripts/restore-test.sh      Sale 0 si OK, distinto de 0 si FALLA.
set -Eeuo pipefail
umask 077

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/home/claude/claude-docker/proyectos/Software/financiero-backups}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-financiero-pruebas}"
IMAGE="postgres:18-alpine"
TABLES=(User Company Partner Invoice JournalEntry AuditLog)
TMPC="restore-test-$$-$(date +%s)"

mkdir -p "$BACKUP_DIR"
LOG="$BACKUP_DIR/restore-test.log"
log() { printf '%s [restore-test] %s\n' "$(date '+%F %T')" "$*" | tee -a "$LOG"; }
cleanup() { docker rm -f "$TMPC" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { log "FALLA: $1"; exit 1; }
trap 'fail "error inesperado (linea $LINENO)"' ERR

set -a; . "$PROJECT_DIR/.env.production"; set +a
PG_CID="$(cd "$PROJECT_DIR" && docker compose -p "$COMPOSE_PROJECT" -f docker-compose.prod.yml -f docker-compose.pruebas.yml --env-file .env.production ps -q postgres)"
[ -n "$PG_CID" ] || fail "no esta corriendo el postgres vivo"

DUMP="$(ls -1 "$BACKUP_DIR"/diarios/db-*.dump 2>/dev/null | sort | tail -1)"
[ -n "$DUMP" ] || fail "no hay respaldos en $BACKUP_DIR/diarios"
S="$(basename "$DUMP" .dump)"; S="${S#db-}"
ADJ="$BACKUP_DIR/diarios/adjuntos-$S.tar.gz"
log "probando respaldo $S ($(du -h "$DUMP" | cut -f1))"

# Integridad de archivos
( cd "$BACKUP_DIR/diarios" && sha256sum -c --quiet "sha256-$S.txt" ) || fail "checksum no coincide"
tar tzf "$ADJ" >/dev/null || fail "tar de adjuntos corrupto"

# Contenedor temporal: sin puertos publicados, clave aleatoria, sin volumen persistente
docker run -d --name "$TMPC" -e POSTGRES_USER=rt -e POSTGRES_PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -dc A-Za-z0-9)" \
  -e POSTGRES_DB=rt --tmpfs /var/lib/postgresql "$IMAGE" >/dev/null
for i in $(seq 1 60); do docker exec "$TMPC" pg_isready -U rt -d rt -h 127.0.0.1 >/dev/null 2>&1 && break; sleep 1; done
docker exec "$TMPC" pg_isready -U rt -d rt -h 127.0.0.1 >/dev/null || fail "el postgres temporal no arranco"

# --no-owner/--no-privileges: el rol original no existe en el temporal
docker exec -i "$TMPC" pg_restore -U rt -d rt --no-owner --no-privileges --exit-on-error < "$DUMP" \
  || fail "pg_restore fallo"
log "restauracion terminada, comparando conteos"

count() { # contenedor, usuario, db, tabla
  docker exec "$1" psql -U "$2" -d "$3" -Atc "select count(*) from \"$4\"" 
}
RESULT=0; NOTE=""
printf '%-14s %10s %10s  %s\n' TABLA RESTAURADA VIVA ESTADO | tee -a "$LOG"
for t in "${TABLES[@]}"; do
  r="$(count "$TMPC" rt rt "$t")"; v="$(count "$PG_CID" "$POSTGRES_USER" "$POSTGRES_DB" "$t")"
  if [ "$r" = "$v" ]; then st=OK
  elif [ "$r" -lt "$v" ]; then st="OK (la base viva tuvo $((v-r)) filas nuevas despues del respaldo)"; NOTE=1
  else st=FALLA; RESULT=1; fi
  printf '%-14s %10s %10s  %s\n' "$t" "$r" "$v" "$st" | tee -a "$LOG"
done

if [ "$RESULT" -eq 0 ]; then
  log "RESULTADO: OK${NOTE:+ (hubo actividad despues del respaldo; es normal si la usaron)}"
else
  log "RESULTADO: FALLA (la restauracion tiene mas filas que la base viva o no coincide)"
fi
log "contenedor temporal eliminado"
exit "$RESULT"
