import { prisma, sequentialWrites } from "@/lib/db/prisma";
import {
  COOKIES_MAPS_MENTION,
  DEFAULT_CMS_PAGES,
  DEFAULT_CONTACT_DIRECTIONS,
  DEFAULT_GALLERY_RAIL_ITEMS,
  DEFAULT_INTRO_FLIP_IMAGES,
  DEFAULT_MAPS_COOKIE_TEXTS,
  DEFAULT_MEDIA_ASSETS,
  HOME_SEO,
  LEGACY_HOME_SEO_TITLE,
  DEFAULT_TEAM_SHOWCASE_MEMBERS,
  type LegalDocumentData,
  type SalonHeroContent,
} from "@/lib/domain/cms-defaults";
import {
  DEFAULT_PROFESSIONALS_CATALOG,
  DEFAULT_SERVICE_CATEGORIES,
  DEFAULT_SERVICES_CATALOG,
  ESPACIO_Q_LOCATION_METADATA,
  ESPACIO_Q_WEEKLY_SCHEDULE,
} from "@/lib/domain/default-services-catalog";
import type { Prisma } from "@/lib/db/prisma";

/**
 * Normaliza home_sections para garantizar que la segunda sección (intro) disponga
 * siempre de la lista editable flipImages (migrando imageUrl legado si existiera).
 */
export function normalizeHomeSectionsData<T = Record<string, any>>(raw: T): T {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const clone: Record<string, any> = structuredClone(raw as Record<string, any>);
  const intro =
    clone.intro && typeof clone.intro === "object" ? { ...clone.intro } : {};

  if (!Array.isArray(intro.flipImages) || intro.flipImages.length === 0) {
    const legacyUrl =
      typeof intro.imageUrl === "string" ? intro.imageUrl.trim() : "";
    const legacyTitle =
      typeof intro.imageAlt === "string" && intro.imageAlt.trim()
        ? intro.imageAlt.trim()
        : DEFAULT_INTRO_FLIP_IMAGES[0].title;

    const merged = [...DEFAULT_INTRO_FLIP_IMAGES];
    if (legacyUrl) {
      const existingIdx = merged.findIndex((item) => item.url === legacyUrl);
      if (existingIdx > 0) {
        const [found] = merged.splice(existingIdx, 1);
        merged.unshift({ title: legacyTitle || found.title, url: legacyUrl });
      } else if (existingIdx === -1) {
        merged.unshift({ title: legacyTitle, url: legacyUrl });
      }
    }
    intro.flipImages = merged;
  }

  delete intro.imageUrl;
  delete intro.imageAlt;
  clone.intro = intro;

  // Enriquecer experience.pillars con campos editables badge y url (enlace externo o biblioteca) si provienen de versiones previas
  if (clone.experience && typeof clone.experience === "object") {
    const exp = { ...clone.experience };
    const defaultBadges = [
      "Escucha y valoración",
      "Tiempo dedicado",
      "Cuidado continuo",
    ];
    const defaultUrls = [
      exp.imageUrl ||
        "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?auto=format&fit=crop&w=1000&q=80",
    ];

    if (Array.isArray(exp.pillars)) {
      exp.pillars = exp.pillars.map((pillar: Record<string, any>, idx: number) => {
        if (!pillar || typeof pillar !== "object") return pillar;
        return {
          ...pillar,
          badge:
            "badge" in pillar
              ? pillar.badge
              : defaultBadges[idx] ?? `Paso 0${idx + 1}`,
          url:
            "url" in pillar
              ? pillar.url
              : defaultUrls[idx % defaultUrls.length],
        };
      });
    }
    clone.experience = exp;
  }

  // Enriquecer teamSection con showcaseMembers (mosaico interactivo del equipo) si procede de versiones previas
  const team =
    clone.teamSection && typeof clone.teamSection === "object"
      ? { ...clone.teamSection }
      : { visible: true };
  if (!Array.isArray(team.showcaseMembers)) {
    team.showcaseMembers = structuredClone(DEFAULT_TEAM_SHOWCASE_MEMBERS);
  }
  if (!("provisionalNote" in team)) {
    team.provisionalNote =
      "Perfiles de muestra iniciales configurables desde el panel del salón.";
  }
  clone.teamSection = team;

  // Enriquecer gallerySection con railItems (galería colgante interactiva de peinados y cortes) si procede de versiones previas
  const gallery =
    clone.gallerySection && typeof clone.gallerySection === "object"
      ? { ...clone.gallerySection }
      : { visible: true };
  if (!Array.isArray(gallery.railItems)) {
    gallery.railItems = structuredClone(DEFAULT_GALLERY_RAIL_ITEMS);
  }
  clone.gallerySection = gallery;

  return clone as T;
}

