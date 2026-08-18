# Migraciones de base de datos (Prisma)

## Qué cambió y por qué

Antes el deploy usaba `prisma db push --accept-data-loss` y el historial de
migraciones estaba incompleto (1 migración para 8 tablas). Eso significaba:

- En cada release, un cambio de schema que Prisma interpretara como destructivo
  (rename de columna, cambio de tipo) podía **borrar datos sin aviso**.
- `prisma migrate deploy` en una DB limpia **fallaba**, porque la única migración
  existente (`add_informes`) referenciaba tablas que ninguna migración creaba.

Ahora hay un **único baseline** `migrations/20260401000000_init/` que contiene el
esquema completo (las 8 tablas, índices y foreign keys), y `release.sh` usa
`prisma migrate deploy` (no destructivo) con un backup previo automático.

---

## Servidor beta EXISTENTE (ya tiene las tablas creadas con `db push`)

La base ya tiene los datos y las tablas, así que **no** hay que volver a crearlas:
solo marcar el baseline como "ya aplicado". Una sola vez, en el VPS:

```bash
cd /var/www/icemm/backend

# 1) Backup primero (siempre)
bash /var/www/icemm/deploy/backup.sh pre-baseline

# 2) Marcar el baseline como aplicado SIN ejecutarlo (la DB ya tiene el schema)
npx prisma migrate resolve --applied 20260401000000_init

# 3) Verificar que no hay drift ni migraciones pendientes
npx prisma migrate status
#   Debe decir: "Database schema is up to date!"
```

> Si `migrate status` reporta la vieja `20260428000000_add_informes` como
> "applied but not found locally", es un registro huérfano inofensivo (ya no
> existe la carpeta). `migrate deploy` lo tolera con un warning. Si molesta,
> se puede borrar su fila de la tabla `_prisma_migrations`, pero no es necesario.

Si `migrate status` reportara drift real (el schema de la DB no coincide con el
baseline), **no** sigas: avisá antes de tocar nada, para no arriesgar los datos.

---

## Servidor NUEVO / recuperación desde cero (DB vacía)

`first-deploy.sh` ya corre `prisma migrate deploy`, que aplica el baseline y crea
todo el esquema:

```bash
cd /var/www/icemm/backend
npx prisma migrate deploy   # crea las 8 tablas desde 20260401000000_init
npm run seed:user           # crear el primer admin (ver scripts/createUser.ts)
```

---

## Flujo para CAMBIOS de schema de acá en adelante

1. Editar `backend/prisma/schema.prisma`.
2. **En local** (con una DB de dev): `npx prisma migrate dev --name descripcion_corta`
   — genera una nueva carpeta en `migrations/` con el SQL revisable.
3. Revisar el SQL generado (¡especialmente DROP/ALTER!) y commitearlo.
4. En el VPS, `release.sh` hace el backup y corre `prisma migrate deploy`.

Nunca volver a `db push` en producción.

---

## Permisos de los scripts

`release.sh` invoca `backup.sh` con `-x`. Si se clonó el repo en un FS que no
preserva el bit de ejecución:

```bash
chmod +x /var/www/icemm/deploy/backup.sh /var/www/icemm/deploy/release.sh
```
