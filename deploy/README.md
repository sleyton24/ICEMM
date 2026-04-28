# Deploy ICEMM en VPS Hostinger

**Servidor:** `187.127.29.98` · Ubuntu 24.04 LTS · deploy manual via rsync

App final accesible en: **http://187.127.29.98**

---

## Primer deploy (una sola vez)

### En tu máquina local (Windows/Mac/Linux con Git Bash o WSL)

```bash
cd "ICEMM"

# Asegurate de que tu clave SSH esté configurada para entrar a 187.127.29.98 sin password.
# Si no, podés agregar tu clave pública con:
#   ssh-copy-id root@187.127.29.98
# o pegar manualmente en /root/.ssh/authorized_keys del VPS.

# Subir todo el código al VPS (excluye node_modules, dist, .env)
bash deploy/push.sh
```

### En el VPS

```bash
ssh root@187.127.29.98

cd /var/www/icemm/deploy
chmod +x first-deploy.sh release.sh
bash first-deploy.sh
```

El script `first-deploy.sh` hace todo automáticamente:
1. Instala Node 20, Nginx, PostgreSQL, PM2, ufw
2. Crea DB `icemm` y usuario (te pedirá un password)
3. Genera `/var/www/icemm/backend/.env` con `BETA_MODE=true` y `JWT_SECRET` aleatorio
4. Instala dependencias backend, corre migraciones, seed plan de cuentas, build
5. Build del frontend
6. Arranca backend con PM2 + log rotation
7. Configura Nginx
8. Activa firewall (UFW)
9. Verifica health

Al final verás:

```
▸ ICEMM desplegado en http://187.127.29.98
▸ Modo BETA activo (sin login).
```

Abrí http://187.127.29.98 en el browser y listo.

---

## Updates posteriores

Cada vez que hagas cambios localmente:

```bash
# En local
bash deploy/push.sh

# En el VPS
ssh root@187.127.29.98
cd /var/www/icemm/deploy
bash release.sh
```

`release.sh` reinstala deps si cambiaron, corre migraciones nuevas, hace build y reinicia PM2.

---

## Sacar de BETA → activar login

Cuando termine la fase de QA con gerencia:

```bash
ssh root@187.127.29.98

# 1. Editar .env y cambiar a false
nano /var/www/icemm/backend/.env
#   BETA_MODE=false

# 2. Crear usuarios admin
cd /var/www/icemm/backend
npx tsx scripts/createUser.ts --email=admin@bnv.cl --password='SECRET_FUERTE' --nombre='Admin' --rol=admin
npx tsx scripts/createUser.ts --email=gerente@bnv.cl --password='OTRO_SECRET' --nombre='Gerente' --rol=viewer

# 3. Reiniciar
pm2 restart icemm-api
```

Roles disponibles:
- `admin` — todo (incluye reemplazar plan de cuentas)
- `editor` — sube archivos pero no modifica plan
- `viewer` — solo lectura

---

## Comandos útiles en el VPS

```bash
# Ver logs en vivo
pm2 logs icemm-api

# Ver estado
pm2 status

# Reiniciar manual
pm2 restart icemm-api

# Health check
curl http://localhost:3001/health

# Ver tamaño de la DB
sudo -u postgres psql -d icemm -c "SELECT pg_size_pretty(pg_database_size('icemm'));"

# Backup manual de la DB
sudo -u postgres pg_dump icemm | gzip > /var/backups/icemm-$(date +%F).sql.gz

# Ver usuarios de la DB
sudo -u postgres psql -d icemm -c "SELECT email, rol, activo FROM \"User\";"
```

---

## Backup automático (recomendado)

Agregar a crontab del root:

```bash
sudo crontab -e
```

```cron
# Backup diario de la DB a las 3am, retención 30 días
0 3 * * * mkdir -p /var/backups/icemm && sudo -u postgres pg_dump icemm | gzip > /var/backups/icemm/$(date +\%F).sql.gz && find /var/backups/icemm -mtime +30 -delete
```

---

## HTTPS con dominio (futuro)

Cuando apuntes un dominio (por ej. `icemm.bnv.cl`) a la IP:

```bash
ssh root@187.127.29.98

# Editar Nginx
nano /etc/nginx/sites-available/icemm
# Cambiar: server_name icemm.bnv.cl;

# Instalar Certbot
apt install -y certbot python3-certbot-nginx

# Generar cert y configurar HTTPS automáticamente
certbot --nginx -d icemm.bnv.cl

# Auto-renew ya viene activado por default en Ubuntu.
```

---

## Troubleshooting

| Síntoma | Diagnóstico |
|---|---|
| `502 Bad Gateway` | `pm2 logs icemm-api` — backend caído. Probar `pm2 restart icemm-api`. |
| `connection refused` (curl al :3001) | Backend no arrancó. `pm2 status` y revisar logs. |
| `ERR_CONNECTION_REFUSED` desde browser | Firewall. `sudo ufw status` y permitir 80/443. |
| Login da 429 | Rate limit (10 intentos/15min). Esperar o reiniciar PM2. |
| Subida de Excel falla con 413 | Aumentar `client_max_body_size` en Nginx. |
| Prisma error: `Database does not exist` | DB no creada o `DATABASE_URL` mal. Revisar `/var/www/icemm/backend/.env`. |
| Memoria llena | `pm2 restart icemm-api` (auto-restart configurado en 500MB). Ver `free -h`. |

---

## Estructura de archivos en el VPS

```
/var/www/icemm/
├── backend/
│   ├── .env                    ← creado por first-deploy.sh (NO commitear)
│   ├── dist/                   ← build de TS
│   ├── node_modules/
│   ├── prisma/
│   └── ...
├── frontend/
│   ├── dist/                   ← build estático servido por Nginx
│   └── ...
└── deploy/
    ├── first-deploy.sh
    ├── release.sh
    ├── nginx-icemm.conf
    └── ecosystem.config.cjs

/var/log/icemm/
├── api-out.log                 ← stdout PM2
└── api-err.log                 ← stderr PM2

/var/backups/icemm/             ← (opcional, si configurás cron)
└── 2026-04-27.sql.gz
```
