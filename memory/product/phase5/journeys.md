# Phase 5 Journeys — Native Next.js runtime deploy

"Production simulation" = the production build started with the production start command only, `PORT=8080`, `NODE_ENV=production`, no supervisor programs, no FastAPI/uvicorn running, secrets passed as environment variables (no `.env` file), MongoDB reachable unless stated otherwise.

- id: JRN-68
  steps: Start the production simulation from a cold start and request `/health` and `/` every 0.5 s.
  expected: `/health` returns 200 with `{"status":"ok"}` within 5 s; `/` returns 200 with the server-rendered home (contains "ESPACIO Q" and the H1 in the HTML) within 10 s. Port 8080 is served by a node process; no python/uvicorn process exists.

- id: JRN-69
  steps: In the production simulation, open the home, /servicios, a service detail page, /contacto, /preguntas-frecuentes and /acceso, and collect every stylesheet, script, font, image and icon URL they reference; also request /favicon.ico, /apple-touch-icon.png, the 192/512 icons, the share image, /manifest.webmanifest, /robots.txt, /sitemap.xml and /llms.txt.
  expected: every URL returns 200 (0 failures); pages render styled (Zen Linen fonts and colours), not unstyled HTML.

- id: JRN-70
  steps: In the production simulation, call `GET /api/openapi.json` and a public API used by the booking wizard (services / availability) directly on port 8080.
  expected: 200 JSON answered by Next.js; no FastAPI in the path.

- id: JRN-71
  steps: In the production simulation with `APP_URL` and `ALLOWED_FORWARDED_ORIGINS` set to the public host and the request sent with that Host / X-Forwarded-Host, log in at /acceso as the OWNER_ADMIN test account.
  expected: redirected to /admin with the panel visible; no "Invalid Server Actions request" error.

- id: JRN-72
  steps: Start the production simulation against an empty database and call `/health` immediately, then wait 60 s and open /servicios and /admin after logging in with a freshly created owner.
  expected: `/health` is 200 during the seed; after the seed the default services catalogue is listed on /servicios; the scheduler lease document shows a run within 60 s of start.

- id: JRN-73
  steps: In the production simulation, call `POST /api/internal/jobs` with `Authorization: Bearer <CRON_SECRET>`, then with `Bearer <WEBHOOK_CRON_SECRET>`, then without a token.
  expected: first two return 2xx with a processing summary; without a token returns 401.

- id: JRN-74
  steps: Start the production simulation with MongoDB stopped (or MONGO_URL pointing to an unreachable host), then call `/health` and a public `/api/v1/...` endpoint.
  expected: `/health` returns 200; the API returns 503 with `{"error":"Base de datos no disponible temporalmente."}` and no stack trace.

- id: JRN-75
  steps: Start the production simulation without `AUTH_SECRET` and read the logs, then call `/health`.
  expected: one clear log line names `AUTH_SECRET` as missing; `/health` still returns 200.

- id: JRN-76
  steps: Read `backend/server.py` and the production start/build configuration.
  expected: no code spawns, supervises or restarts Next.js from Python; any remaining FastAPI file is documented as preview-only pass-through with no business logic.

- id: JRN-77
  steps: In preview, as a visitor, book a service on /reservar with a test e-mail, open the manage link, reschedule, then cancel.
  expected: same behaviour as phases 1–2 (confirmation shown, manage page works, slot freed after cancel, e-mail deliveries recorded with honest status).

- id: JRN-78
  steps: In preview, send the contact form, subscribe to the newsletter, and as OWNER_ADMIN edit and publish a CMS text and upload an image in /admin/multimedia.
  expected: contact and newsletter succeed with their existing Spanish messages; published text appears on the public page; uploaded image is served from /media/….

- id: JRN-79
  steps: In preview, open /contacto, /preguntas-frecuentes and the home; check the map, "Cómo llegar", FAQ JSON-LD, favicon and scroll-to-top on navigation.
  expected: phase 3–4 behaviour unchanged.

- id: JRN-80
  steps: Run the vitest suite and `yarn build` / typecheck.
  expected: all tests pass (≥ 68), build and typecheck succeed with 0 errors.

- id: JRN-81
  steps: Owner reads `/app/memory/DEPLOYMENT.md` and README.
  expected: they list the production build and start commands, port 8080, `/health`, and every publish secret (APP_URL, SITE_URL, ALLOWED_FORWARDED_ORIGINS, AUTH_SECRET, CRON_SECRET, WEBHOOK_CRON_SECRET, TOKEN_ENCRYPTION_KEY, TRUSTED_PROXY_HOPS, plus any others the app needs) with what to put in each; no PostgreSQL or FastAPI-proxy instructions remain.

- id: JRN-82 (human, in the NEW Next.js-template project)
  steps: Owner sets the publish secrets and clicks «Publicar» on Emergent; then opens `https://<app>.emergent.host/health`, the home, /acceso (logs in) and makes one booking.
  expected: /health 200; home loads with styles and the "Q" favicon; login reaches /admin; booking confirmation shown. Deploy logs show the Next.js server starting, not uvicorn.

- id: JRN-83
  steps: In /app/frontend run `yarn dev` with PORT=3005 and open the home, /reservar and /admin (logged in); stop it; delete `.next`, run `yarn start` with PORT=8080 (no prior build); then run `yarn build && yarn start`.
  expected: dev mode serves the pages; `yarn start` without a build builds then serves `/` 200; `yarn build && yarn start` starts without rebuilding and serves `/` 200 with all assets (JRN-69 crawl 0 failures).

- id: JRN-84
  steps: Stop the preview FastAPI relay (or call Next.js directly on its port) and exercise login, booking, contact and `/api/openapi.json`.
  expected: everything works against Next.js alone; no app code calls port 8001 or NEXT_INTERNAL_URL.

- id: JRN-85
  steps: Owner reads the migration checklist in `/app/memory/DEPLOYMENT.md`.
  expected: it lists, in order, the steps for the new Next.js-template project (import repo, delete /app/backend, fresh .env secrets, test accounts, check /api reaches Next.js, deployment health check, publish secrets, publish) with no step requiring FastAPI.
