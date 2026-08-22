/**
 * Constructor del índice académico para kb-academic.ts.
 *
 * Escanea los directorios fuente (recursivo, incluye subcarpetas), extrae texto
 * por página de cada PDF, lo divide en chunks, genera embeddings con NVIDIA
 * (con fallback a solo-texto si la API falla) y escribe public/kb/academic-index.json
 * en el formato IndiceAcademico:
 *   { modelo, dims, fecha, chunks: [{ categoria, archivo, pagina, offset, texto, v }] }
 *
 * v = vector Float16 little-endian codificado en base64 ("" si no se pudo embedar).
 *
 * Uso:
 *   node scripts/build-kb-index.mjs                          # solo app-root pt/
 *   node scripts/build-kb-index.mjs "../ruta/corpus/pt"      # corpus externo primero
 *   node scripts/build-kb-index.mjs "../ruta/corpus/pt" pt   # multi-fuente (dedupe por nombre de archivo)
 */

import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const ROOT = path.resolve(import.meta.dirname, "..");
const PT_DIR = path.join(ROOT, "pt");
const OUT_DIR = path.join(ROOT, "public", "kb");
const OUT_FILE = path.join(OUT_DIR, "academic-index.json");

const EMBED_URL = "https://integrate.api.nvidia.com/v1/embeddings";
const EMBED_MODEL = "nvidia/nemotron-3-embed-1b";
const NVIDIA_API_KEY =
  process.env.NVIDIA_API_KEY ??
  "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";

const CHUNK_TARGET = 1200;
const MIN_PAGE_CHARS = 40;
const BATCH = 8;

function categoriaDe(rutaRelativa) {
  const a = rutaRelativa.toLowerCase();
  if (a.includes("pascale")) return "Pascale - Finanzas de la empresa";
  if (a.includes("carteras")) return "Carteras - Elbaum";
  if (a.includes("calculo financiero")) return "Calculo financiero - Dumrauf";
  if (a.includes("administracion financiera")) return "Administracion financiera - Alonso/Dumrauf";
  if (a.includes("contables fundamentales")) return "Contabilidad - Fowler Newton";
  if (a.includes("estados contables")) return "Estados contables - Biondi";
  if (a.includes("macroeconom")) {
    return a.includes("dornsbusch") || a.includes("dornbusch")
      ? "Macroeconomia - Dornbusch-Fischer"
      : "Macroeconomia LATAM - Blanchard/Perez-Enrri";
  }
  if (a.includes("televisi")) return "Financiacion y mercados - Bustamante";
  if (a.includes("instrumentos")) return "Instrumentos financieros";
  return "Corpus academico";
}

/** Recorre el directorio recursivamente devolviendo rutas de PDFs con su ruta relativa. */
function* walkPdfs(dir, baseDir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkPdfs(full, baseDir);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
      yield { full: full, rel: path.relative(baseDir, full) };
  }
}

/** THREE.js toHalf: Float32 -> bits Float16. */
function toHalf(val) {
  const floatView = new Float32Array(1);
  const int32View = new Uint32Array(floatView.buffer);
  floatView[0] = val;
  const x = int32View[0];
  let bits = (x >> 16) & 0x8000;
  let m = (x >> 12) & 0x07ff;
  const e = (x >> 23) & 0xff;
  if (e < 103) return bits;
  if (e > 142) {
    bits |= 0x7c00;
    bits |= (e === 255 ? 0 : 1) && x & 0x007fffff;
    return bits;
  }
  if (e < 113) {
    m |= 0x0800;
    bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
    return bits;
  }
  bits |= ((e - 112) << 10) | (m >> 1);
  bits += m & 1;
  return bits;
}

function vectorABase64(vector) {
  const u16 = new Uint16Array(vector.length);
  for (let i = 0; i < vector.length; i++) u16[i] = toHalf(vector[i]);
  return Buffer.from(u16.buffer).toString("base64");
}

