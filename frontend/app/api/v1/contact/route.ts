import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit, getClientIdentifier, isSameOrigin } from "@/lib/security/rate-limit";
import { dispatchEmailWithAudit, renderZenLinenEmailLayout } from "@/lib/email/provider";
import { sendSalonContactNotice } from "@/lib/email/notices";
import { withDbGuard } from "@/lib/http/db-guard";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email("Introduce un email válido.").max(254),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  subject: z.string().trim().max(160).optional().or(z.literal("")),
  message: z.string().trim().min(10).max(3000),
  privacyAccepted: z.literal(true, {
    errorMap: () => ({ message: "Debes aceptar la Política de Privacidad." }),
  }),
  website: z.string().max(0).optional(), // honeypot antispam: debe llegar vacío
});

async function handlePOST(req: Request) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Revisa los campos del formulario." },
      { status: 400 }
    );
  }

  const allowed = await checkRateLimit({
    scope: "contact",
    identifier: getClientIdentifier(req),
    limit: 4,
    windowSec: 900,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Has enviado varias consultas seguidas. Inténtalo más tarde." },
      { status: 429 }
    );
  }

  const data = parsed.data;
  const msg = await prisma.contactMessage.create({
    data: {
      name: data.name,
      email: data.email.toLowerCase(),
      phone: data.phone || null,
      subject: data.subject || null,
      message: data.message,
    },
  });

  // Acuse de recibo: si falla el correo, la consulta queda guardada y visible en el panel.
  const rendered = renderZenLinenEmailLayout({
    heading: "Hemos recibido tu consulta",
    paragraphs: [
      `Hola ${data.name},`,
      "Gracias por escribir a ESPACIO Q. Hemos registrado tu mensaje y te responderemos lo antes posible en horario de apertura.",
    ],
  });
  await dispatchEmailWithAudit({
    dedupKey: `contact-ack:${msg.id}`,
    category: "TRANSACTIONAL",
    templateKey: "CONTACT_ACK",
    toEmail: msg.email,
    subject: "Hemos recibido tu consulta · ESPACIO Q Madrid",
    htmlBody: rendered.html,
    textBody: rendered.text,
    retryViaQueue: true,
  }).catch(() => null);

  // Aviso interno al salón (Reply-To = remitente). Sin dirección configurada se omite (aviso en el panel).
  await sendSalonContactNotice(msg).catch(() => null);

  return NextResponse.json({ ok: true });
}

export const POST = withDbGuard(handlePOST);
