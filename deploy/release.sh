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
# Descartar cambios locales (archivos generados como dist/) antes del pull
git checkout -- .
git pull --rebase

log "Backup de la base ANTES de migrar..."
# Snapshot antes de cualquier cambio de schema (rollback manual si algo sale mal).
if [ -x "$APP_DIR/deploy/backup.sh" ]; then
  bash "$APP_DIR/deploy/backup.sh" pre-release || { echo "✗ Backup falló — aborto el release"; exit 1; }
else
  echo "⚠ deploy/backup.sh no encontrado/ejecutable — se recomienda fuertemente tener backups antes de migrar"
fi

log "Backend: install + migrate + build..."
cd $APP_DIR/backend
npm install --legacy-peer-deps
npx prisma generate
# Migraciones versionadas y revisadas (NUNCA db push --accept-data-loss en prod):
# migrate deploy solo aplica migraciones pendientes del historial, sin cambios destructivos automáticos.
npx prisma migrate deploy
npm run build

log "Frontend: install + build..."
cd $APP_DIR/frontend
npm install --legacy-peer-deps
npm run build

log "Sync nginx config (si cambió)..."
if ! diff -q $APP_DIR/deploy/nginx-icemm.conf /etc/nginx/sites-available/icemm > /dev/null 2>&1; then
  cp $APP_DIR/deploy/nginx-icemm.conf /etc/nginx/sites-available/icemm
  nginx -t && systemctl reload nginx
  log "  Nginx recargado"
fi

log "Reiniciando PM2..."
pm2 restart icemm-api

sleep 2
if curl -s http://localhost:3001/health | grep -q '"ok":true'; then
  log "✓ Release exitoso — http://187.127.29.98"
else
  echo "✗ Backend no responde — pm2 logs icemm-api"
  exit 1
fi
