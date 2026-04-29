#!/usr/bin/env bash
# Pull desde GitHub + rebuild + restart.
# Uso (en el VPS):
#   cd /var/www/icemm/deploy && bash release.sh
#
# Asume que el repo está en /var/www/icemm con remote configurado.

set -euo pipefail

GREEN='\033[0;32m'; NC='\033[0m'
log() { echo -e "${GREEN}▸${NC} $1"; }

APP_DIR=/var/www/icemm

log "Pull desde GitHub..."
cd $APP_DIR
git pull --rebase

log "Backend: install + migrate + build..."
cd $APP_DIR/backend
npm install --legacy-peer-deps
npx prisma generate
npx prisma migrate deploy
npm run build

log "Frontend: install + build..."
cd $APP_DIR/frontend
npm install --legacy-peer-deps
npm run build

log "Reiniciando PM2..."
pm2 restart icemm-api

sleep 2
if curl -s http://localhost:3001/health | grep -q '"ok":true'; then
  log "✓ Release exitoso — http://187.127.29.98"
else
  echo "✗ Backend no responde — pm2 logs icemm-api"
  exit 1
fi