/**
 * Normaliza page_galeria para garantizar que la galería colgante interactiva
 * disponga siempre de los campos y elementos editables desde el dashboard.
 */
export function normalizeGaleriaPageData<T = Record<string, any>>(raw: T): T {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const clone: Record<string, any> = structuredClone(raw as Record<string, any>);
  if (!("railEyebrow" in clone)) clone.railEyebrow = "EXPOSICIÓN INTERACTIVA";
  if (!("railTitle" in clone)) clone.railTitle = "Peinados y cortes realizados";
  if (!("railCaption" in clone)) {
    clone.railCaption =
      "Recorre el riel para iluminar cada trabajo, deslízalo o púlsalo para girar el cuadro y leer los detalles técnicos del corte o peinado.";
  }
  if (!Array.isArray(clone.railItems)) {
    clone.railItems = structuredClone(DEFAULT_GALLERY_RAIL_ITEMS);
  }
  if (!("archiveTitle" in clone)) {
    clone.archiveTitle = "Atmósfera y espacio del salón";
  }
  return clone as T;
}

/**
 * Normaliza page_equipo para asegurar la presencia de showcaseMembers editables desde el panel.
 */
export function normalizeEquipoPageData<T = Record<string, any>>(raw: T): T {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const clone: Record<string, any> = structuredClone(raw as Record<string, any>);
  if (!Array.isArray(clone.showcaseMembers)) {
    clone.showcaseMembers = structuredClone(DEFAULT_TEAM_SHOWCASE_MEMBERS);
  }
  if (!("provisionalNote" in clone)) {
    clone.provisionalNote =
      "Perfiles representativos de muestra mientras se incorporan las fotografías definitivas del equipo de ESPACIO Q.";
  }
  return clone as T;
}

/**
 * Los borradores solo se muestran a personal autenticado con permiso de CMS.
 * Import dinámico para no acoplar scripts (seed) a next/headers.
 */
async function canViewDrafts(requested?: boolean): Promise<boolean> {
  if (!requested) return false;
  try {
    const { getCurrentUser, canManageCatalogOrCms } = await import("@/lib/auth/session");
    const user = await getCurrentUser();
    return Boolean(user && canManageCatalogOrCms(user));
  } catch {
    return false;
  }
}

export async function ensureBaseCmsAndSettings() {
  const settings = await prisma.salonSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      brandName: "ESPACIO Q",
      tagline: "Un espacio para cuidar de ti",
      city: ESPACIO_Q_LOCATION_METADATA.city,
      country: ESPACIO_Q_LOCATION_METADATA.country,
      addressLine: ESPACIO_Q_LOCATION_METADATA.addressLine,
      postalCode: ESPACIO_Q_LOCATION_METADATA.postalCode,
      neighborhood: ESPACIO_Q_LOCATION_METADATA.neighborhood,
      phone: ESPACIO_Q_LOCATION_METADATA.phone,
      googleMapsUrl: ESPACIO_Q_LOCATION_METADATA.googleMapsUrl,
      timezone: "Europe/Madrid",
      currency: "EUR",
      locale: "es-ES",
      slotIntervalMin: 15,
      publicBookingEnabled: true,
      scheduleConfirmed: true,
    },
  });

  const existingMediaCount = await prisma.mediaAsset.count({
    where: { category: "hero" },
  });
  if (existingMediaCount === 0) {
    for (const asset of DEFAULT_MEDIA_ASSETS) {
      await prisma.mediaAsset.upsert({
        where: { id: asset.id },
        update: {},
        create: asset,
      });
    }
  }

  await ensureDefaultServicesCatalog();
  await ensureDefaultProfessionalsCatalog();
  await ensureDefaultWorkingSchedule();

  for (const page of DEFAULT_CMS_PAGES) {
    const existing = await prisma.pageContent.findUnique({
      where: { key: page.key },
    });
    if (!existing) {
      await prisma.pageContent.create({
        data: {
          key: page.key,
          title: page.title,
          category: page.category,
          slug: page.slug,
          draftData: page.data as Prisma.InputJsonValue,
          publishedData: page.data as Prisma.InputJsonValue,
          hasUnpublished: false,
          isPublished: true,
          version: 1,
          seoTitle: page.seoTitle,
          seoDescription: page.seoDescription,
        },
      }).catch((e: any) => {
        // Arranque en frío: otra petición concurrente ya creó el bloque
        if (e?.code !== "P2002") throw e;
      });
    }
  }

  await migrateCmsDefaults();
  return settings;
}

