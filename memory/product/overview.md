# Requirements: ESPACIO Q · Web y Panel de Gestión (Madrid)

Existing imported repo (Next.js 14 App Router + TypeScript + Tailwind, Prisma + PostgreSQL). Full feature description of what already exists: `/app/README.md`, `/app/docs/MASTER_SPEC.md`, `/app/docs/INTEGRATIONS.md`, `/app/docs/USER_GUIDE.md`.

## Core Value
A beauty salon in Madrid (ESPACIO Q, Calle de Pelayo 41, 28004) gets a public editorial website where clients book online without double-bookings, plus an admin panel (CMS, agenda, clients, marketing) — now running natively on Emergent (MongoDB), with every email really delivered through Resend.

## Personas & Roles
- **Visitante / Cliente (public)**: browses services, books/reschedules/cancels via private token link, subscribes to newsletter (double opt-in), sends contact messages, finds how to get to the salon.
- **OWNER_ADMIN**: full panel access (settings, CMS, media, services, team, schedules, clients, marketing, automations, reports).
- **RECEPTION / PROFESSIONAL**: restricted panel roles as already implemented in the repo (unchanged).

## Features
| id | feature | persona | phase |
|---|---|---|---|
| F-1 | Code stays in Next.js (App Router, server actions, API routes); app runs in Emergent preview | all | 1 |
| F-2 | Database moved from PostgreSQL/Prisma to Emergent MongoDB (`MONGO_URL`, `DB_NAME`); all existing features keep working | all | 1 |
| F-3 | Anti-double-booking guarantee re-implemented on MongoDB (no two active overlapping occupancies per professional / shared resource, also under concurrent requests) | Cliente, Admin | 1 |
| F-4 | Seed data (services catalog, professionals, weekly schedule, CMS defaults, email templates, automation rules) loads into MongoDB; first-admin bootstrap works | Admin | 1 |
| F-5 | Media library uploads stored in Emergent Object Storage instead of local disk | Admin | 1 |
| F-6 | Notification job queue (reminders 24 h / 2 h, campaigns) processed automatically on a schedule | system | 1 |
| F-7 | Resend (Emergent-managed) wired into every email the app sends: newsletter verification, newsletter welcome, booking request/confirmation/reschedule/cancellation, reminders 24 h & 2 h, contact acknowledgement, campaigns and campaign test | Cliente, Admin | 2 |
| F-8 | Automated welcome email to newsletter subscribers on double opt-in confirmation (exists, now real) | Cliente | 2 |
| F-9 | Automated welcome email to every new client on their first booking | Cliente | 2 |
| F-10 | Internal email notices to the salon for each new booking and each new contact message | Admin | 2 |
| F-11 | Contact page map of the salon: OpenStreetMap by default (no cookies); Google Maps embed only after the visitor accepts third-party cookies | Visitante | 3 |
| F-12 | "Cómo llegar" button opening Google Maps directions to the salon | Visitante | 3 |
| F-13 | "Cómo llegar" text (metro, bus, parking) under the map, editable and publishable from the panel CMS | Visitante, Admin | 3 |
| F-14 | Every link / page navigation and every booking & manage step lands at the top of the page/wizard | Visitante | 4 |
| F-15 | Discount and newsletter popups smaller on desktop so they fit entirely (mobile unchanged) | Visitante | 4 |
| F-16 | SEO (local "peluquería Chueca", canonical https://espacioq.es, structured data, sitemap, meta) and GEO (AI crawlers allowed, llms.txt, server-rendered facts) | Visitante | 4 |
| F-17 | FAQ page /preguntas-frecuentes editable from the panel, with FAQPage structured data | Visitante, Admin | 4 |
| F-18 | ESPACIO Q "Q" favicon + app icons + web manifest | Visitante | 4 |
| F-19 | Published app runs on the Next.js server runtime (SSR pages, server actions, API routes, health) — FastAPI is not in the production request path and never launches Next.js | all | 5 |
| F-20 | Published build ships every static file (CSS, JS, favicon, icons, share image, manifest, public images) | Visitante | 5 |
| F-21 | Publish-friendly startup: listens on the platform port (8080), `/` and `/health` answer fast; seed and job scheduler run without blocking startup | system | 5 |
| F-22 | All existing features keep working in preview and in the published app (no feature changes) | all | 5 |
| F-23 | Owner gets a clear publish checklist (secrets) and up-to-date run/deploy docs | Admin | 5 |

## Phases
- **Phase 1** → Next.js running on Emergent with MongoDB; full parity of existing features; anti-double-booking; object storage; scheduled job processing → F-1, F-2, F-3, F-4, F-5, F-6. Docs: `/app/memory/product/phase1/requirement.md`, `/app/memory/product/phase1/journeys.md`
- **Phase 2** → Real email everywhere via Resend + welcome emails + salon notices → F-7, F-8, F-9, F-10. Docs: `/app/memory/product/phase2/requirement.md`, `/app/memory/product/phase2/journeys.md`
- **Phase 3** → Contact page map + directions + editable transport text → F-11, F-12, F-13. Docs: `/app/memory/product/phase3/requirement.md`, `/app/memory/product/phase3/journeys.md`
- **Phase 4** → Scroll-to-top, desktop popup sizing, SEO + GEO, FAQ page, favicon → F-14…F-18. Docs: `/app/memory/product/phase4/requirement.md`, `/app/memory/product/phase4/journeys.md`
- **Phase 5** → Deploy on the native Next.js runtime (no FastAPI in production), complete static assets, fast health, full regression, publish checklist → F-19…F-23. Docs: `/app/memory/product/phase5/requirement.md`, `/app/memory/product/phase5/journeys.md`
  - User decisions (2026-10): keep every feature as is, change only startup/deploy; remove FastAPI from production (Next.js serves everything); if Emergent's publishing cannot run Next.js directly → stop and wait for Emergent support confirmation (no FastAPI workaround, no external host for now).

## UI/UX Rules
- Keep the existing "Zen Linen" editorial design, Spanish copy, WCAG 2.2 AA behaviour and layout. No redesign.
- Keep the honest-status principle of the repo: never show "sent"/"synced" unless it really happened.
- RGPD/LSSI-CE: no third-party cookies before consent; cookie manager stays granular and non-blocking.

## Integrations
| service | purpose | key/account | phase |
|---|---|---|---|
| Emergent MongoDB | primary database | system env `MONGO_URL`, `DB_NAME` | 1 |
| Emergent Object Storage | media library files | managed by Emergent | 1 |
| Emergent scheduled jobs (cron) | process notification queue | managed by Emergent | 1 |
| Resend (Emergent-managed integration) | all transactional + marketing emails | managed by Emergent, user must NOT be asked for a key. Own domain (espacioq.es) verification is a later user task | 2 |
| OpenStreetMap tiles | default contact map | none | 3 |
| Google Maps embed + directions link | consented map + "Cómo llegar" | none (no API key) | 3 |
| Google Business Profile / Places | schedule sync | unchanged from repo (optional, stays in "Horario Manual" without credentials) | — |

## Edge Cases
- Two clients booking the same professional/time simultaneously → exactly one succeeds.
- Europe/Madrid DST changes, split shifts, holidays/exceptions keep working after the DB migration.
- Email provider failure → booking/contact/newsletter still saved; delivery recorded as FAILED and retried by the queue; never shown as sent.
- Welcome to a new client is sent once per client, never on later bookings; newsletter welcome once per subscriber.
- Salon notice address not configured → notices skipped and the panel shows a clear warning.
- Visitor rejects cookies → map still works (OpenStreetMap), Google iframe never loads.
- Pod recycle wipes preview Mongo data → seed must be re-runnable and idempotent.
- Publishing: platform health check needs `/` = 200 and `/health` < 500 within ~10 s on port 8080; known Emergent limitation: with Next.js `output: "standalone"` the `public/` folder may be missing in production.
- Preview ingress sends `/api/*` to port 8001 (supervisor config is read-only) → a preview-only relay may remain there; it must not be part of production.
- Production MongoDB is a fresh Emergent-managed Atlas → first boot seeds it without delaying health checks.

## Seed Data
- Fresh database (no migration of PostgreSQL data). Seed = the repo's existing seed: ESPACIO Q salon settings & location metadata, default services catalog, professionals catalog, weekly schedule, CMS defaults, email templates, automation rules, integration connection placeholders.
- One OWNER_ADMIN test account created for testing (credentials in `/app/memory/test_credentials.md`).
