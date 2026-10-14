#!/usr/bin/env bash
# Estado del respaldo: sale con error si el ultimo respaldo COMPLETO tiene mas de 26 horas (o si el ultimo intento fallo).
# Uso: scripts/backup-status.sh   (sirve para un monitor o un cron que avise)
set -Eeuo pipefail
BACKUP_DIR="${BACKUP_DIR:-/home/claude/claude-docker/proyectos/Software/financiero-backups}"
MAX_HOURS="${MAX_HOURS:-26}"
OK_FILE="$BACKUP_DIR/ultimo-ok"
FAIL_FILE="$BACKUP_DIR/ultimo-fallo"

if [ ! -f "$OK_FILE" ]; then echo "FALLA: nunca hubo un respaldo completo"; exit 1; fi
last="$(cat "$OK_FILE")"
age=$(( ( $(date +%s) - $(date -d "$last" +%s) ) / 3600 ))
if [ "$age" -ge "$MAX_HOURS" ]; then echo "FALLA: el ultimo respaldo completo es de hace ${age} horas ($last)"; exit 1; fi
if [ -f "$FAIL_FILE" ]; then echo "AVISO: el ultimo intento fallo: $(cat "$FAIL_FILE"). El ultimo completo es de hace ${age} horas"; exit 1; fi
echo "OK: ultimo respaldo completo hace ${age} horas ($last)"
