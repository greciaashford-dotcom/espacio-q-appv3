import { NextResponse } from "next/server";
import { getCurrentUser, canManageCatalogOrCms } from "@/lib/auth/session";
import { executeClientsXlsxImport } from "@/lib/domain/excel";
import { isSameOrigin } from "@/lib/security/rate-limit";
import { withDbGuard } from "@/lib/http/db-guard";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // 5 MB

async function handlePOST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user || !canManageCatalogOrCms(user)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const modeRaw = String(formData.get("mode") || "CREATE_ONLY");
    const dryRun = String(formData.get("dryRun") || "true") === "true";

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Adjunta un archivo Excel (.xlsx) válido." },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json(
        { error: "Solo se admiten libros Excel en formato moderno (.xlsx)." },
        { status: 400 }
      );
    }

    if (file.size > MAX_IMPORT_BYTES) {
      return NextResponse.json(
        { error: "El archivo supera el límite máximo permitido de 5 MB." },
        { status: 413 }
      );
    }

    const mode = modeRaw === "UPSERT_BY_EMAIL" ? "UPSERT_BY_EMAIL" : "CREATE_ONLY";
    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await executeClientsXlsxImport({
      fileBuffer: buffer,
      fileName: file.name.slice(0, 120),
      mode,
      dryRun,
      actorUserId: user.id,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "No se pudo procesar el archivo Excel." },
      { status: 500 }
    );
  }
}

export const POST = withDbGuard(handlePOST);
