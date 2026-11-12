import { ensureSeeded } from "./lib/db/seed";
import { startJobScheduler } from "./lib/jobs/scheduler";

// Variables obligatorias: si falta alguna, una línea clara en el log; /health sigue respondiendo.
for (const name of ["MONGO_URL", "DB_NAME", "APP_URL", "AUTH_SECRET", "CRON_SECRET", "TOKEN_ENCRYPTION_KEY"]) {
  if (!process.env[name]?.trim()) console.error(`[config] Falta la variable de entorno obligatoria ${name}`);
}

// Arranque del servidor Node (en segundo plano, sin bloquear /health ni /): carga la semilla si MongoDB
// está vacía y arranca el planificador interno de la cola (cada 5 min, lease en MongoDB).
ensureSeeded()
  .then(async (seeded) => {
    if (seeded) console.log("[boot] Base de datos vacía: semilla ESPACIO Q cargada.");
    // Nuevos bloques/textos por defecto (FAQ, «Cómo llegar», SEO) sin pisar ediciones del salón
    const { ensureBaseCmsAndSettings } = await import("./lib/domain/cms");
    await ensureBaseCmsAndSettings();
  })
  .catch((err) => console.error("[boot] No se pudo verificar/cargar la semilla en MongoDB:", err?.message || err));

startJobScheduler();
