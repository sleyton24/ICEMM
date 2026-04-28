#!/usr/bin/env bash
# Reconstruye y reinicia la app después de un push de código nuevo.
# Asume que ya hiciste rsync con push.sh desde local.
#
# Uso (en el VPS):
#   cd /var/www/icemm/deploy
#   bash release.sh

set -euo pipefail

GREEN='\033[0;32m'; NC='\033[0m'
log() { echo -e "${GREEN}▸${NC} $1"; }

APP_DIR=/var/www/icemm

log "Backend: install + migrate + build..."
cd $APP_DIR/backend
npm install --omit=dev=false
npx prisma generate
npx prisma migrate deploy
npm run build

log "Frontend: install + build..."
cd $APP_DIR/frontend
npm install
npm run build

log "Reiniciando PM2..."
pm2 restart icemm-api

sleep 2
if curl -s http://localhost:3001/health | grep -q '"ok":true'; then
  log "✓ Release exitoso"
else
  echo "✗ Backend no responde — pm2 logs icemm-api"
  exit 1
fi
