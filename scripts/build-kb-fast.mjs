import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const ROOT = path.resolve(import.meta.dirname, "..");
const PT_DIR = path.join(ROOT, "pt");
const OUT_DIR = path.join(ROOT, "public", "kb");
const OUT_FILE = path.join(OUT_DIR, "academic-index.json");
const CHUNK_TARGET = 1200;
const MIN_PAGE_CHARS = 40;

function categoriaDe(a) {
  a = a.toLowerCase();
  if (a.includes("labadie") || a.includes("1205.") || a.includes("1303.") || a.includes("spectral_theory") || a.includes("machine_learning") || a.includes("lectures_2016") || a.includes("lectures_2017") || a.includes("lectures_2021") || a.includes("memoire_master") || a.includes("optimisation_problems") || a.includes("high-frequency") || a.includes("high_frequency") || a.includes("hft") || a.includes("financial-zoology") || a.includes("algo_trading") || a.includes("etf_v4") || a.includes("zoology") || a.includes("stochastic_processes") || a.includes("dunbar")) return "Labadié - Quant & Microstructure";
  if (a.includes("pascale") || a.includes("dfin_pascale")) return "Pascale - Finanzas de la empresa";
  if (a.includes("carteras") || a.includes("elbaum") || a.includes("ifaci")) return "Carteras - Elbaum";
  if (a.includes("dumrauf") || a.includes("matf") || a.includes("lopez_dumrauf")) return "Calculo financiero - Dumrauf";
  if (a.includes("alonso")) return "Administracion financiera - Alonso/Dumrauf";
  if (a.includes("fowler_newton") || a.includes("conii") || a.includes("icon_") || a.includes("cf_fowler")) return "Contabilidad - Fowler Newton";
  if (a.includes("biondi") || a.includes("geft_biondi")) return "Estados contables - Biondi";
  if (a.includes("blanchard") || a.includes("dornsbusch") || a.includes("dornbusch") || a.includes("fpub")) return a.includes("dornsbusch") || a.includes("dornbusch") ? "Macroeconomia - Dornbusch-Fischer" : "Macroeconomia LATAM - Blanchard/Perez-Enrri";
  if (a.includes("bustamante") || a.includes("ecc_") || a.includes("pcom_") || a.includes("geft")) return "Financiacion y mercados - Bustamante";
  if (a.includes("instrumentos") || a.includes("instrum") || a.includes("murphy") || a.includes("intermarket")) return "Intermarket - Murphy";
  if (a.includes("metodologias") || a.includes("glosario") || a.includes("perfil_inversor") || a.includes("17851") || a.includes("valueinvesting")) return "Metodologias - Coronar";
  return "Corpus academico";
}
function* walk(dir, base) {
  let e; try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of e) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full, base);
    else if (entry.isFile() && (entry.name.toLowerCase().endsWith(".pdf") || entry.name.toLowerCase().endsWith(".txt"))) yield { full, rel: path.relative(base, full) };
  }
}
function chunkearTexto(texto) {
  const chunks = []; let offset = 0;
  while (offset < texto.length) {
    let fin = Math.min(offset + CHUNK_TARGET, texto.length);
    if (fin < texto.length) { const c = texto.lastIndexOf(" ", fin); if (c > offset + CHUNK_TARGET * 0.6) fin = c; }
    const trozo = texto.slice(offset, fin).trim();
    if (trozo.length >= MIN_PAGE_CHARS) chunks.push({ texto: trozo, offset });
    offset = fin;
  }
  return chunks;
}
async function procesar(p) {
  if (p.toLowerCase().endsWith(".txt")) {
    const t = fs.readFileSync(p, "utf-8").replace(/\s+/g, " ").trim();
    const pages = []; for (let i=0;i<t.length;i+=3000) pages.push(t.slice(i,i+3000));
    return pages.length?pages:[t];
  }
  const b = fs.readFileSync(p); const parser = new PDFParse({ data: new Uint8Array(b) });
  try { const r = await parser.getText(); return r.pages.map(x => (x.text||"").replace(/\s+/g," ").trim()); } finally { await parser.destroy(); }
}
const fuentes = [PT_DIR];
const vistos = new Set(); const pendientes=[];
for (const f of fuentes) for (const {full,rel} of walk(f,f)) { const n=path.basename(rel); if(vistos.has(n)) continue; vistos.add(n); pendientes.push({full,rel}); }
console.log(`Docs: ${pendientes.length}`);
const chunks=[];
for (const {full,rel} of pendientes) {
  try { const paginas = await procesar(full); const cat=categoriaDe(rel); let c=0; paginas.forEach((t,i)=>{ for(const ch of chunkearTexto(t)){ chunks.push({categoria:cat,archivo:path.basename(rel),pagina:i+1,offset:ch.offset,texto:ch.texto,v:""}); c++; }}); if(c>0) console.log(`  ${rel}: ${c} chunks [${cat}]`); } catch(e){ console.error(`  ERROR ${rel}: ${e.message}`); }
}
console.log(`Total chunks: ${chunks.length} (sin embeddings, lexical)`);
const indice={modelo:"nvidia/nemotron-3-embed-1b",dims:2048,fecha:new Date().toISOString(),chunks};
fs.mkdirSync(OUT_DIR,{recursive:true}); fs.writeFileSync(OUT_FILE, JSON.stringify(indice));
console.log(`Escrito ${OUT_FILE} ${(fs.statSync(OUT_FILE).size/1024/1024).toFixed(1)} MB`);
