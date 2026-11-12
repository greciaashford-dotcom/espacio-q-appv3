# DEPLOYMENT — ESPACIO Q (Phase 5)

Status (2026-11-12): **code ready for the Emergent Next.js template.** Publish from a NEW Next.js-template project (this mono-template job is not published; a publish from here is expected to fail, an accepted deviation).

## 1. Discovery evidence (step 1, summary)
- Emergent docs (help.emergent.sh/how-apps-work-here-mental-model, /deployment-issues): a **Next.js template** stack exists where Next.js API routes replace FastAPI; production port **8080**, `GET /health` = 200, start with "`npm start` or equivalent", static files from `public/`.
- Deployment checker, run 1: "Next.js Fullstack" type expects a single supervisor program `[program:nextjs]` (yarn in `/app/frontend`, PORT 3000 preview) and no `backend`/`frontend` programs. Runs 2–3 classify this job (read-only mono supervisor: `backend` uvicorn :8001 + `frontend`) as FastAPI_React_Mongo, the path where the last publish only ran nginx :8080 → uvicorn :8001.
- Emergent support (via owner): the template is fixed at job creation and cannot be switched → new project on the Next.js template.
- Deployed apps discard crons that fire more often than every 15 min (`.emergent/crons.yml` now `*/15`, backup only; the in-process scheduler runs every 5 min).

## 2. Final runtime layout
| | |
|---|---|
| App directory | `/app/frontend` (Next.js 14 App Router, the whole app: pages, server actions, `/api/*`, `/media/*`, `/health`) |
| Install | `yarn install` |
| Build | `yarn build` = `next build` (+ `postbuild` writes `.next/source-hash`) |
| Start (prod) | `yarn start` = `next start -H 0.0.0.0 -p ${PORT:-3000}` → set `PORT=8080` (platform). `prestart` (`scripts/ensure-build.mjs`) runs `next build` first only if `.next` has no build or the sources changed since the build |
| Start (dev/preview) | `yarn dev` = `next dev -H 0.0.0.0 -p ${PORT:-3000}`; `yarn start:dev` = port 3000 |
| Port | `$PORT` on 0.0.0.0 (8080 in production, 3000 in preview) |
| Health | `GET /health` → `200 {"status":"ok"}` instantly, no MongoDB/seed/scheduler dependency. `GET /` → SSR home |
| Static files | no `output: "standalone"` → `next start` serves `public/` (favicon, icons, og image) and `.next/static` (CSS/JS/fonts) straight from the project; the standalone/public limitation does not apply |
| Background on boot | `instrumentation-node.ts`: one log line per missing required var, idempotent seed if DB empty, CMS defaults, job scheduler (first run ~15 s, then every 5 min, lease in `schedulerLeases`) |
| Mongo down | `/api/*` route handlers (`lib/http/db-guard.ts`) → `503 {"error":"Base de datos no disponible temporalmente."}`; `/health` stays 200 |
| Python | none. `backend/server.py` exists only for THIS mono pod: stateless `/api/*` relay → Next.js :3000 because the preview ingress sends `/api/*` to :8001. No app code uses port 8001 or `NEXT_INTERNAL_URL`. Delete `/app/backend` in the new project |

## 3. Environment variables / publish secrets
Preview: `/app/frontend/.env` (template: `frontend/.env.example`). Production: publish **Secrets** tab (no `.env`).

