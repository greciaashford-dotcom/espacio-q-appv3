# ESPACIO Q · Plataforma Web y Panel de Gestión (Madrid, España)

Aplicación web integral de producción para **ESPACIO Q** (salón de belleza en Madrid, España), construida con **Next.js 14 App Router**, **TypeScript**, **Tailwind CSS** (paleta editorial **Zen Linen**), **MongoDB** (driver oficial `mongodb`, capa de datos propia `lib/db/prisma.ts` con API compatible con Prisma; anti-solapamiento mediante bloqueos atómicos por minuto con índice único).

---

## Características Principales

1. **Web Pública Editorial (Zen Linen & WCAG 2.2 AA)**
   - Hero inmersivo 3D en profundidad Z (`components/ui/perspective-tunnel-hero.tsx`) conducido por scroll nativo con ángulo áureo, zona central despejada, enlace «Saltar animación» y degradación estática ante `prefers-reduced-motion` o desactivación desde CMS.
   - Catálogo de servicios (`/servicios`, `/servicios/[slug]`), equipo (`/equipo`), galería (`/galeria`), contacto (`/contacto` con enlace oficial a Google Maps de ESPACIO Q) y motor de reservas online (`/reservar` y gestión privada vía token opaco `/reservar/gestion/[token]`).
   - Diálogo único y formulario en footer de Newsletter (`components/ui/newsletter-dialog.tsx`) con consentimiento explícito desmarcado por defecto, sistema **double opt-in** real y baja firmada HMAC en un clic (`/newsletter/baja`).
2. **Páginas Legales Completas para España (100 % Editables desde Dashboard)**
   - `/aviso-legal` (LSSI-CE), `/terminos-y-condiciones`, `/condiciones-reserva`, `/privacidad` (RGPD / LOPDGDD) y `/cookies` (con gestor de consentimiento granular sin bloquear lectura).
   - Interpolación automática de datos fiscales/legales configurados en `/admin/configuracion` (mostrando marcadores honestos `[Dato pendiente de configurar...]` mientras el titular no los complete, sin inventar NIF ni razón social).
3. **CMS Integral Sin Tocar Código (`/admin/contenido` y `/admin/multimedia`)**
   - Edición con flujo **Borrador / Publicado** e historial de versiones (`ContentRevision`) para cabecera, pie de página, hero 3D, todas las secciones de portada, páginas secundarias, textos del asistente de reserva, textos de newsletter y los 5 documentos legales.
   - Biblioteca multimedia con subida a Emergent Object Storage validada por magic bytes (bloqueando SVG ejecutable) e importación/referencia HTTPS con defensa anti-SSRF por resolución DNS.
4. **Motor de Reservas Atómico y Horarios en `Europe/Madrid`**
   - Cálculo de disponibilidad en servidor respetando cambios de hora DST (`Europe/Madrid`), turnos partidos, excepciones/festivos, intersección salón ∩ profesional y buffers pre/post servicio.
   - Protección contra condiciones de carrera mediante documentos `slotLocks` (índice único `resource+minute`) para cada `Occupancy` / `ResourceReservation` activa, con compensación sin transacciones, snapshots inmutables del servicio/precio e idempotencia.
   - Sincronización preparada para **Google Business Profile API (OAuth 2.0)** y **Google Places API**, con fallback seguro a **Horario Manual** y detector de conflictos sobre citas futuras (`ScheduleConflictAlert`) sin cancelaciones automáticas.
5. **CRM, Excel `.xlsx` Real y Marketing con Supresión LSSI/RGPD**
   - Gestión de clientes (`/admin/clientes`), anonimización irreversible RGPD y descarga de plantilla, previsualización Dry-Run, importación y exportación en formato real **`.xlsx`** (`exceljs`) con protección frente a inyección de fórmulas (`=`, `+`, `-`, `@`) y sin activar jamás consentimiento comercial por importar un archivo.
   - Cola persistente `NotificationJob`, buzón auditable `EmailDelivery` (adaptador Resend o `SIMULATED_LOCAL` honesto en desarrollo), campañas segmentadas con revalidación en tiempo real contra `Suppression` y receptor de webhooks firmados HMAC (`/api/webhooks/email`).

---

## Estructura y puesta en marcha (Emergent, plantilla Next.js)

La aplicación es **solo Next.js** (`/app/frontend`): páginas SSR, server actions, route handlers `/api/*`, `/media/*`, `/health`. No necesita FastAPI ni Python. Guía completa de publicación y migración: `/app/memory/DEPLOYMENT.md`.

