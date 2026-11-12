# Test credentials — ESPACIO Q (Phase 1, MongoDB)

Login page: `/acceso` (email + password form, Next.js server action `loginAction`).
On success the server sets the httpOnly cookie **`espacioq_session`** (opaque token; SHA-256 hash stored in Mongo `session` collection; `SameSite=Lax`, `Secure` in production) and redirects to `/admin`.
Logout: button in the admin panel (server action `logoutAction`, deletes the session + cookie).
No session cookie → `/admin/*` redirects to `/acceso?next=...`; `/api/v1/admin/*` returns 401/403.

| Role | Email | Password |
|---|---|---|
| OWNER_ADMIN | owner@espacioq.test | EspacioQ-Owner-2026! |
| RECEPTION | reception@espacioq.test | EspacioQ-Recep-2026! |

Re-create / reset (idempotent upsert):
```
cd /app/frontend
BOOTSTRAP_PASSWORD='EspacioQ-Owner-2026!' npx tsx --env-file=.env prisma/create-admin.ts --email owner@espacioq.test --name "Propietaria Test" --role OWNER_ADMIN
BOOTSTRAP_PASSWORD='EspacioQ-Recep-2026!' npx tsx --env-file=.env prisma/create-admin.ts --email reception@espacioq.test --name "Recepción Test" --role RECEPTION
```

First-owner wizard (JRN-3) only appears when the `user` collection is empty:
`mongosh espacio_q --eval 'db.user.deleteMany({}); db.session.deleteMany({})'` → open `/acceso` → "Crear cuenta propietaria y entrar". Re-run the commands above afterwards.

Cron / internal jobs: `POST /api/internal/jobs` with `Authorization: Bearer <CRON_SECRET>` or `Bearer <WEBHOOK_CRON_SECRET>` (both in /app/frontend/.env; this pod's backend/.env also has a WEBHOOK_CRON_SECRET for the old Emergent cron). An in-process scheduler (lib/jobs/scheduler.ts, Mongo lease `schedulerLeases`) processes the queue every 5 min (first run ~15 s after start).

Preview pod recycles can empty the `user` collection → re-run the two create-admin commands above (last done 2026-11-12). In the new Next.js-template project run them after creating /app/frontend/.env.

Email (Phase 2): real sends via Emergent-managed Resend. For tests that must really reach the provider use Resend test inboxes `delivered@resend.dev` / `delivered+<label>@resend.dev` (never real third-party addresses). Recipients on reserved test domains (example.com/.org/.net, *.test, *.invalid, espacioq-test.es) are intentionally NOT sent (stored as SIMULATED_LOCAL with reason).
