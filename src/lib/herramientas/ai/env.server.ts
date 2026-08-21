// Carga de variables de entorno server-side.
// Vite no popula el objecto global `process.env` con las vars de .env; solo
// expone `import.meta.env` (VITE_* al cliente, y TODAS al server-side). Esta
// utilidad normaliza ese mapa a `process.env` para que el resto del código
// (que lee process.env.NVIDIA_API_KEY, etc.) funcione.
//
// REGLA CLAVE: este archivo NO debe importar `node:*` en el top nivel, porque
// los `.server.ts` de este proyecto SE bundlerizan al cliente (ver nota de
// `node:child_process`). Por eso:
//  - la lectura sincrónica usa `import.meta.env` (seguro en browser).
//  - la lectura async del archivo .env usa `import()` perezagua DENTRO de un
//    guardia server-only, así `node:fs` nunca se resuelve en el browser.
const _envTextCache: string[] = [];

function applyEnvText(text: string) {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    value = value.replace(/^["']|["']$/g, "");
    if (!key) continue;
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

let loadDone = false;
let loadPromise: Promise<void> | null = null;

function fillFromImportMetaEnv() {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};
  for (const key of Object.keys(env)) {
    const val = env[key];
    if (val === undefined || val === null) continue;
    if (process.env[key as string] === undefined || process.env[key as string] === "") {
      process.env[key as string] = String(val);
    }
  }
}

/** Carga las keys de .env y .env.local SIEMPRE (no solo cuando falta la
 *  principal). Así llegan también las keys específicas por modelo
 *  (NVIDIA_API_KEY_MODEL_*), que no se consideran "requeridas" pero sí se
 *  necesitan para los modelos que tienen key dedicada. applyEnvText no
 *  pisa valores ya definidos, así que no rompe las keys del entorno. */
async function fillFromFile() {
  let loadedFiles: string[] = [];
  try {
    const [fs, path] = await Promise.all([import("node:fs"), import("node:path")]);
    const roots = new Set<string>();
    const cwd = process.cwd();
    const moduleUrl = (import.meta as unknown as { url?: string }).url;
    for (const r of [cwd, path.dirname(cwd), path.dirname(path.dirname(cwd))]) {
      roots.add(r);
      if (moduleUrl && !moduleUrl.startsWith("file://")) continue;
      if (moduleUrl) {
        try {
          const modDir = path.dirname(new URL(moduleUrl).pathname.replace(/^\/([A-Za-z]:)/, "$1").replace(/\//g, "\\"));
          roots.add(modDir);
          roots.add(path.dirname(modDir));
          roots.add(path.dirname(path.dirname(modDir)));
        } catch {
          /* ignore */
        }
      }
    }
    for (const root of roots) {
      for (const file of [path.join(root, ".env"), path.join(root, ".env.local")]) {
        try {
          if (fs.existsSync(file)) {
            applyEnvText(fs.readFileSync(file, "utf8"));
            loadedFiles.push(file);
          }
        } catch {
          /* ignore unreadable file */
        }
      }
    }
  } catch {
    /* node:fs dynamic import unavailable */
  }
  if (typeof process !== "undefined") {
    const nvidia = Object.keys(process.env).filter((k) => k.startsWith("NVIDIA_API_KEY"));
    console.warn(`[env.server] archivos: ${loadedFiles.length ? loadedFiles.join(" | ") : "NINGUNO"}; NVIDIA keys cargadas: ${nvidia.length} (${nvidia.filter((k) => process.env[k]).length} con valor)`);
  }
}

/** Promesa que se resuelve cuando process.env está poblado (server-only). */
export const envReady: Promise<void> = (async () => {
  if (typeof process === "undefined" || typeof window !== "undefined") return;
  fillFromImportMetaEnv();
  await fillFromFile();
  loadDone = true;
})();

export default envReady;