type CmsData = Record<string, any>;

/** Añade valores por defecto nuevos a bloques ya existentes sin pisar ediciones del salón. */
async function patchCmsBlock(key: string, patch: (data: CmsData) => CmsData | null) {
  const page = await prisma.pageContent.findUnique({ where: { key } });
  if (!page) return;
  const pub = patch((page.publishedData ?? {}) as CmsData);
  const draft = patch((page.draftData ?? {}) as CmsData);
  if (!pub && !draft) return;
  await prisma.pageContent.update({
    where: { key },
    data: {
      publishedData: (pub ?? page.publishedData) as Prisma.InputJsonValue,
      draftData: (draft ?? page.draftData) as Prisma.InputJsonValue,
    },
  });
}

const fillMissing = (extra: CmsData) => (data: CmsData) => {
  const missing = Object.keys(extra).filter((k) => !(k in data));
  if (missing.length === 0) return null;
  return { ...data, ...Object.fromEntries(missing.map((k) => [k, extra[k]])) };
};

export async function migrateCmsDefaults() {
  const home = await prisma.pageContent.findUnique({ where: { key: "home_hero" } });
  if (home && (!home.seoTitle || home.seoTitle === LEGACY_HOME_SEO_TITLE)) {
    await prisma.pageContent.update({ where: { key: "home_hero" }, data: HOME_SEO });
  }
  await patchCmsBlock("page_contacto", fillMissing({ directions: DEFAULT_CONTACT_DIRECTIONS }));
  await patchCmsBlock("cookie_banner", fillMissing(DEFAULT_MAPS_COOKIE_TEXTS));
  // Solo se amplía el texto de la política si sigue siendo exactamente el original por defecto
  const cookiesDefault = DEFAULT_CMS_PAGES.find((p) => p.key === "legal_cookies")!.data as unknown as LegalDocumentData;
  const target = cookiesDefault.sections.find((s) => s.id === "cookies-utilizadas")!.content;
  const legacy = target.replace(COOKIES_MAPS_MENTION, "");
  await patchCmsBlock("legal_cookies", (data) => {
    if (!Array.isArray(data.sections)) return null;
    let changed = false;
    const sections = data.sections.map((s: CmsData) => {
      if (s?.id !== "cookies-utilizadas" || s.content !== legacy) return s;
      changed = true;
      return { ...s, content: target };
    });
    return changed ? { ...data, sections } : null;
  });
}

/**
 * Inicializa los 6 capítulos y 24 servicios de la carta de ESPACIO Q cuando
 * la base de datos aún no tiene categorías creadas (respetando cualquier edición posterior en /admin/servicios).
 */
