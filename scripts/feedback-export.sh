#!/usr/bin/env bash
# Exporta a CSV los comentarios ("Feedback") del ambiente de pruebas del modulo financiero.
# Solo lectura (transaccion READ ONLY). No imprime credenciales.
# Uso:  scripts/feedback-export.sh [--desde AAAA-MM-DD] [--estado NEW|...]
#   sin opciones exporta todos los comentarios de todas las empresas.
# Salida: $FEEDBACK_DIR/feedback-AAAAMMDD-HHMMSS.csv  (carpeta con permisos 700, archivo 600)
# Detalle: docs/OPERACION.md
set -Eeuo pipefail
umask 077

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FEEDBACK_DIR="${FEEDBACK_DIR:-/home/claude/claude-docker/proyectos/Software/financiero-backups/feedback}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-financiero-pruebas}"

DESDE=""; ESTADO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --desde)  DESDE="${2:-}"; shift 2 ;;
    --estado) ESTADO="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "FALLA: opcion desconocida '$1' (use --help)" >&2; exit 2 ;;
  esac
done
# Los filtros se validan estrictamente porque van dentro del SQL
[[ -z "$DESDE"  || "$DESDE"  =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "FALLA: --desde debe ser AAAA-MM-DD" >&2; exit 2; }
[[ -z "$ESTADO" || "$ESTADO" =~ ^[A-Z_]+$ ]] || { echo "FALLA: --estado solo acepta MAYUSCULAS (ej. NEW)" >&2; exit 2; }

[ -f "$PROJECT_DIR/.env.production" ] || { echo "FALLA: no existe .env.production" >&2; exit 1; }
dc() { (cd "$PROJECT_DIR" && docker compose -p "$COMPOSE_PROJECT" -f docker-compose.prod.yml -f docker-compose.pruebas.yml --env-file .env.production "$@"); }
# psql corre DENTRO del contenedor y toma usuario/base de sus propias variables: nada de claves en el host
psql_in() { dc exec -T postgres sh -c 'exec psql -X -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA "$@"' sh "$@"; }

[ -n "$(dc ps -q postgres 2>/dev/null)" ] || { echo "FALLA: el contenedor postgres de '$COMPOSE_PROJECT' no esta corriendo" >&2; exit 1; }

EXISTE="$(psql_in -c "SELECT to_regclass('public.\"Feedback\"') IS NOT NULL")"
if [ "$EXISTE" != "t" ]; then
  echo "FALLA: la tabla \"Feedback\" no existe en la base de $COMPOSE_PROJECT." >&2
  echo "       La migracion de comentarios (prisma/migrations/*_feedback) aun no se ha desplegado." >&2
  echo "       No hay nada que exportar. No se creo ningun archivo." >&2
  exit 3
fi

WHERE="TRUE"
[ -n "$DESDE" ]  && WHERE="$WHERE AND f.\"createdAt\" >= '$DESDE'"
[ -n "$ESTADO" ] && WHERE="$WHERE AND f.status::text = '$ESTADO'"

# Texto libre: se antepone ' si empieza con = + - @ (evita que Excel lo trate como formula)
SAFE() { printf "CASE WHEN %s ~ '^[=+@-]' THEN '''' || %s ELSE %s END" "$1" "$1" "$1"; }

TASKREF='f."taskRef"'
SQL="COPY (
  SELECT to_char(f.\"createdAt\" AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS fecha,
         $(SAFE 'c.name')  AS empresa,
         $(SAFE 'u.name')  AS usuario,
         u.role::text      AS rol_actual,
         f.kind::text      AS tipo,
         $(SAFE 'f.route') AS ruta,
         $(SAFE 'f.message') AS mensaje,
         f.status::text    AS estado,
         $(SAFE 'f.response') AS respuesta,
         $(SAFE "$TASKREF") AS \"taskRef\"
    FROM \"Feedback\" f
    LEFT JOIN \"Company\" c ON c.id = f.\"companyId\"
    LEFT JOIN \"User\" u    ON u.id = f.\"userId\"
   WHERE $WHERE
   ORDER BY f.\"createdAt\"
) TO STDOUT WITH (FORMAT csv, HEADER true)"

mkdir -p "$FEEDBACK_DIR"; chmod 700 "$FEEDBACK_DIR"
OUT="$FEEDBACK_DIR/feedback-$(date +%Y%m%d-%H%M%S).csv"
TMP="$OUT.tmp"; trap 'rm -f "$TMP"' EXIT

# Transaccion de solo lectura; psql lee el SQL por stdin
printf 'BEGIN READ ONLY;\n%s;\nCOMMIT;\n' "$SQL" | dc exec -T postgres sh -c 'exec psql -X -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$TMP"
mv "$TMP" "$OUT"; chmod 600 "$OUT"

# Cada fila empieza con la fecha ISO (un mensaje puede ocupar varias lineas)
FILAS="$(grep -cE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' "$OUT" || true)"
echo "OK: $FILAS comentario(s) exportados a $OUT"
