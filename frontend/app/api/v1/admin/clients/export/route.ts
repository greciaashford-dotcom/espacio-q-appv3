import { NextResponse } from "next/server";
import { getCurrentUser, canExportCrm } from "@/lib/auth/session";
import { exportClientsToXlsx } from "@/lib/domain/excel";
import { withDbGuard } from "@/lib/http/db-guard";

async function handleGET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canExportCrm(user)) {
    return NextResponse.json(
      { error: "No tienes permisos habilitados para exportar el CRM a Excel." },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("q") || undefined;
  const tag = url.searchParams.get("tag") || undefined;
  const colsParam = url.searchParams.get("cols");
  const columns = colsParam
    ? colsParam
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
    : undefined;

  const { buffer } = await exportClientsToXlsx({
    search,
    tag,
    columns,
    actorUserId: user.id,
  });

  const dateTag = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="clientes-espacio-q-${dateTag}.xlsx"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export const GET = withDbGuard(handleGET);
