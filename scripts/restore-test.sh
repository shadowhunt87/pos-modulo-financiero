#!/usr/bin/env bash
# Prueba de restauracion: restaura el ULTIMO respaldo en un postgres temporal y desechable
# y compara conteos contra la base viva. NO toca la base en uso (solo la lee).
# Uso:  scripts/restore-test.sh                     el ultimo respaldo local
#       scripts/restore-test.sh --desde <carpeta>   una copia EXTERNA ya descargada (cifrada)
# Sale 0 si OK, distinto de 0 si FALLA. Verifica conteos, balanza por empresa y que un adjunto abra.
set -Eeuo pipefail
umask 077

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/home/claude/claude-docker/proyectos/Software/financiero-backups}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-financiero-pruebas}"
IMAGE="postgres:18-alpine"
TABLES=(User Company Partner Invoice JournalEntry AuditLog)
TMPC="restore-test-$$-$(date +%s)"
SRC_DIR=""
[ "${1:-}" = "--desde" ] && SRC_DIR="${2:?indica la carpeta despues de --desde}"
PASSPHRASE_FILE="${BACKUP_PASSPHRASE_FILE:-$BACKUP_DIR/.frase-respaldos}"
WORK="$(mktemp -d)"

mkdir -p "$BACKUP_DIR"
LOG="$BACKUP_DIR/restore-test.log"
log() { printf '%s [restore-test] %s\n' "$(date '+%F %T')" "$*" | tee -a "$LOG"; }
cleanup() { docker rm -f "$TMPC" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
fail() { log "FALLA: $1"; exit 1; }
trap 'fail "error inesperado (linea $LINENO)"' ERR

set -a; . "$PROJECT_DIR/.env.production"; set +a
PG_CID="$(cd "$PROJECT_DIR" && docker compose -p "$COMPOSE_PROJECT" -f docker-compose.prod.yml -f docker-compose.pruebas.yml --env-file .env.production ps -q postgres)"
[ -n "$PG_CID" ] || fail "no esta corriendo el postgres vivo"

DIR="${SRC_DIR:-$BACKUP_DIR/diarios}"
SUMS="$(ls -1 "$DIR"/sha256-*.txt 2>/dev/null | sort | tail -1)"
[ -n "$SUMS" ] || fail "no hay respaldos en $DIR"
S="$(basename "$SUMS" .txt)"; S="${S#sha256-}"
log "probando respaldo $S desde $DIR"

# Integridad de archivos (las huellas son de lo que se guardo: cifrado o no)
( cd "$DIR" && sha256sum -c --quiet "sha256-$S.txt" ) || fail "checksum no coincide (archivo danado o incompleto)"

# Descifrado (si son .gpg): sin la frase, FALLA
DUMP="$DIR/db-$S.dump"; ADJ="$DIR/adjuntos-$S.tar.gz"
if [ -f "$DIR/db-$S.dump.gpg" ]; then
  [ -f "$PASSPHRASE_FILE" ] || fail "el respaldo esta cifrado y no se encuentra la frase ($PASSPHRASE_FILE)"
  for f in "db-$S.dump" "adjuntos-$S.tar.gz"; do
    gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$PASSPHRASE_FILE" -o "$WORK/$f" -d "$DIR/$f.gpg" \
      || fail "no se pudo descifrar $f (frase equivocada o archivo danado)"
  done
  DUMP="$WORK/db-$S.dump"; ADJ="$WORK/adjuntos-$S.tar.gz"
  log "descifrado OK"
fi
tar tzf "$ADJ" >/dev/null || fail "tar de adjuntos corrupto"

# Un adjunto abre: se extrae el primero que tenga contenido
FIRST="$(tar tzf "$ADJ" | grep -v '/$' | head -1 || true)"
if [ -n "$FIRST" ]; then
  tar xzf "$ADJ" -C "$WORK" "$FIRST" && [ -s "$WORK/$FIRST" ] || fail "el adjunto $FIRST no se pudo abrir"
  log "adjunto de prueba abierto: $(du -h "$WORK/$FIRST" | cut -f1)"
else
  log "AVISO: el respaldo no tiene adjuntos"
fi

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

# Balanza: en la base restaurada, debitos = creditos de lo contabilizado en cada empresa
UNBAL="$(docker exec "$TMPC" psql -U rt -d rt -Atc "select count(*) from (select e.\"companyId\" from \"JournalEntryLine\" l join \"JournalEntry\" e on e.id = l.\"journalEntryId\" where e.status = 'POSTED' group by e.\"companyId\" having sum(l.debit) <> sum(l.credit)) x")"
if [ "$UNBAL" = "0" ]; then log "balanza: cuadra en todas las empresas"; else log "balanza: NO cuadra en $UNBAL empresa(s)"; RESULT=1; fi

if [ "$RESULT" -eq 0 ]; then
  log "RESULTADO: OK${NOTE:+ (hubo actividad despues del respaldo; es normal si la usaron)}"
else
  log "RESULTADO: FALLA (la restauracion tiene mas filas que la base viva o no coincide)"
fi
log "contenedor temporal eliminado"
exit "$RESULT"
