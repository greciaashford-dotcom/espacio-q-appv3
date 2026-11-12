# Manual de Operaciones, Despliegue y Recuperación · ESPACIO Q

Guía detallada de publicación (plantilla Next.js de Emergent, checklist de migración y secretos): `/app/memory/DEPLOYMENT.md`.

## 1. Puesta en Producción (Emergent, plantilla Next.js)

- Runtime: **solo Next.js** en `/app/frontend` (sin FastAPI, sin Python).
- Build: `yarn build` (= `next build`). Arranque: `yarn start` (= `next start -H 0.0.0.0 -p $PORT`, 8080 al publicar; el `prestart` compila si no hay build o está desactualizada).
- Health check: `GET /health` → 200 `{"status":"ok"}` al instante, sin esperar a MongoDB, la semilla ni el planificador. `GET /` → portada SSR.
- Primer arranque con base vacía: la semilla idempotente se carga en segundo plano.
- MongoDB caído: `/api/*` → 503 `{"error":"Base de datos no disponible temporalmente."}`; `/health` sigue en 200.
- Falta un secreto obligatorio: una línea `[config] Falta la variable de entorno obligatoria <NOMBRE>` en el log.

### Variables de entorno (pestaña Secrets al publicar; `.env` solo en preview)
- `MONGO_URL`, `DB_NAME`: inyectadas por Emergent (MongoDB Atlas gestionado).
- `APP_URL`: URL pública con HTTPS (`https://<app>.emergent.host` o `https://espacioq.es`). Enlaces de correos y origen permitido de Server Actions.
- `SITE_URL`: `https://espacioq.es` (canonical, sitemap, robots, JSON-LD).
- `ALLOWED_FORWARDED_ORIGINS`: hosts públicos separados por comas (p. ej. `<app>.emergent.host,espacioq.es,www.espacioq.es`). Sin ello no funcionan el acceso al panel ni los formularios con server actions.
- `TRUSTED_PROXY_HOPS`: número de proxies de confianza que añaden `X-Forwarded-For` (2 en Emergent).
- `AUTH_SECRET`, `CRON_SECRET`, `WEBHOOK_CRON_SECRET`, `TOKEN_ENCRYPTION_KEY`: `openssl rand -hex 32`, distintos entre sí y distintos de preview.
- `EMERGENT_LLM_KEY` (Object Storage de la biblioteca multimedia), `EMERGENT_EMAIL_KEY` + `EMAIL_FROM_NAME` (Resend gestionado), opcionales `EMAIL_REPLY_TO`, `EMAIL_WEBHOOK_SECRET`, `INTEGRATION_PROXY_URL`.
- Opcionales Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_BUSINESS_LOCATION_ID`, `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACE_ID`.

### Base de datos
- MongoDB (driver oficial). Índices únicos y secundarios se crean al conectar (`lib/db/prisma.ts`, metadatos de `prisma/schema.prisma` vía `yarn db:gen`).
- Semilla manual: `yarn db:seed` (idempotente). Alta de usuarios: `prisma/create-admin.ts` (ver README).

---

## 2. Tareas Programadas (Scheduler / Worker)

- **Planificador interno** (`lib/jobs/scheduler.ts`): arranca con el servidor, comprueba cada minuto y procesa la cola cada 5 min (lease `schedulerLeases` en MongoDB: sin ejecuciones duplicadas entre instancias).
- **Endpoint del Worker:** `POST /api/internal/jobs` con `Authorization: Bearer <CRON_SECRET>` o `Bearer <WEBHOOK_CRON_SECRET>`; `?syncGoogle=1` sincroniza horarios de Google.
- `/app/.emergent/crons.yml`: respaldo cada 15 min (las apps publicadas descartan crons de menos de 15 min).
- **Garantías:** reclamo atómico de trabajos con `lockedUntil`; antes de enviar un recordatorio se revalida que la cita siga confirmada y en la misma hora.
- También manual desde **`/admin/automatizaciones` → «Procesar cola pendiente ahora»**.

---

## 3. Copias de Seguridad (Backups) y Restauración

- MongoDB gestionado por Emergent. Copia manual:
  ```bash
  mongodump --uri "$MONGO_URL" --db "$DB_NAME" --archive="backup_espacio_q_$(date +%Y%m%d_%H%M).archive" --gzip
  ```
- Restauración en una base de verificación:
  ```bash
  mongorestore --uri "$RESTORE_MONGO_URL" --archive=backup_espacio_q_YYYYMMDD_HHMM.archive --gzip --nsFrom="$DB_NAME.*" --nsTo="espacio_q_restore.*"
  ```
- Tras restaurar, el arranque recrea los índices; ejecutar `yarn test` contra la base restaurada para verificar.
- Archivos multimedia: en Emergent Object Storage (no en el disco del contenedor, que es efímero).

---

## 4. Política de Retención y Privacidad (RGPD)

- **Archivos de importación/exportación Excel:** No tienen URL pública; las exportaciones caducan automáticamente tras su ventana de descarga y son purgadas por el worker.
- **Derechos ARSOPOL (Acceso, Rectificación, Supresión, Oposición, Portabilidad y Limitación):**
  - Desde `/admin/clientes`, el administrador puede exportar la ficha completa de un cliente, archivar su perfil o ejecutar la **anonimización irreversible** de sus datos personales conservando únicamente la integridad estadística/histórica de las citas pasadas sin PII.