export async function ensureDefaultServicesCatalog(options?: {
  upsertMissingDefaults?: boolean;
}) {
  if (!options?.upsertMissingDefaults) {
    const existingCategories = await prisma.serviceCategory.count();
    if (existingCategories > 0) return;
  }

  const categoryIdBySlug = new Map<string, string>();
  for (const cat of DEFAULT_SERVICE_CATEGORIES) {
    const record = await prisma.serviceCategory.upsert({
      where: { slug: cat.slug },
      update: {},
      create: {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        sortOrder: cat.sortOrder,
        active: true,
      },
    });
    categoryIdBySlug.set(cat.slug, record.id);
  }

  const existingMediaIds = new Set(
    (await prisma.mediaAsset.findMany({ select: { id: true } })).map((m) => m.id)
  );

  for (const svc of DEFAULT_SERVICES_CATALOG) {
    const categoryId = categoryIdBySlug.get(svc.categorySlug);
    if (!categoryId) continue;

    await prisma.service.upsert({
      where: { slug: svc.slug },
      update: {},
      create: {
        id: svc.id,
        categoryId,
        name: svc.name,
        slug: svc.slug,
        shortDescription: svc.shortDescription,
        description: svc.description,
        durationMin: svc.durationMin,
        bufferBeforeMin: svc.bufferBeforeMin,
        bufferAfterMin: svc.bufferAfterMin,
        priceType: svc.priceType,
        priceCents: svc.priceCents,
        currency: "EUR",
        featured: svc.featured,
        active: true,
        imageAssetId:
          svc.mediaAssetId && existingMediaIds.has(svc.mediaAssetId)
            ? svc.mediaAssetId
            : null,
        faqJson: svc.faqJson as Prisma.InputJsonValue,
        sortOrder: svc.sortOrder,
      },
    });
  }
}

/**
 * Inicializa el equipo de especialistas de ESPACIO Q y su matriz de servicios asignados
 * cuando la base de datos aún no cuenta con profesionales configurados.
 */
export async function ensureDefaultProfessionalsCatalog(options?: {
  upsertMissingDefaults?: boolean;
}) {
  if (!options?.upsertMissingDefaults) {
    const existingPros = await prisma.professional.count();
    if (existingPros > 0) return;
  }

  const allServices = await prisma.service.findMany({
    select: { id: true, slug: true },
  });
  const serviceIdBySlug = new Map(allServices.map((s) => [s.slug, s.id]));

  for (const pro of DEFAULT_PROFESSIONALS_CATALOG) {
    await prisma.mediaAsset.upsert({
      where: { id: pro.mediaAssetId },
      update: {},
      create: {
        id: pro.mediaAssetId,
        internalName: `Retrato equipo · ${pro.name}`,
        src: pro.photoUrl,
        sourceType: "EXTERNAL_URL",
        mimeType: "image/jpeg",
        width: 700,
        height: 875,
        sizeBytes: 0,
        altText: `${pro.name} · ${pro.roleTitle}`,
        caption: pro.bio,
        category: "team",
        focalPointX: 50,
        focalPointY: 30,
        sortOrder: 50 + pro.sortOrder,
        authorCredit: "Unsplash (Licencia Unsplash)",
        licenseNote:
          "Retrato provisional de muestra — sustituir por fotografía definitiva del equipo de ESPACIO Q",
        isProvisional: true,
        publicVisible: false,
      },
    });

    const proRecord = await prisma.professional.upsert({
      where: { slug: pro.slug },
      update: {},
      create: {
        id: pro.id,
        name: pro.name,
        slug: pro.slug,
        roleTitle: pro.roleTitle,
        bio: pro.bio,
        specialties: pro.specialties,
        photoAssetId: pro.mediaAssetId,
        active: true,
        publicVisible: true,
        sortOrder: pro.sortOrder,
      },
    });

    for (const svcSlug of pro.serviceSlugs) {
      const svcId = serviceIdBySlug.get(svcSlug);
      if (!svcId) continue;

      await prisma.professionalService.upsert({
        where: {
          professionalId_serviceId: {
            professionalId: proRecord.id,
            serviceId: svcId,
          },
        },
        update: {},
        create: {
          professionalId: proRecord.id,
          serviceId: svcId,
          active: true,
        },
      });
    }
  }
}

/**
 * Inicializa el horario semanal de atención de ESPACIO Q (Martes–Viernes 10:30–21:00,
 * Sábado 09:00–16:00, Domingo y Lunes cerrado) respetando modificaciones manuales posteriores.
 */
