# Phase 5 Requirement — Publish on the native Next.js runtime (no FastAPI in production)

- Version: phase-5
- Goal: When the owner clicks «Publicar» on Emergent, the app runs as a Next.js server (SSR pages, server actions, `/api` route handlers, `/health`) on the platform port — FastAPI is not in the production request path and never starts Next.js. Every existing feature keeps working; nothing else changes.
- Context: `/app/memory/product/overview.md` (F-19…F-23, Edge Cases). Builds on phases 1–4 (full app in `/app/frontend`, Next.js 14 + MongoDB). Current state to replace: `backend/server.py` proxies all paths and spawns `node .next/standalone/server.js` when Next.js is unreachable (commit 4b4d696) — the user rejects this approach.
- User decisions: keep all features and design unchanged (startup + deploy only); remove FastAPI from production; if Emergent's publishing cannot run the Next.js runtime directly → STOP and report (wait for Emergent support), no FastAPI workaround, no external host.
- Known platform facts (Emergent support, 2026-10): production container port 8080; health check needs `/` = HTTP 200 and `/health` < 500 within ~10 s; Next.js is supported via a separate SSR deploy path; known limitation: with `output: "standalone"` the `public/` folder may be missing in production; secrets are set in the publish Secrets tab (no `.env` in production); production DB = fresh Emergent-managed MongoDB Atlas.

## Step 1 outcome and decision (2026-10)
- Discovery result (`/app/memory/DEPLOYMENT.md`): this job uses the "mono" template (read-only supervisor: `backend` uvicorn :8001 + `frontend`), so Emergent publishes it on the FastAPI_React_Mongo path. Emergent support confirms the template is fixed at job creation and cannot be switched; the native Next.js deploy path requires a NEW project on the Next.js template.
- User decision: prepare the code here for the Next.js template, user pushes to GitHub ("Save to GitHub") and imports it into a NEW E3 project on the Next.js template; the user will NOT publish from this job (publishing from this job is expected to keep failing — accepted deviation).
- Target runtime layout (Next.js template, per deployment checker run 1 + help docs): single supervisor program `nextjs` running yarn in `/app/frontend` (PORT 3000 in preview, 8080 in production), no `backend`/`frontend` programs, `/api/*` served by Next.js API routes.

## Functional requirements

### Deploy discovery (must happen first)
- REQ-107 [always] The system shall be packaged in the exact layout Emergent's publishing uses to detect and run a Next.js server runtime, with the evidence for that layout (deployment health check output, platform docs or config) written to `/app/memory/DEPLOYMENT.md` (interpreted).
- REQ-108 [unwanted] If no evidence shows that Emergent's publishing can run the Next.js runtime without FastAPI, then the system shall be left unchanged in production behaviour and the builder shall report the blocker before any workaround (interpreted: user chose to wait for Emergent support).

### Next.js is the production server
- REQ-109 [always] The system shall start in production with a Node/Next.js server command only (`next start` or equivalent) and no Python/uvicorn process in the request path.
- REQ-110 [always] The system shall listen on the port given by the platform (`PORT`, 8080 in production) on 0.0.0.0.
- REQ-111 [always] The system shall serve every public page, `/admin/*`, `/acceso`, server actions, `/api/*` route handlers, `/media/*`, `/robots.txt`, `/sitemap.xml`, `/llms.txt` and `/manifest.webmanifest` from the Next.js server in production.
- REQ-112 [always] The system shall no longer contain code that spawns, supervises or restarts Next.js from FastAPI.
- REQ-113 [state] While running in the preview pod, the system shall keep `/api/*` reachable through the preview ingress (port 8001) using at most a stateless pass-through to Next.js with no business logic (interpreted: preview ingress is fixed by the platform).

### Static files in the published build
- REQ-114 [always] The system shall ship CSS, JS chunks, fonts, `favicon.ico`, apple-touch-icon, 192/512 px icons, the 1200×630 share image and every file in `public/` in the production build, each answering HTTP 200.
- REQ-115 [unwanted] If the chosen build output would drop `public/` in production, then the system shall use a build output that keeps it (interpreted: avoid the known standalone limitation).