| | Comando (en `/app/frontend`) |
|---|---|
| Desarrollo | `yarn dev` → `next dev -H 0.0.0.0 -p ${PORT:-3000}` (`yarn start:dev` = puerto 3000 fijo) |
| Build de producción | `yarn build` → `next build` (sin `output: "standalone"`: `public/` y `.next/static` se sirven desde el proyecto) |
| Arranque de producción | `yarn start` → `next start -H 0.0.0.0 -p ${PORT:-3000}` (8080 al publicar). El `prestart` compila antes si `.next` no tiene build o está desactualizada |
| Health check | `GET /health` → `200 {"status":"ok"}` (sin depender de MongoDB) |

- Base de datos: solo `MONGO_URL` y `DB_NAME`. Índices únicos/secundarios generados desde `prisma/schema.prisma` (`yarn db:gen` → `lib/db/schema.generated.ts`) y creados al conectar. Sin transacciones multi-documento. Si MongoDB no responde, `/api/*` devuelve `503 {"error":"Base de datos no disponible temporalmente."}`.
- Semilla idempotente: `yarn db:seed` (también se carga automáticamente en segundo plano al arrancar si la base está vacía, `instrumentation-node.ts`).
- Alta de usuarios por consola: `BOOTSTRAP_PASSWORD=... npx tsx --env-file=.env prisma/create-admin.ts --email x@y --name "Nombre" --role OWNER_ADMIN`.
- Cola de trabajos: planificador interno (cada 5 min, lease en MongoDB) + `POST /api/internal/jobs` con `Bearer CRON_SECRET` o `Bearer WEBHOOK_CRON_SECRET`. `/app/.emergent/crons.yml` (cada 15 min) es solo un respaldo.
- Variables: plantilla en `frontend/.env.example`; lista de secretos de publicación en `/app/memory/DEPLOYMENT.md`.
- OpenAPI: `GET /api/openapi.json`.
- `backend/server.py` solo existe en el pod de preview antiguo (plantilla mono): relay `/api/*` → Next.js sin lógica. En el proyecto de plantilla Next.js se elimina la carpeta `backend/`.

---

## Verificación, Tests y Compilación de Producción

```bash
cd frontend
yarn typecheck   # TypeScript estricto
yarn lint        # ESLint
yarn test        # Vitest contra MongoDB real (MONGO_URL/DB_NAME de .env)
yarn build       # next build
yarn start       # next start en $PORT
```

---

## Worker de Notificaciones y Sincronización Programada

El planificador interno procesa la cola cada 5 min. Manualmente o desde un cron externo, contra el endpoint interno protegido con `CRON_SECRET`:

```bash
curl -X POST "https://tu-dominio.es/api/internal/jobs?syncGoogle=1" \
  -H "Authorization: Bearer $CRON_SECRET"
```

También puede ejecutarse manualmente en cualquier momento desde **`/admin/automatizaciones` → «Procesar cola pendiente ahora»**.

---

## Checklist Antes de Abrir Tráfico Real en Producción

1. **Datos fiscales y de contacto (`/admin/configuracion`):** completar Razón Social/Titular, NIF/CIF, domicilio social en Madrid, datos registrales (si aplica), teléfono y correo de contacto/privacidad para sustituir todos los avisos `[Dato pendiente de configurar...]`.
2. **Catálogo, equipo y horarios (`/admin/servicios`, `/admin/equipo`, `/admin/horarios`):** dar de alta servicios reales con tarifas/duraciones, asignar profesionales, confirmar el horario semanal y activar `Habilitar reservas online públicas`.
3. **Fotografías propias (`/admin/multimedia`):** sustituir las 6 imágenes editoriales provisionales de referencia por fotografías reales del salón en Madrid.
4. **Email:** Resend gestionado por Emergent (`EMERGENT_EMAIL_KEY`, `EMAIL_FROM_NAME`); para campañas, verificar el dominio propio espacioq.es. `EMAIL_WEBHOOK_SECRET` firma los webhooks en `/api/webhooks/email`.
5. **Google Business Profile / Places (opcional):** configurar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_BUSINESS_LOCATION_ID` (o `GOOGLE_PLACES_API_KEY` + `GOOGLE_PLACE_ID`) para sincronización automática; sin ellos el sistema opera de forma completa en modo **Horario Manual**.
