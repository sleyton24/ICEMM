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
# ⚠ Este `git checkout -- .` descarta TODO cambio local sin commitear.
#
# Es lo correcto para lo que genera el build (dist/), pero es incompatible con
# deploy/push.sh: si alguien sube código por rsync y después corre este script,
# los archivos MODIFICADOS vuelven al último commit mientras los NUEVOS quedan,
# y el resultado es un árbol mezclado que compila pero no es ninguna versión.
#
# El camino soportado es commit → push a GitHub → este script. push.sh es para
# el primer deploy, antes de que el repo del servidor tenga remote.
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

log "Chequeo de nginx (sin tocar nada)..."
# Un release NO pisa la configuración del edge.
#
# Antes esto copiaba deploy/nginx-icemm.conf sobre /etc/nginx/sites-available/icemm
# cuando diferían. Eso es una bomba: el archivo del repo es todavía la plantilla
# (server_name icemm.tudominio.com, certificados en una ruta que no existe) y el
# servidor sirve la app desde icemm-nipio.conf, con su propio certificado y con la
# IP cruda cerrada a propósito (return 444, Fase B). Copiar la plantilla dejaba un
# archivo inválido en disco: `nginx -t` fallaba, el reload no ocurría —así que el
# sitio seguía en pie— pero el siguiente reload por cualquier motivo (la renovación
# automática de certbot, un reboot) se encontraba con una config que no levanta.
#
# El edge cambia a mano y con intención. Acá solo se avisa si no coincide.
if ! diff -q $APP_DIR/deploy/nginx-icemm.conf /etc/nginx/sites-available/icemm > /dev/null 2>&1; then
  echo "  ⓘ deploy/nginx-icemm.conf difiere de /etc/nginx/sites-available/icemm."
  echo "    Es lo esperado mientras la config real viva solo en el servidor."
  echo "    Si cambiaste el edge a propósito, versionalo:"
  echo "      cp /etc/nginx/sites-available/icemm{,-nipio.conf} $APP_DIR/deploy/ && git -C $APP_DIR add deploy/"
fi
nginx -t > /dev/null 2>&1 || echo "  ⚠ nginx -t FALLA — la config en disco no levantaría en el próximo reload."

log "Reiniciando PM2..."
pm2 restart icemm-api

sleep 2
if curl -s http://localhost:3001/health | grep -q '"ok":true'; then
  # La IP cruda no responde a propósito (return 444, Fase B): la app vive en el
  # host nip.io, que es el que tiene certificado.
  log "✓ Release exitoso — https://icemm.187.127.29.98.nip.io/"
else
  echo "✗ Backend no responde — pm2 logs icemm-api"
  exit 1
fi
