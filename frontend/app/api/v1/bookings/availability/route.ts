import { NextResponse } from "next/server";
import { z } from "zod";
import { calculateAvailableSlots } from "@/lib/domain/booking";
import { withDbGuard } from "@/lib/http/db-guard";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  serviceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha YYYY-MM-DD requerido"),
  professionalId: z.string().optional(),
});

async function handleGET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    serviceId: searchParams.get("serviceId"),
    date: searchParams.get("date"),
    professionalId: searchParams.get("professionalId") || "any",
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Parámetros inválidos." },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const result = await calculateAvailableSlots({
    serviceId: parsed.data.serviceId,
    dateStr: parsed.data.date,
    professionalId: parsed.data.professionalId || "any",
  });

  // Sin PII: solo devuelve horas libres y cantidad/IDs públicos de profesionales disponibles
  return NextResponse.json(
    {
      bookingReady: result.bookingReady,
      standbyReason: result.standbyReason,
      dateStr: result.dateStr,
      slots: result.slots.map((s) => ({
        time: s.time,
        endTime: s.endTime,
        availableCount: s.availableProfessionalIds.length,
      })),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export const GET = withDbGuard(handleGET);
