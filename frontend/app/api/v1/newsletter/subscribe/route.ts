import { NextResponse } from "next/server";
import { z } from "zod";
import { requestNewsletterSubscription } from "@/lib/domain/newsletter";
import { checkRateLimit, getClientIdentifier, isSameOrigin } from "@/lib/security/rate-limit";
import { withDbGuard } from "@/lib/http/db-guard";

const schema = z.object({
  email: z.string().trim().email("Introduce un email válido.").max(254),
  firstName: z.string().trim().max(80).optional(),
  consentAccepted: z.literal(true, {
    errorMap: () => ({ message: "Debes aceptar el consentimiento explícito." }),
  }),
  source: z.enum(["newsletter_dialog", "footer_form"]).optional(),
});

async function handlePOST(req: Request) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Datos no válidos." },
      { status: 400 }
    );
  }

  const allowed = await checkRateLimit({
    scope: "newsletter",
    identifier: getClientIdentifier(req),
    limit: 5,
    windowSec: 600,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Has realizado demasiadas solicitudes. Inténtalo de nuevo en unos minutos." },
      { status: 429 }
    );
  }

  const result = await requestNewsletterSubscription({
    email: parsed.data.email,
    firstName: parsed.data.firstName,
    consentAccepted: true,
    source: parsed.data.source,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  // Nunca devolvemos el token de verificación al navegador.
  return NextResponse.json({ ok: true, state: result.state, message: result.message });
}

export const POST = withDbGuard(handlePOST);
