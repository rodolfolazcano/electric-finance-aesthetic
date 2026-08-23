import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import JavaScriptObfuscator from "javascript-obfuscator";

const activado = process.env.OBFUSCATE === "1";
if (!activado) {
  console.log("[obfuscate] desactivado (local): omitido");
  process.exit(0);
}

const DIRS = [
  ".vercel/output/static/assets",
  ".output/public/assets",
  "dist/client/assets",
  "dist/assets",
];

const OPCIONES = {
  compact: true,
  simplify: true,
  renameGlobals: false,
  selfDefending: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  stringArray: true,
  stringArrayThreshold: 0.7,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  unicodeEscapeSequence: false,
  target: "browser",
};

let total = 0;
for (const dir of DIRS) {
  if (!existsSync(dir)) continue;
  let archivos = [];
  try {
    archivos = readdirSync(dir).filter((f) => f.endsWith(".js"));
  } catch {
    continue;
  }
  for (const archivo of archivos) {
    const ruta = join(dir, archivo);
    try {
      const codigo = readFileSync(ruta, "utf8");
      const resultado = JavaScriptObfuscator.obfuscate(codigo, OPCIONES);
      writeFileSync(ruta, resultado.getObfuscatedCode());
      total++;
      console.log(`[obfuscate] ${ruta}`);
    } catch (e) {
      console.warn(`[obfuscate] FALLÓ ${ruta}: ${e?.message ?? e}`);
    }
  }
}

console.log(`[obfuscate] ${total} archivo(s) de cliente ofuscado(s)`);