export async function ensureDefaultWorkingSchedule(options?: {
  replaceSetupTemplate?: boolean;
}) {
  const existingRows = await prisma.workingSchedule.findMany({
    where: { targetType: "SALON", source: "MANUAL" },
  });

  if (existingRows.length === 0) {
    for (const dayCfg of ESPACIO_Q_WEEKLY_SCHEDULE) {
      await prisma.workingSchedule.create({
        data: {
          targetType: "SALON",
          dayOfWeek: dayCfg.dayOfWeek,
          isOpen: dayCfg.isOpen,
          intervalsJson: dayCfg.intervals as Prisma.InputJsonValue,
          source: "MANUAL",
          updatedBy: "ESPACIO_Q_GOOGLE_MAPS",
        },
      });
    }
    return;
  }

  // Si procedían de la plantilla provisional inicial ("SETUP_TEMPLATE") y se solicita actualizar
  const allAreSetupTemplate =
    existingRows.length > 0 &&
    existingRows.every((r) => r.updatedBy === "SETUP_TEMPLATE");

  if (options?.replaceSetupTemplate && allAreSetupTemplate) {
    for (const dayCfg of ESPACIO_Q_WEEKLY_SCHEDULE) {
      const match = existingRows.find((r) => r.dayOfWeek === dayCfg.dayOfWeek);
      if (match) {
        await prisma.workingSchedule.update({
          where: { id: match.id },
          data: {
            isOpen: dayCfg.isOpen,
            intervalsJson: dayCfg.intervals as Prisma.InputJsonValue,
            updatedBy: "ESPACIO_Q_GOOGLE_MAPS",
          },
        });
      } else {
        await prisma.workingSchedule.create({
          data: {
            targetType: "SALON",
            dayOfWeek: dayCfg.dayOfWeek,
            isOpen: dayCfg.isOpen,
            intervalsJson: dayCfg.intervals as Prisma.InputJsonValue,
            source: "MANUAL",
            updatedBy: "ESPACIO_Q_GOOGLE_MAPS",
          },
        });
      }
    }
  }
}

export async function getPublishedCmsBlock<T = Record<string, any>>(
  key: string,
  options?: { previewDraft?: boolean }
): Promise<{
  key: string;
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  isPublished: boolean;
  hasUnpublished: boolean;
  version: number;
  updatedAt: Date;
  data: T;
}> {
  let record = await prisma.pageContent.findUnique({ where: { key } });

  if (!record) {
    await ensureBaseCmsAndSettings();
    record = await prisma.pageContent.findUnique({ where: { key } });
  }

  if (!record) {
    const fallback = DEFAULT_CMS_PAGES.find((p) => p.key === key);
    return {
      key,
      title: fallback?.title ?? key,
      seoTitle: fallback?.seoTitle ?? null,
      seoDescription: fallback?.seoDescription ?? null,
      isPublished: true,
      hasUnpublished: false,
      version: 1,
      updatedAt: new Date(),
      data: (fallback?.data ?? {}) as T,
    };
  }

  const rawData = (await canViewDrafts(options?.previewDraft))
    ? record.draftData
    : record.publishedData;

  const normalizedData =
    key === "home_sections"
      ? normalizeHomeSectionsData(rawData)
      : key === "page_galeria"
        ? normalizeGaleriaPageData(rawData)
        : key === "page_equipo"
          ? normalizeEquipoPageData(rawData)
          : rawData;

  return {
    key: record.key,
    title: record.title,
    seoTitle: record.seoTitle,
    seoDescription: record.seoDescription,
    isPublished: record.isPublished,
    hasUnpublished: record.hasUnpublished,
    version: record.version,
    updatedAt: record.updatedAt,
    data: normalizedData as T,
  };
}