### Startup and health
- REQ-116 [event] When the production server starts, the system shall answer `GET /health` with HTTP 200 and `{"status":"ok"}` without waiting for MongoDB, the seed or the scheduler.
- REQ-117 [event] When the production server starts, the system shall answer `GET /` with HTTP 200 and the server-rendered home page.
- REQ-118 [event] When the production database is empty at first start, the system shall run the existing idempotent seed in the background without delaying `/health` or `/`.
- REQ-119 [event] When the production server starts, the system shall start the existing in-process job scheduler (reminders, queue, campaigns) within 60 s.
- REQ-120 [unwanted] If MongoDB is unreachable, then the system shall answer `/api/*` calls with HTTP 503 and `{"error":"Base de datos no disponible temporalmente."}` without stack traces (keeps REQ-9 without FastAPI).
- REQ-121 [unwanted] If MongoDB is unreachable, then the system shall keep `GET /health` at HTTP 200.
- REQ-122 [unwanted] If a required production secret (`APP_URL`, `AUTH_SECRET`, `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY`) is missing, then the system shall log one clear line naming the missing variable while `/health` keeps answering (interpreted).

### No regressions
- REQ-123 [always] The system shall keep every journey of phases 1–4 passing in preview (booking, reschedule/cancel, contact, newsletter, admin panel, CMS, media, emails, map, SEO, FAQ, favicon).
- REQ-124 [always] The system shall keep server-action login at `/acceso` working behind the production proxy when `APP_URL` / `ALLOWED_FORWARDED_ORIGINS` are set.
- REQ-125 [always] The system shall keep `POST /api/internal/jobs` with `Bearer CRON_SECRET` or `Bearer WEBHOOK_CRON_SECRET` processing the queue in production.
- REQ-126 [always] The system shall keep `GET /api/openapi.json` available.

### Owner checklist and docs
- REQ-127 [always] The system shall document in `/app/memory/DEPLOYMENT.md` and `README.md` the production start/build commands, port, health path and the full list of publish secrets with what each one must contain.
- REQ-128 [always] The system shall remove outdated PostgreSQL / FastAPI-proxy instructions from `README.md` and `docs/OPERATIONS.md` (interpreted).

### Ready for the Next.js template project (added after step 1)
- REQ-129 [always] The system shall run from `/app/frontend` with standard scripts: `yarn dev` = `next dev` on 0.0.0.0:$PORT, `yarn build` = `next build`, `yarn start` = `next start -H 0.0.0.0 -p $PORT` (no `output: "standalone"`).
- REQ-130 [unwanted] If `yarn start` runs without a prior or with a stale production build, then the system shall build first before starting (interpreted: covers this pod's supervisor and an unknown production start sequence).
- REQ-131 [state] While running in this mono-template pod, the system shall keep `/app/backend/server.py` only as the stateless preview `/api/*` relay (REQ-113); the code shall not depend on it.
- REQ-132 [always] The system shall include in `/app/memory/DEPLOYMENT.md` a step-by-step migration checklist for the new Next.js-template project: delete `/app/backend`, create `/app/frontend/.env` with fresh secrets, recreate the test accounts, verify `/api/*` reaches Next.js, run the deployment health check, set publish secrets, then publish.
- REQ-133 [always] The system shall not rely on `.emergent/crons.yml` (dropped in production below 15 min); the in-process scheduler shall keep processing the queue every 5 min (interpreted).

## Quality requirements

```
Q-22 Tag: Deploy.Health
     Scale: seconds from process start to first HTTP 200 on /health and on /
     Meter: production simulation (prod build, PORT=8080, no supervisor, no FastAPI, empty DB), 3 cold starts
     Must: /health ≤ 5 s, / ≤ 10 s
     Plan: /health ≤ 2 s, / ≤ 5 s
```
```
Q-23 Tag: Deploy.Assets
     Scale: count of non-200 responses for static assets referenced by home, /servicios, /contacto, /acceso
     Meter: production simulation, crawl of every <link>/<script>/<img>/icon URL
     Must: 0
     Plan: 0
```
```
Q-24 Tag: Deploy.NoFastAPI
     Scale: Python/uvicorn processes involved in serving a production request
     Meter: production simulation process list + request trace
     Must: 0
     Plan: 0
```
```
Q-25 Tag: Regression.Preview
     Scale: % of phase 1–4 journeys passing in preview after the change
     Meter: vitest suite + e2e browser checks
     Must: 100 %
     Plan: 100 %
```
```
Q-26 Tag: Deploy.Live
     Scale: published URL serves /health 200, home with styles + favicon, owner login, one booking
     Meter: human (owner publishes and checks)
     Must: all four OK
     Plan: all four OK on first publish
```
