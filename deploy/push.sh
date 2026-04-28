#!/usr/bin/env bash
# Sube el código local al VPS via rsync.
# Excluye node_modules, dist, .env (esos viven en el server).
#
# Uso (en local):
#   bash deploy/push.sh
#
# Requiere: rsync, ssh con clave (recomendado) hacia 187.127.29.98

set -euo pipefail

VPS_HOST="${VPS_HOST:-root@187.127.29.98}"   # ajustar si tu user no es root
APP_DIR_REMOTE=/var/www/icemm
APP_DIR_LOCAL=$(cd "$(dirname "$0")/.." && pwd)

GREEN='\033[0;32m'; NC='\033[0m'
log() { echo -e "${GREEN}▸${NC} $1"; }

log "Sincronizando con $VPS_HOST..."

rsync -avz --delete \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '*.log' \
  --exclude '.git/' \
  --exclude '.vscode/' \
  --exclude 'frontend/.env.development' \
  "$APP_DIR_LOCAL/" "$VPS_HOST:$APP_DIR_REMOTE/"

log "✓ Sync completo. Ahora en el VPS:"
echo "  ssh $VPS_HOST"
echo "  cd $APP_DIR_REMOTE/deploy"
echo "  bash release.sh"