function normalizar(v) {
  const norma = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norma);
}

async function generarEmbedding(texto) {
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + NVIDIA_API_KEY,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texto }),
  });
  if (!res.ok) throw new Error("embedding error " + res.status);
  const data = await res.json();
  const emb = data?.data?.[0]?.embedding;
  if (!emb) throw new Error("embedding vacío");
  return emb;
}

function chunkearTexto(texto) {
  const chunks = [];
  let offset = 0;
  while (offset < texto.length) {
    let fin = Math.min(offset + CHUNK_TARGET, texto.length);
    if (fin < texto.length) {
      const corte = texto.lastIndexOf(" ", fin);
      if (corte > offset + CHUNK_TARGET * 0.6) fin = corte;
    }
    const trozo = texto.slice(offset, fin).trim();
    if (trozo.length >= MIN_PAGE_CHARS) chunks.push({ texto: trozo, offset });
    offset = fin;
  }
  return chunks;
}

async function procesarPdf(pdfPath) {
  const buffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => (p.text || "").replace(/\s+/g, " ").trim());
  } finally {
    await parser.destroy();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fuentes = (args.length ? args : ["pt"]).map((a) => path.resolve(ROOT, a));
  console.log(`Fuentes: ${fuentes.join(" | ")}`);

  // Dedupe por nombre de archivo: la primera fuente que lo contiene gana.
  const vistos = new Set();
  const pendientes = [];
  for (const fuente of fuentes) {
    if (!fs.existsSync(fuente)) {
      console.warn(`AVISO: no existe la fuente ${fuente} — se omite`);
      continue;
    }
    for (const { full, rel } of walkPdfs(fuente, fuente)) {
      const nombre = path.basename(rel);
      if (vistos.has(nombre)) continue;
      vistos.add(nombre);
      pendientes.push({ full: full, rel: rel });
    }
  }
  console.log(`PDFs a indexar: ${pendientes.length}`);

  const chunks = [];
  let embedOk = 0;
  let embedFail = 0;

  for (const { full, rel } of pendientes) {
    try {
      const paginas = await procesarPdf(full);
      const categoria = categoriaDe(rel);
      let delArchivo = 0;
      paginas.forEach((textoPagina, i) => {
        for (const c of chunkearTexto(textoPagina)) {
          chunks.push({
            categoria,
            archivo: path.basename(rel),
            pagina: i + 1,
            offset: c.offset,
            texto: c.texto,
            v: "",
          });
          delArchivo++;
        }
      });
      console.log(`  ${rel}: ${paginas.length} pags, ${delArchivo} chunks [${categoria}]`);
    } catch (err) {
      console.error(`  ERROR ${rel}: ${err.message}`);
    }
  }

  console.log(`Total chunks: ${chunks.length}. Embedding...`);
  for (let i = 0; i < chunks.length; i += BATCH) {
    const lote = chunks.slice(i, i + BATCH);
    const resultados = await Promise.all(
      lote.map(async (c) => {
        try {
          return await generarEmbedding(c.texto);
        } catch {
          return null;
        }
      }),
    );
    resultados.forEach((vec, j) => {
      if (vec) {
        lote[j].v = vectorABase64(normalizar(vec));
        embedOk++;
      } else {
        embedFail++;
      }
    });
    if ((i / BATCH) % 10 === 0)
      console.log(`  progreso ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
  }

  const indice = {
    modelo: EMBED_MODEL,
    dims: 2048,
    fecha: new Date().toISOString(),
    chunks,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(indice));
  const mb = (fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(1);
  console.log(
    `Índice escrito: ${OUT_FILE} (${chunks.length} chunks, ${mb} MB, embeddings ok=${embedOk}, fallidos=${embedFail})`,
  );
  if (embedFail > 0 && embedOk === 0)
    console.log(
      "AVISO: ningún chunk quedó embedado (API no disponible). El índice funcionará por coincidencia de palabras, no semánticamente.",
    );
}

main();
