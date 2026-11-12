# PRD — ESPACIO Q (Next.js on Emergent + MongoDB)

## Original problem statement (Phase 1)
Imported Next.js 14 repo (App Router, TS, Tailwind, Prisma/PostgreSQL). Phase 1: keep Next.js, run on Emergent preview, replace PostgreSQL/Prisma with Emergent MongoDB (MONGO_URL/DB_NAME only), re-implement anti-double-booking without transactions, unique indexes, idempotent seed, media in Emergent Object Storage, scheduled job queue (cron ≥ every 5 min), generated secrets, email stays SIMULATED_LOCAL, OpenAPI at /api/openapi.json, port vitest suites, OWNER_ADMIN + RECEPTION test accounts. Out of scope: Resend, welcome emails, salon notices, maps, redesign. Full docs: /app/memory/product/overview.md, phase1/requirement.md, phase1/journeys.md.

## Architecture
- /app/frontend: full Next.js app (the whole runtime). `yarn start` = prestart build guard + `next start` on $PORT. `instrumentation-node.ts` auto-seeds empty DB on boot (background).
- /app/backend/server.py: preview-only stateless /api/* relay → Next.js :3000 (mono pod ingress); not used by app code, deleted in the Next.js-template project.
- lib/db/prisma.ts: Prisma-compatible data layer over official `mongodb` driver (where/select/include/_count/orderBy/upsert/cascades/groupBy/aggregate), metadata generated from prisma/schema.prisma (scripts/gen-db-schema.mjs → lib/db/schema.generated.ts). Unique + secondary indexes created on connect (partial indexes for nullable uniques).
- lib/db/slot-locks.ts: anti-overlap — one `slotLocks` doc per minute of each active Occupancy/ResourceReservation, unique (resource, minute); ordered insert, compensation on conflict, stale-lock sweeping (on conflict + every cron run).
- Booking: occupancy (lock) first → client/appointment/events/jobs; compensation deletes everything on failure. Reschedule moves occupancy first, reverts on failure. Cancel deactivates occupancy (frees locks).
- `$transaction` replaced by `sequentialWrites` (explicitly non-atomic) with reordered/compensating writes where critical (booking, reschedule, schedules replace-then-delete, first-owner bootstrap lock).
- Media: lib/storage/object-storage.ts (Emergent Object Storage via EMERGENT_LLM_KEY), served by app/media/[filename] with in-memory cache.
- Cron: /app/.emergent/crons.yml → POST {{BASE_URL}}/api/internal/jobs every 5 min (Bearer WEBHOOK_CRON_SECRET); route also accepts CRON_SECRET.

## Implemented (2026-11-08)
- All of Phase 1 scope above; vitest 10 files / 50 tests passing on Mongo (incl. new 10-parallel booking test).

- After test iteration 1: client IP for rate limits taken from a trusted X-Forwarded-For position (TRUSTED_PROXY_HOPS) so the header can't be spoofed; successful logins reset the login limit; Spanish email validation messages on contact/newsletter.

## Phase 2 (2026-11-08) — Resend, welcome emails, salon notices
- lib/email/provider.ts: Emergent-managed Resend (EMERGENT_EMAIL_KEY + EMAIL_FROM_NAME="ESPACIO Q"), from_name + contact_email (Reply-To). Statuses: ACCEPTED (provider id), FAILED (real error text), SIMULATED_LOCAL only when key missing or recipient on reserved test domain. Never DELIVERED without webhook.
- Managed sender policy: transactional only → campaigns / campaign tests are recorded FAILED with an explicit reason (need the salon's own sender/domain).
- Rate limit (429): 11-min cooldown, job back to PENDING without consuming an attempt. Direct sends (contact ack, contact notice, newsletter verify/welcome) get RETRY_EMAIL_DELIVERY jobs on retryable failure.
- CLIENT_WELCOME once per client (client.welcomeSentAt + dedupKey), online + panel bookings; survives cancellation of the first appointment.
- salonSettings.noticeEmail (fallback contactEmail; dashboard warning if neither): SALON_NOTICE_BOOKING + SALON_NOTICE_CONTACT (Reply-To = sender).
- Stale confirmation/reminder jobs for cancelled appointments are cancelled. Campaigns with 0 accepted → FAILED.
- Jobs: in-process scheduler (lib/jobs/scheduler.ts, check every 60 s, run every 5 min, lease in schedulerLeases) because the Emergent cron watcher never applied crons.yml (applied.hash empty). crons.yml kept for deploy.
- Vitest 12 files / 59 tests passing; testing iterations 2–3 passed.

## Phase 3 (2026-11-08) — Contact map, "Cómo llegar", editable directions
- /contacto: Leaflet + OpenStreetMap (client-only, divIcon marker at 40.4241269, -3.6976262, "© OpenStreetMap"), no Google requests before consent; tile-error overlay keeps address + button.
- Cookie category "Mapas de terceros (Google Maps)" (lib/consent/cookie-consent.ts, event espacioq:consent-changed); inline "Ver en Google Maps" → "Aceptar y cargar Google Maps" swaps to keyless embed without reload; partial consent keeps the banner open.
- "Cómo llegar" button → google.com/maps/dir/?api=1&destination=…; existing "Abrir en Google Maps" kept (aside).
- page_contacto.directions {metro, bus, parking} editable via CMS; migrateCmsDefaults (boot + ensureBaseCmsAndSettings) adds missing defaults and the cookie-policy mention only when unedited.
- Vitest 13 files / 62 tests; testing iteration 4: all JRN-41…50 passed.

## Phase 4 (2026-11-11) — Scroll, popups, SEO + GEO, FAQ, favicon
- ScrollToTopOnNavigate (root layout; pathname changes, skips popstate/hash); booking wizard + manage page scroll to their top below the sticky header (lib/ui/scroll.ts, reduced-motion aware).
- Promo + newsletter popups tightened at lg (≥1024) only; fit 1366×768 without inner scroll.
- SEO: SITE_URL (default https://espacioq.es) for canonical/sitemap/robots/OG/JSON-LD; noindex (meta + X-Robots-Tag) on non-espacioq.es hosts; withSeo() per page; geo meta; JSON-LD graph (WebSite, Organization, HairSalon/BeautySalon), Service+Breadcrumb, FAQPage; no ratings.
- GEO: robots.txt allows * + 11 AI crawlers; /llms.txt from live data.
- /preguntas-frecuentes (CMS page_faq, 6 seeded real-data Q&As with {{phone}}/{{cancellationFreeHours}} placeholders), footer link.
- Favicon/icons/manifest/og image generated by scripts/gen-brand-assets.py into public/.
- Vitest 14 files / 68 tests; testing iteration 5: all passed.

## Deployment layout (superseded 2026-11-11 layout, kept for history)
- Was: `output: "standalone"` + FastAPI spawning the standalone server. Removed in Phase 5.

## Deployment layout (2026-11-12, Phase 5 — Next.js template)
- Next.js only. `/app/frontend`: `yarn build` = `next build` (no standalone); `yarn start` = `next start -H 0.0.0.0 -p ${PORT:-3000}` with `prestart` guard (scripts/ensure-build.mjs: builds when .next missing/stale; postbuild stamps `.next/source-hash`); `yarn dev` = `next dev` on $PORT.
- `/health` dependency-free; seed + CMS defaults + scheduler in background (instrumentation-node.ts); missing required var → `[config] Falta la variable de entorno obligatoria X`.
- Mongo down → `/api/*` 503 JSON via `lib/http/db-guard.ts` (`withDbGuard` around every route handler except openapi).
- backend/server.py = preview-only stateless `/api/*` relay for this mono pod (no spawn, no Mongo, no business logic). New project deletes /app/backend.
- crons.yml → `cron: */15` (backup; prod discards <15 min). Full checklist + secrets: /app/memory/DEPLOYMENT.md.

## Phase 5 (2026-11-12) — Native Next.js runtime
- Step 1: this job is mono template (FastAPI_React_Mongo path), cannot be switched (Emergent support) → owner imports the repo into a NEW Next.js-template project. This job is not published.
- Step 2 done: layout above; first-boot race fix (concurrent CMS default creation tolerates P2002 so `/` never 500s on empty DB); README, docs/OPERATIONS.md (PostgreSQL/FastAPI removed), frontend/.env.example (Mongo + Emergent vars) updated.
- Verified: production simulation JRN-68…76, JRN-83, JRN-84 (results table in DEPLOYMENT.md §5); vitest 68/68, typecheck, lint, build.

## Known pre-existing issues (not touched, out of scope)
- React hydration warnings on home (perspective-tunnel-hero), Black Friday popup over transactional pages, unknown serviceId → 409 instead of 400, manage-page same-day slot list hides slots that overlap the appointment's own time.

## Backlog
- P0: salon sets the real «Email de avisos del salón» in /admin/configuracion; verify espacioq.es sender (own Resend account) to unblock marketing campaigns.
- P1 Phase 3: done.
- P2: typed delegates for the data layer (currently `any`), multi-instance cache for media.
