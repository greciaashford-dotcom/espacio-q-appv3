import { NextResponse } from "next/server";
import { processSignedEmailWebhook } from "@/lib/email/webhook";
import { withDbGuard } from "@/lib/http/db-guard";

async function handlePOST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader =
    request.headers.get("x-webhook-signature") ||
    request.headers.get("svix-signature");
  const timestampHeader =
    request.headers.get("x-webhook-timestamp") ||
    request.headers.get("svix-timestamp");

  const result = await processSignedEmailWebhook({
    rawBody,
    signatureHeader,
    timestampHeader,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result, { status: 200 });
}

export const POST = withDbGuard(handlePOST);
