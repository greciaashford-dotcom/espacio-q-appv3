import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { processDueJobsAndCampaigns } from "@/lib/jobs/worker";
import { syncScheduleWithGoogle } from "@/lib/integrations/google";
import { sweepOrphanSlotLocks } from "@/lib/db/slot-locks";
import { withDbGuard } from "@/lib/http/db-guard";

async function handlePOST(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || cronSecret.length < 16) {
    return NextResponse.json(
      { error: "CRON_SECRET no está configurado." },
      { status: 503 }
    );
  }

  // Acepta CRON_SECRET (manual/externo) o WEBHOOK_CRON_SECRET (cron programado de Emergent, /app/.emergent/crons.yml).
  const authHeader = request.headers.get("authorization") || "";
  const a = Buffer.from(authHeader);
  const secrets = [cronSecret, process.env.WEBHOOK_CRON_SECRET?.trim()].filter(
    (v): v is string => !!v && v.length >= 16
  );
  const authorized = secrets.some((secret) => {
    const b = Buffer.from(`Bearer ${secret}`);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });

  if (!authorized) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const syncGoogle = url.searchParams.get("syncGoogle") === "1";

  const jobStats = await processDueJobsAndCampaigns({
    nowUtc: new Date(),
    batchSize: 50,
  });

  const orphanLocksRemoved = await sweepOrphanSlotLocks();

  const googleSync = syncGoogle ? await syncScheduleWithGoogle() : null;

  return NextResponse.json(
    {
      ok: true,
      processedAt: new Date().toISOString(),
      jobStats,
      orphanLocksRemoved,
      googleSync,
    },
    { status: 200 }
  );
}

export const POST = withDbGuard(handlePOST);
