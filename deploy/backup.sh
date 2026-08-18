#!/usr/bin/env bash
# Backup de PostgreSQL para ICEMM.
#
# Uso:
#   bash deploy/backup.sh            # backup "daily"
#   bash deploy/backup.sh pre-release # backup etiquetado (lo invoca release.sh)
#
# Cron diario (crontab -e como el usuario del deploy):
#   15 3 * * *  /var/www/icemm/deploy/backup.sh daily >> /var/log/icemm/backup.log 2>&1
#
# Variables opcionales:
#   ICEMM_BACKUP_DIR              (default /var/backups/icemm)
#   ICEMM_BACKUP_RETENTION_DAYS   (default 14)
#
# Toma DATABASE_URL del .env del backend. pg_dump debe estar instalado
# (paquete postgresql-client) y la versión debe ser >= a la del server.

set -euo pipefail

APP_DIR=/var/www/icemm
BACKUP_DIR="${ICEMM_BACKUP_DIR:-/var/backups/icemm}"
RETENTION_DAYS="${ICEMM_BACKUP_RETENTION_DAYS:-14}"
LABEL="${1:-daily}"

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
log() { echo -e "${GREEN}▸${NC} $1"; }
err() { echo -e "${RED}✗${NC} $1" >&2; }

ENV_FILE="$APP_DIR/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
  err "No existe $ENV_FILE — no puedo leer DATABASE_URL"
  exit 1
fi

# Extraer DATABASE_URL (toma todo lo que sigue al primer '=', quita comillas)
DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
if [ -z "${DATABASE_URL:-}" ]; then
  err "DATABASE_URL no encontrado en $ENV_FILE"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TS=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/icemm_${LABEL}_${TS}.sql.gz"

log "pg_dump → $OUT"
# --no-owner / --no-privileges hacen el dump restaurable en cualquier rol.
pg_dump "$DATABASE_URL" --no-owner --no-privileges | gzip -9 > "$OUT"

# Validación: el dump no puede estar vacío (pg_dump puede fallar silencioso en un pipe).
if [ ! -s "$OUT" ]; then
  err "Backup vacío — lo elimino. Revisar conexión/permisos."
  rm -f "$OUT"
  exit 1
fi

SIZE=$(du -h "$OUT" | cut -f1)
log "Backup OK ($SIZE)"

# Retención: borrar backups más viejos que RETENTION_DAYS.
find "$BACKUP_DIR" -name 'icemm_*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -delete
log "Retención aplicada (>${RETENTION_DAYS} días eliminados)"

# Restauración (referencia):
#   gunzip -c icemm_daily_XXXX.sql.gz | psql "$DATABASE_URL"