| Variable | Required | What to put |
|---|---|---|
| `MONGO_URL`, `DB_NAME` | yes | Injected by Emergent (managed Atlas in production; local values of the new pod in preview). Do not invent |
| `APP_URL` | yes | Public HTTPS URL of the app, no trailing slash: `https://<app>.emergent.host` (later `https://espacioq.es`). Used in email links, OAuth redirect and as allowed Server Actions origin |
| `SITE_URL` | yes | `https://espacioq.es` (canonical, sitemap, robots, JSON-LD) |
| `ALLOWED_FORWARDED_ORIGINS` | yes | Public hosts, comma separated, wildcards allowed: `<app>.emergent.host,espacioq.es,www.espacioq.es` (preview: `**.preview.emergentcf.cloud,**.preview.emergentagent.com,**.emergent.host,**.emergentagent.com`). Without it login/forms fail behind the proxy |
| `TRUSTED_PROXY_HOPS` | yes | `2` (proxies that append `X-Forwarded-For`; used for rate-limit client IP) |
| `AUTH_SECRET` | yes | `openssl rand -hex 32` (session signing, ≥32 chars) |
| `CRON_SECRET` | yes | `openssl rand -hex 32` (Bearer for `POST /api/internal/jobs`, ≥16 chars) |
| `WEBHOOK_CRON_SECRET` | yes | `openssl rand -hex 32`, or the value Emergent's cron feature provides (Bearer used by `.emergent/crons.yml`) |
| `TOKEN_ENCRYPTION_KEY` | yes | `openssl rand -hex 32` (exactly 64 hex chars; AES-256-GCM for OAuth tokens) |
| `EMERGENT_LLM_KEY` | yes | Emergent universal key (Object Storage for the media library) |
| `EMERGENT_EMAIL_KEY` | yes | Emergent-managed Resend key (without it emails are SIMULATED_LOCAL) |
| `EMAIL_FROM_NAME` | yes | `ESPACIO Q` |
| `INTEGRATION_PROXY_URL` | optional | `https://integrations.emergentagent.com` (default) |
| `EMAIL_REPLY_TO`, `EMAIL_WEBHOOK_SECRET` | optional | Reply-To address; HMAC secret for `/api/webhooks/email` |
| `ALLOWED_IMAGE_DOMAINS` | optional | `images.unsplash.com,plus.unsplash.com` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_BUSINESS_LOCATION_ID`, `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACE_ID` | optional | Google Business/Places sync; empty = «Horario Manual» |
| `JOB_SCHEDULER_INTERVAL_SEC` | optional | default `300` |
| `NEXT_TELEMETRY_DISABLED` | optional | `1` |

Use NEW random values in production (not the preview ones). Missing required vars are logged at boot as `[config] Falta la variable de entorno obligatoria <NAME>`.

## 4. Migration checklist — new Emergent project on the Next.js template
1. In this job: «Save to GitHub» (repo includes `/app/memory/product/*`, this file, `frontend/.env.example`). Note: the platform does not commit `yarn.lock`; `yarn install` resolves from `package.json` (versions pinned).
2. Create a NEW project on the **Next.js template** and import the GitHub repo.
3. Delete `/app/backend` (FastAPI relay, not needed) — nothing in `/app/frontend` uses it.
4. Check the supervisor program is the Next.js one (`[program:nextjs]`, yarn in `/app/frontend`, PORT 3000). If it runs `yarn dev` or `yarn start`, both work (start builds first when needed).
5. Create `/app/frontend/.env` from `frontend/.env.example`: `MONGO_URL`/`DB_NAME` from the new pod, `APP_URL` = new preview URL, `SITE_URL`, `ALLOWED_FORWARDED_ORIGINS`, `TRUSTED_PROXY_HOPS=2`, freshly generated `AUTH_SECRET`, `CRON_SECRET`, `WEBHOOK_CRON_SECRET`, `TOKEN_ENCRYPTION_KEY`, plus `EMERGENT_LLM_KEY`, `EMERGENT_EMAIL_KEY`, `EMAIL_FROM_NAME`, `INTEGRATION_PROXY_URL`, `ALLOWED_IMAGE_DOMAINS`, `NEXT_TELEMETRY_DISABLED=1`. Restart the Next.js program. The empty DB is seeded automatically.
6. Recreate the test accounts (commands in `/app/memory/test_credentials.md`).
7. Verify `/api/*` reaches Next.js on the preview URL: `GET /health` → 200, `GET /api/openapi.json` → 200 JSON, `POST /api/internal/jobs` with `Bearer $CRON_SECRET` → 200; log in at `/acceso`; one booking.
8. Run `yarn test` (≥68 tests), `yarn typecheck`, `yarn build`.
9. Run the Emergent deployment health check; it must classify the app as Next.js (no FastAPI) and pass.
10. In the publish **Secrets** tab set every "yes" variable of section 3 with NEW production values (`APP_URL`/`ALLOWED_FORWARDED_ORIGINS` = the `.emergent.host` URL and espacioq.es).
11. Publish. Then check (JRN-82): `https://<app>.emergent.host/health` = 200, home styled with the "Q" favicon, `/acceso` → `/admin` (create the first owner at `/acceso` on the empty production DB), one booking. Deploy logs must show `next start` / "Ready", not uvicorn.

## 5. Verification done in this pod (2026-11-12)
Production simulation = copy of `/app/frontend` without `.env`/`.next` in `/root/prodsim`, `env -i` with only the secrets as env vars, `NODE_ENV=production`, `PORT=8080`, supervisor `frontend`/`backend` stopped (no app uvicorn; only the platform tool server on :8010), empty DB `espacio_q_prodsim`.

| Journey | Result |
|---|---|
| JRN-68 / Q-22 (3 cold starts, empty DB, existing build) | `/health` 200 at 0.55 / 0.54 / 0.55 s; `/` 200 (SSR, "ESPACIO Q" + H1) at 1.52 / 1.48 / 1.53 s; no non-200 on `/` while polling. :8080 owned by `next-server`; no app python/uvicorn process |
| JRN-69 / Q-23 | 6 pages (home, /servicios, /servicios/corte-de-autor-visagismo, /contacto, /preguntas-frecuentes, /acceso) + 157 referenced assets (CSS, JS chunks, woff2 fonts, favicon.ico, 16/32 favicons, apple-touch-icon, 192/512/maskable icons, og-espacioq.jpg, manifest, robots, sitemap, llms.txt): **0 non-200** (after `yarn start`-builds and after `yarn build && yarn start`) |
| JRN-70 | `/api/openapi.json` 200 JSON; `/api/v1/bookings/availability` 200 slots, served on :8080 by Next.js |
| JRN-71 | Login at /acceso with the POST `Origin: https://espacio-q-app.emergent.host` (≠ Host, as behind the proxy), `APP_URL`/`ALLOWED_FORWARDED_ORIGINS` = that host → /admin panel, no "Invalid Server Actions request" |
| JRN-72 | Empty DB: `/health` 200 during seed; seed done ~1 s after "Ready" (24 services, /servicios lists them); `schedulerLeases.job-queue.lastRunAt` ~14 s after start |
| JRN-73 | `POST /api/internal/jobs` Bearer CRON_SECRET → 200, Bearer WEBHOOK_CRON_SECRET → 200 (summary), no token → 401 |
| JRN-74 | `MONGO_URL=mongodb://127.0.0.1:27999`: `/health` 200 at 0.55 s; availability GET and contact POST → 503 `{"error":"Base de datos no disponible temporalmente."}` (no trace) |
| JRN-75 | Without `AUTH_SECRET`: log `[config] Falta la variable de entorno obligatoria AUTH_SECRET`; `/health` 200 |
| JRN-76 | `backend/server.py` = 50-line stateless `/api/*` relay (preview only), no subprocess/spawn/supervise |
| JRN-83 | `yarn dev` (PORT=3005): /, /reservar, /acceso 200, login → /admin. `yarn start` without `.next` → builds, then serves; sources changed → rebuilds; `yarn build && yarn start` → "Build de producción al día", no rebuild |
| JRN-84 | Supervisor `backend` stopped (nothing on :8001): login → /admin, booking 200 + manage URL, contact 200, openapi 200 directly on Next.js :3000; vitest 68/68 |
| JRN-80 | vitest 14 files / 68 tests pass; `yarn typecheck` 0 errors; `yarn lint` clean; `next build` OK |

Only verifiable by a real publish of the new project: JRN-82 / Q-26 (platform build/start sequence, Secrets injection, Atlas, proxy headers, cron at 15 min).
