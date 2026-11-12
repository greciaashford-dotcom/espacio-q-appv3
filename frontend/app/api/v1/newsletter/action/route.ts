import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmNewsletterSubscription, unsubscribeMarketing } from "@/lib/domain/newsletter";
import { isSameOrigin } from "@/lib/security/rate-limit";
import { withDbGuard } from "@/lib/http/db-guard";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), token: z.string().min(16).max(200) }),
  z.object({
    action: z.literal("unsubscribe"),
    email: z.string().trim().email("Introduce un email válido.").max(254).optional(),
    token: z.string().min(16).max(200).optional(),
  }),
]);

// Las acciones se ejecutan solo vía POST (los escáneres de correo abren enlaces GET).
async function handlePOST(req: Request) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  }

  if (parsed.data.action === "confirm") {
    const res = await confirmNewsletterSubscription(parsed.data.token);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true, alreadyConfirmed: res.alreadyConfirmed });
  }

  const res = await unsubscribeMarketing({
    email: parsed.data.email,
    token: parsed.data.token,
  });
  // Respuesta neutra: no revelamos si la dirección existía.
  return NextResponse.json({ ok: true, processed: res.ok });
}

export const POST = withDbGuard(handlePOST);
