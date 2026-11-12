import { NextResponse } from "next/server";
import imageSize from "image-size";
import { prisma } from "@/lib/db/prisma";
import { canManageCatalogOrCms, getCurrentUser } from "@/lib/auth/session";
import {
  detectImageMimeFromBuffer,
  validateExternalImageUrl,
} from "@/lib/security/ssrf";
import { generateOpaqueToken } from "@/lib/security/crypto";
import { isSameOrigin } from "@/lib/security/rate-limit";
import { putMediaObject } from "@/lib/storage/object-storage";
import { withDbGuard } from "@/lib/http/db-guard";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_DIMENSION_PX = 6000;

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

async function saveBufferToMediaStorage(buf: Buffer, mime: string) {
  const ext = MIME_TO_EXT[mime];
  if (!ext) {
    throw new Error(
      "Formato de imagen no permitido. Usa JPEG, PNG, WebP o AVIF (no se aceptan SVG sin sanear)."
    );
  }

  let width = 1200;
  let height = 1500;
  try {
    const dim = imageSize(buf);
    if (dim.width && dim.height) {
      width = dim.width;
      height = dim.height;
    }
  } catch {
    // AVIF o variante no leída por image-size mantiene dimensiones por defecto seguras
  }

  if (width > MAX_DIMENSION_PX || height > MAX_DIMENSION_PX) {
    throw new Error(
      `Las dimensiones (${width}x${height}px) superan el límite máximo de ${MAX_DIMENSION_PX}px.`
    );
  }

  const fileName = `eq_${Date.now()}_${generateOpaqueToken(8).replace(/[^a-zA-Z0-9]/g, "")}.${ext}`;
  // Emergent Object Storage (persistente entre reinicios; servido por app/media/[filename]/route.ts)
  await putMediaObject(fileName, buf, mime);

  return {
    src: `/media/${fileName}`,
    width,
    height,
    sizeBytes: buf.length,
  };
}

async function handlePOST(req: Request) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user || !canManageCatalogOrCms(user)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") || "";

  // Modo 1: Subida multipart desde dispositivo
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Selecciona un archivo de imagen válido." },
        { status: 400 }
      );
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "El archivo supera el tamaño máximo de 8 MB." },
        { status: 400 }
      );
    }

    const arrayBuf = await file.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    const realMime = detectImageMimeFromBuffer(buf);

    if (!realMime) {
      return NextResponse.json(
        {
          error:
            "El archivo no es una imagen JPEG, PNG, WebP o AVIF válida (no se aceptan SVG ni ejecutables).",
        },
        { status: 400 }
      );
    }

    try {
      const saved = await saveBufferToMediaStorage(buf, realMime);
      const internalName =
        String(formData.get("internalName") || "").trim() ||
        file.name.replace(/\.[^.]+$/, "");
      const altText =
        String(formData.get("altText") || "").trim() || internalName;
      const category = String(formData.get("category") || "galeria").trim();
      const licenseNote =
        String(formData.get("licenseNote") || "").trim() || null;

      const asset = await prisma.mediaAsset.create({
        data: {
          internalName,
          src: saved.src,
          sourceType: "UPLOAD",
          mimeType: realMime,
          width: saved.width,
          height: saved.height,
          sizeBytes: saved.sizeBytes,
          altText,
          category,
          licenseNote,
          isProvisional: false,
          publicVisible: true,
        },
      });

      await prisma.auditEvent.create({
        data: {
          actorUserId: user.id,
          action: "MEDIA_UPLOAD",
          entityType: "MediaAsset",
          entityId: asset.id,
          summary: `Subida de imagen: ${asset.internalName}`,
        },
      });

      return NextResponse.json({ ok: true, asset });
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message || "No se pudo procesar la imagen." },
        { status: 400 }
      );
    }
  }

  // Modo 2: Alta mediante URL externa HTTPS (referencia o importación con protección anti-SSRF)
  const body = await req.json().catch(() => null);
  if (!body || typeof body.url !== "string") {
    return NextResponse.json(
      { error: "Proporciona una URL HTTPS válida." },
      { status: 400 }
    );
  }

  const validation = await validateExternalImageUrl(body.url);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const importCopy = Boolean(body.importCopy);
  const internalName =
    String(body.internalName || "").trim() || "Imagen externa";
  const altText = String(body.altText || "").trim() || internalName;
  const category = String(body.category || "galeria").trim();
  const licenseNote = String(body.licenseNote || "").trim() || null;

  if (importCopy) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const remoteRes = await fetch(validation.url, {
        redirect: "error", // Evita saltos SSRF por redirección
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!remoteRes.ok) {
        return NextResponse.json(
          {
            error: `El servidor remoto devolvió HTTP ${remoteRes.status}.`,
          },
          { status: 400 }
        );
      }

      const contentLen = Number(remoteRes.headers.get("content-length") || 0);
      if (contentLen > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: "La imagen remota supera el límite de 8 MB." },
          { status: 400 }
        );
      }

      const buf = Buffer.from(await remoteRes.arrayBuffer());
      if (buf.length > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: "La imagen remota supera el límite de 8 MB." },
          { status: 400 }
        );
      }

      const realMime = detectImageMimeFromBuffer(buf);
      if (!realMime) {
        return NextResponse.json(
          {
            error:
              "La URL no devuelve un recurso de imagen JPEG, PNG, WebP o AVIF válido.",
          },
          { status: 400 }
        );
      }

      const saved = await saveBufferToMediaStorage(buf, realMime);
      const asset = await prisma.mediaAsset.create({
        data: {
          internalName,
          src: saved.src,
          sourceType: "IMPORTED_URL",
          mimeType: realMime,
          width: saved.width,
          height: saved.height,
          sizeBytes: saved.sizeBytes,
          altText,
          category,
          licenseNote,
          isProvisional: false,
          publicVisible: true,
        },
      });

      return NextResponse.json({ ok: true, asset });
    } catch (err: any) {
      return NextResponse.json(
        {
          error:
            err?.message ||
            "No se pudo importar la imagen remota (redirección bloqueada o tiempo agotado).",
        },
        { status: 400 }
      );
    }
  }

  // Referencia directa a dominio HTTPS autorizado
  const asset = await prisma.mediaAsset.create({
    data: {
      internalName,
      src: validation.url,
      sourceType: "EXTERNAL_URL",
      mimeType: "image/jpeg",
      width: 1200,
      height: 1500,
      sizeBytes: 0,
      altText,
      category,
      licenseNote,
      isProvisional: false,
      publicVisible: true,
    },
  });

  return NextResponse.json({ ok: true, asset });
}

export const POST = withDbGuard(handlePOST);
