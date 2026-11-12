// Guard de `yarn start` (prestart): compila con `next build` si .next no tiene build o si las fuentes cambiaron.
// `--stamp` (postbuild) solo guarda la huella de las fuentes de la build recién hecha.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const buildId = path.join(root, ".next", "BUILD_ID");
const stampFile = path.join(root, ".next", "source-hash");
const SOURCES = [
  "app", "components", "lib", "public", "middleware.ts", "instrumentation.ts", "instrumentation-node.ts",
  "next.config.mjs", "package.json", "tailwind.config.ts", "postcss.config.mjs", "tsconfig.json",
];

function files(rel) {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) return [];
  if (!statSync(abs).isDirectory()) return [rel];
  return readdirSync(abs).sort().flatMap((name) => files(path.join(rel, name)));
}

const sources = SOURCES.flatMap(files);

function sourceHash() {
  const h = createHash("sha256");
  for (const rel of sources) h.update(rel).update("\0").update(readFileSync(path.join(root, rel))).update("\0");
  return h.digest("hex");
}

function isFresh(hash) {
  if (!existsSync(buildId)) return false;
  if (existsSync(stampFile)) return readFileSync(stampFile, "utf8").trim() === hash;
  // Build hecha sin el hook postbuild (p. ej. `next build` directo): fresca si es posterior a todas las fuentes
  const built = statSync(buildId).mtimeMs;
  return sources.every((rel) => statSync(path.join(root, rel)).mtimeMs <= built);
}

const hash = sourceHash();
if (process.argv.includes("--stamp")) {
  writeFileSync(stampFile, hash);
  process.exit(0);
}
if (isFresh(hash)) {
  console.log("[start] Build de producción al día (.next): arrancando sin recompilar.");
  process.exit(0);
}
console.log("[start] No hay build de producción o está desactualizada: ejecutando `next build`...");
const res = spawnSync(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "build"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
if (res.status !== 0) process.exit(res.status ?? 1);
writeFileSync(stampFile, hash);
