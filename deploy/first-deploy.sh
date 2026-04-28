#!/usr/bin/env bash
# Bootstrap del VPS para ICEMM.
# Correr UNA VEZ como usuario con sudo, en Ubuntu 24.04.
# Asume que el código ya fue subido a /var/www/icemm/ (vía rsync — ver push.sh)
#
# Uso:
#   ssh root@187.127.29.98
#   cd /var/www/icemm/deploy
#   bash first-deploy.sh

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log() { echo -e "${GREEN}▸${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
err() { echo -e "${RED}✗${NC} $1" >&2; }

DB_NAME=icemm
DB_USER=icemm
APP_DIR=/var/www/icemm
LOG_DIR=/var/log/icemm

if [[ $EUID -ne 0 ]]; then
  err "Correr con sudo o como root."
  exit 1
fi

# ── 1. Sistema ──────────────────────────────────────────────────────────────
log "Actualizando paquetes..."
apt update -qq

log "Instalando Node 20, Nginx, PostgreSQL, herramientas..."
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi
apt install -y nginx postgresql postgresql-contrib rsync curl ufw

if ! command -v pm2 &> /dev/null; then
  npm install -g pm2
  pm2 install pm2-logrotate
  pm2 set pm2-logrotate:max_size 10M
  pm2 set pm2-logrotate:retain 14
fi

# ── 2. PostgreSQL ───────────────────────────────────────────────────────────
log "Configurando PostgreSQL..."
DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'")
if [[ "$DB_EXISTS" == "1" ]]; then
  warn "DB '${DB_NAME}' ya existe — saltando creación."
else
  read -p "Password para usuario PostgreSQL '${DB_USER}': " -s DB_PASS
  echo
  sudo -u postgres psql <<EOF
CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
EOF
  log "DB y usuario creados."
  echo "${DB_PASS}" > /tmp/icemm-dbpass
  chmod 600 /tmp/icemm-dbpass
  warn "Password guardado temporalmente en /tmp/icemm-dbpass para configurar .env. ELIMINAR DESPUÉS."
fi

# ── 3. Directorios ──────────────────────────────────────────────────────────
log "Creando directorios..."
mkdir -p $APP_DIR $LOG_DIR
chown -R $SUDO_USER:$SUDO_USER $APP_DIR $LOG_DIR 2>/dev/null || true

# ── 4. .env del backend ─────────────────────────────────────────────────────
if [[ ! -f $APP_DIR/backend/.env ]]; then
  log "Generando $APP_DIR/backend/.env..."
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  DB_PASS_VAL=$(cat /tmp/icemm-dbpass 2>/dev/null || echo "REEMPLAZAR_PASSWORD")
  cat > $APP_DIR/backend/.env <<EOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS_VAL}@localhost:5432/${DB_NAME}?schema=public
PORT=3001
CORS_ORIGIN=*
BETA_MODE=true
JWT_SECRET=${JWT_SECRET}
NODE_ENV=production
EOF
  log ".env creado con BETA_MODE=true (gerencia entra sin login)."
else
  warn "$APP_DIR/backend/.env ya existe — no se sobrescribe."
fi

# ── 5. Backend: instalar, migrar, seed, build ───────────────────────────────
log "Instalando backend..."
cd $APP_DIR/backend
sudo -u $SUDO_USER npm install
sudo -u $SUDO_USER npx prisma generate
sudo -u $SUDO_USER npx prisma migrate deploy
sudo -u $SUDO_USER npm run seed:plan || warn "Seed plan falló (revisar)"
sudo -u $SUDO_USER npm run build

# ── 6. Frontend: build ──────────────────────────────────────────────────────
log "Construyendo frontend..."
cd $APP_DIR/frontend
sudo -u $SUDO_USER npm install
sudo -u $SUDO_USER npm run build

# ── 7. PM2 ──────────────────────────────────────────────────────────────────
log "Arrancando backend con PM2..."
sudo -u $SUDO_USER pm2 start $APP_DIR/deploy/ecosystem.config.cjs
sudo -u $SUDO_USER pm2 save
# Auto-start en boot
PM2_STARTUP_CMD=$(sudo -u $SUDO_USER pm2 startup systemd -u $SUDO_USER --hp /home/$SUDO_USER | tail -1)
eval "$PM2_STARTUP_CMD" 2>/dev/null || warn "Configurar pm2 startup manualmente si falla"

# ── 8. Nginx ────────────────────────────────────────────────────────────────
log "Configurando Nginx..."
cp $APP_DIR/deploy/nginx-icemm.conf /etc/nginx/sites-available/icemm
ln -sf /etc/nginx/sites-available/icemm /etc/nginx/sites-enabled/icemm
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# ── 9. Firewall ─────────────────────────────────────────────────────────────
log "Configurando firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# ── 10. Verificación ────────────────────────────────────────────────────────
sleep 2
log "Verificando health..."
if curl -s http://localhost:3001/health | grep -q '"ok":true'; then
  log "✓ Backend OK"
else
  err "Backend health falló. Ver: pm2 logs icemm-api"
  exit 1
fi

echo
log "════════════════════════════════════════════════════════"
log "  ICEMM desplegado en http://187.127.29.98"
log "  Modo BETA activo (sin login)."
log "  Logs: pm2 logs icemm-api"
log "════════════════════════════════════════════════════════"
warn "ELIMINAR /tmp/icemm-dbpass cuando confirmes que .env quedó bien:"
warn "  sudo rm /tmp/icemm-dbpass"
