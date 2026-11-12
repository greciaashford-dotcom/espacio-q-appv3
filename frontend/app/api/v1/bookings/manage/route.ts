import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { hashToken } from "@/lib/security/crypto";
import {
  cancelBookingAtomic,
  rescheduleBookingAtomic,
} from "@/lib/domain/booking";
import { isSameOrigin } from "@/lib/security/rate-limit";
import { processDueJobsAndCampaigns } from "@/lib/jobs/worker";
import { withDbGuard } from "@/lib/http/db-guard";

const manageSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("confirm_attendance"),
    token: z.string().min(16).max(200),
  }),
  z.object({
    action: z.literal("cancel"),
    token: z.string().min(16).max(200),
    reason: z.string().trim().max(300).optional(),
  }),
  z.object({
    action: z.literal("reschedule"),
    token: z.string().min(16).max(200),
    newDateStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    newStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  }),
]);

// Todas las mutaciones de gestión de cita se ejecutan únicamente por POST validado (nunca GET).
async function handlePOST(req: Request) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }

  const parsed = manageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Solicitud de gestión no válida." },
      { status: 400 }
    );
  }

  const tokenHash = hashToken(parsed.data.token);
  const appt = await prisma.appointment.findUnique({
    where: { manageTokenHash: tokenHash },
  });

  if (
    !appt ||
    appt.manageTokenRevoked ||
    appt.manageTokenExpiresAt < new Date()
  ) {
    return NextResponse.json(
      { error: "El enlace de gestión no es válido o ha caducado." },
      { status: 404 }
    );
  }

  if (parsed.data.action === "confirm_attendance") {
    // La confirmación de asistencia del cliente es un dato separado del estado de aceptación de la cita (Sección 9)
    await prisma.appointment.update({
      where: { id: appt.id },
      data: { attendanceConfirmedAt: new Date() },
    });
    await prisma.appointmentEvent.create({
      data: {
        appointmentId: appt.id,
        eventType: "ATTENDANCE_CONFIRMED",
        fromStatus: appt.status,
        toStatus: appt.status,
        actorType: "CLIENT",
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "cancel") {
    const res = await cancelBookingAtomic({
      appointmentId: appt.id,
      reason: parsed.data.reason,
      actorType: "CLIENT",
    });
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: res.status });
    }
    await processDueJobsAndCampaigns({ batchSize: 5 }).catch(() => null);
    return NextResponse.json({ ok: true, referenceCode: res.referenceCode });
  }

  const res = await rescheduleBookingAtomic({
    appointmentId: appt.id,
    newDateStr: parsed.data.newDateStr,
    newStartTime: parsed.data.newStartTime,
    actorType: "CLIENT",
  });

  if (!res.ok) {
    return NextResponse.json(
      {
        error: res.error,
        alternatives: (res.alternatives ?? []).map((s) => ({
          time: s.time,
          endTime: s.endTime,
        })),
      },
      { status: res.status }
    );
  }

  await processDueJobsAndCampaigns({ batchSize: 5 }).catch(() => null);
  return NextResponse.json({ ok: true, appointment: res.appointment });
}

export const POST = withDbGuard(handlePOST);