export async function getHeroContent(options?: {
  previewDraft?: boolean;
}): Promise<SalonHeroContent> {
  const block = await getPublishedCmsBlock<SalonHeroContent>("home_hero", options);
  const hero = block.data;

  if (!hero.photos || hero.photos.length === 0) {
    const heroAssets = await prisma.mediaAsset.findMany({
      where: { category: "hero", publicVisible: true },
      orderBy: { sortOrder: "asc" },
      take: 9,
    });
    return {
      ...hero,
      photos: heroAssets.map((a, idx) => ({
        id: `hero-photo-${a.id}`,
        assetId: a.id,
        src: a.src,
        alt: a.altText,
        caption: a.caption ?? undefined,
        focalPoint: { x: a.focalPointX, y: a.focalPointY },
        order: idx + 1,
      })),
    };
  }

  return hero;
}

export async function getLegalDocument(
  key:
    | "legal_aviso_legal"
    | "legal_terminos_condiciones"
    | "legal_condiciones_reserva"
    | "legal_privacidad"
    | "legal_cookies",
  options?: { previewDraft?: boolean }
) {
  const [block, settings] = await Promise.all([
    getPublishedCmsBlock<LegalDocumentData>(key, options),
    prisma.salonSettings.findUnique({ where: { id: "default" } }),
  ]);

  const missingLegalFields: string[] = [];
  if (!settings?.legalOwnerName) missingLegalFields.push("Titular / Razón Social");
  if (!settings?.legalTaxId) missingLegalFields.push("NIF / CIF");
  if (!settings?.legalRegisteredAddress) missingLegalFields.push("Domicilio Social");
  if (!settings?.contactEmail) missingLegalFields.push("Email de Contacto");

  return {
    ...block,
    settings,
    missingLegalFields,
  };
}

export async function saveCmsDraft(params: {
  key: string;
  draftData: Record<string, unknown>;
  seoTitle?: string | null;
  seoDescription?: string | null;
  publishImmediately?: boolean;
  actorName?: string;
  changeNote?: string;
}) {
  const existing = await prisma.pageContent.findUnique({
    where: { key: params.key },
  });

  if (!existing) {
    throw new Error(`No existe el bloque CMS con clave "${params.key}".`);
  }

  const nextVersion = params.publishImmediately
    ? existing.version + 1
    : existing.version;

  const updated = await sequentialWrites(async (tx) => {
    const page = await tx.pageContent.update({
      where: { key: params.key },
      data: {
        draftData: params.draftData as Prisma.InputJsonValue,
        publishedData: params.publishImmediately
          ? (params.draftData as Prisma.InputJsonValue)
          : (existing.publishedData as Prisma.InputJsonValue),
        hasUnpublished: !params.publishImmediately,
        version: nextVersion,
        seoTitle:
          params.seoTitle !== undefined ? params.seoTitle : existing.seoTitle,
        seoDescription:
          params.seoDescription !== undefined
            ? params.seoDescription
            : existing.seoDescription,
        updatedBy: params.actorName ?? "Admin",
        publishedAt: params.publishImmediately
          ? new Date()
          : existing.publishedAt,
      },
    });

    if (params.publishImmediately) {
      await tx.contentRevision.create({
        data: {
          pageContentId: page.id,
          version: nextVersion,
          snapshotData: params.draftData as Prisma.InputJsonValue,
          changeNote: params.changeNote ?? "Publicación desde el editor CMS",
          createdBy: params.actorName ?? "Admin",
        },
      });
    }

    // Sincronizar referencias de uso de MediaUsage si es home_hero
    if (params.key === "home_hero") {
      await tx.mediaUsage.deleteMany({
        where: { locationKey: { startsWith: "hero.slide." } },
      });
      const photos = (params.draftData as unknown as SalonHeroContent)?.photos;
      if (Array.isArray(photos)) {
        for (const [idx, photo] of photos.entries()) {
          if (photo.assetId) {
            const assetExists = await tx.mediaAsset.findUnique({
              where: { id: photo.assetId },
            });
            if (assetExists) {
              await tx.mediaUsage.create({
                data: {
                  mediaAssetId: photo.assetId,
                  locationKey: `hero.slide.${idx + 1}`,
                  locationName: `Hero 3D · Tarjeta #${idx + 1}`,
                },
              });
            }
          }
        }
      }
    }

    return page;
  });

  return updated;
}
