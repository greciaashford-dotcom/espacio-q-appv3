import { NextResponse } from "next/server";
import { z } from "zod";
import { createBookingAtomic } from "@/lib/domain/booking";
import { requestNewsletterSubscription } from "@/lib/domain/newsletter";
import {
  checkRateLimit,
  getClientIdentifier,
  isSameOrigin,
} from "@/lib/security/rate-limit";
import { processDueJobsAndCampaigns } from "@/lib/jobs/worker";
import { withDbGuard } from "@/lib/http/db-guard";

const createBookingSchema = z.object({
  serviceId: z.string().min(1),
  professionalId: z.string().min(1).default("any"),
  dateStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  customerName: z.string().trim().min(2, "Introduce tu nombre.").max(120),
  customerEmail: z.string().trim().email("Introduce un email válido.").max(254),
  customerPhone: z
    .string()
    .trim()
    .min(6, "Introduce un teléfono de contacto válido.")
    .max(30),
  customerNotes: z.string().trim().max(500).optional().or(z.literal("")),
  couponCode: z.string().trim().max(40).optional().or(z.literal("")),
  termsAccepted: z.literal(true, {
    errorMap: () => ({
      message:
        "Debes aceptar las Condiciones de Reserva y la Política de Privacidad.",
    }),
  }),
  marketingOptIn: z.boolean().optional().default(false),
  idempotencyKey: z.string().trim().min(8).max(120),
});

async function handlePOST(req: Request) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Revisa los datos de tu reserva." },
      { status: 400 }
    );
  }

  const allowed = await checkRateLimit({
    scope: "booking_create",
    identifier: getClientIdentifier(req),
    limit: 10,
    windowSec: 600,
  });
  if (!allowed) {
    return NextResponse.json(
      {
        error:
          "Has realizado demasiados intentos seguidos. Espera unos minutos antes de volver a intentarlo.",
      },
      { status: 429 }
    );
  }

  const d = parsed.data;
  const result = await createBookingAtomic({
    serviceId: d.serviceId,
    professionalId: d.professionalId,
    dateStr: d.dateStr,
    startTime: d.startTime,
    customerName: d.customerName,
    customerEmail: d.customerEmail,
    customerPhone: d.customerPhone,
    customerNotes: d.customerNotes || null,
    couponCode: d.couponCode || null,
    idempotencyKey: d.idempotencyKey,
    actorType: "CLIENT",
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        alternatives: (result.alternatives ?? []).map((s) => ({
          time: s.time,
          endTime: s.endTime,
        })),
      },
      { status: result.status }
    );
  }

  // Si marcó expresamente marketingOptIn, inicia el double opt-in separado sin bloquear la cita
  if (d.marketingOptIn && !result.idempotentReplay) {
    await requestNewsletterSubscription({
      email: d.customerEmail,
      firstName: d.customerName.split(/\s+/)[0],
      consentAccepted: true,
      source: "booking_form",
    }).catch(() => null);
  }

  // Procesar de inmediato el correo de confirmación encolado (si falla el proveedor, la reserva persiste intacta)
  await processDueJobsAndCampaigns({ batchSize: 5 }).catch(() => null);

  return NextResponse.json({
    ok: true,
    idempotentReplay: result.idempotentReplay,
    appointment: result.appointment,
    manageUrl: result.manageToken
      ? `/reservar/gestion/${encodeURIComponent(result.manageToken)}`
      : null,
  });
}

export const POST = withDbGuard(handlePOST);
