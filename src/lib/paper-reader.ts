/** Lectura inteligente de papers de la knowledge base (carpeta `pt/`).
 *
 *  Localiza el documento por tema, extrae su texto (PDF best-effort con
 *  node:zlib para streams FlateDecode), y de ahí deriva metodología,
 *  fórmulas, variables y supuestos. Si el PDF no da texto suficiente, cae a
 *  la descripción indexada en KNOWLEDGE_BASE sin inventar contenido.
 */

import { KNOWLEDGE_BASE } from "./knowledge-base";

export interface Formula {
  nombre: string;
  expresion: string;
  variables: string[];
  contexto: string;
}

export interface Supuesto {
  variable: string;
  valor: string | number | null;
  fuente: string;
  descripcion: string;
}

export interface PaperMetodologia {
  tema: string;
  nombre: string;
  id: string;
  categoria: string;
  archivo: string | null;
  rutaAbsoluta: string | null;
  textoExtraido: string;
  extraidoCompleto: boolean;
  resumen: string;
  formulas: Formula[];
  supuestos: Supuesto[];
  variablesRequeridas: string[];
  encontrado: boolean;
}

interface DescriptorPaper {
  id: string;
  nombre: string;
  categoria: string;
}

/** ---- Localización de la carpeta de papers ---- */
function candidatosCarpetaPt(): string[] {
  if (typeof process === "undefined" || !process.cwd) return [];
  const cwd = process.cwd();
  const bases = [cwd, pathJoin(cwd, ".."), pathJoin(cwd, "..", "..")];
  const candidatos: string[] = [];
  for (const base of bases) {
    candidatos.push(pathJoin(base, "pt"));
    candidatos.push(pathJoin(base, "..", "pt"));
  }
  candidatos.push(pathJoin(cwd, "src", "lib", "..", "..", "..", "pt"));
  return candidatos;
}

/** minipath que evita importar `node:path` en runtime no-Node. */
function pathJoin(...partes: string[]): string {
  return partes.join("/").replace(/\/{2,}/g, "/");
}

async function existeCarpetaPt(): Promise<string | null> {
  for (const c of candidatosCarpetaPt()) {
    try {
      const fs = await import("node:fs");
      if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c;
    } catch {
      /* ignorar */
    }
  }
  return null;
}

/** ---- Índice de papers desde KNOWLEDGE_BASE ---- */
function indexarPapers(): DescriptorPaper[] {
  const papers: DescriptorPaper[] = [];
  let categoria = "";
  for (const linea of KNOWLEDGE_BASE.split(/\r?\n/)) {
    const l = linea.trim();
    if (!l) continue;
    const esItem = l.match(/^\d+\.\s+([A-Z][A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (esItem) {
      papers.push({ id: esItem[1]!, nombre: esItem[2]!.trim(), categoria });
      continue;
    }
    const mHash = l.match(/^#{1,2}\s+(.+)$/);
    if (mHash) {
      categoria = mHash[1]!.trim();
      continue;
    }
    if (/^[A-ZÀ-Ý][A-Za-zÀ-ÿÁÉÍÓÚÑ0-9 -]+$/.test(l)) categoria = l;
  }
  return papers;
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ");
}

/** Mapeo directo de metodologías conocidas → paper del índice. */
const MAPEO_METODOLOGIA: Array<{ claves: string[]; id: string }> = [
  {
    claves: ["dcf", "flujo de caja descontado", "flujos de caja", "descontad", "valor intrinseco"],
    id: "MATF_Lopez_Dumrauf_Unidad_3",
  },
  {
    claves: ["emergente", "mercados emergentes", "empresa emergente", "riesgo pais", "pais emergente"],
    id: "DFIN_Pascale_3_Unidad_3",
  },
  {
    claves: ["capm", "beta", "costo de capital", "tasa de descuento", "premio de riesgo"],
    id: "MATF_Lopez_Dumrauf_Unidad_4",
  },
  {
    claves: ["valor actual", "valor presente", "valor futuro", "tiempo value"],
    id: "MATF_Lopez_Dumrauf_Unidad_3",
  },
  {
    claves: ["gordon", "valor terminal", "perpetuidad", "crecimiento terminal"],
    id: "MATF_Lopez_Dumrauf_Unidad_3",
  },
  { claves: ["valoracion de empresas", "valuacion de empresas", "valor de la empresa"], id: "DFIN_Pascale_3_Unidad_3" },
  { claves: ["administracion de carteras", "asset allocation", "asignacion de activos"], id: "IFACI_Elbaum_Unidad_3" },
  { claves: ["wacc", "costo medio ponderado", "estructura de capital"], id: "DFIN_Alonso_Unidad_3" },
];

function elegirDescriptor(tema: string, papers: DescriptorPaper[]): DescriptorPaper | null {
  const t = normalizar(tema);
  for (const m of MAPEO_METODOLOGIA) {
    if (m.claves.some((c) => t.includes(c))) {
      const d = papers.find((p) => p.id.toLowerCase() === m.id.toLowerCase());
      if (d) return d;
    }
  }
  const terms = t.split(/\s+/).filter((w) => w.length > 2);
  let mejor: DescriptorPaper | null = null;
  let mejorScore = 0;
  for (const p of papers) {
    const target = normalizar(`${p.id} ${p.nombre} ${p.categoria}`);
    const score = terms.reduce((n, term) => n + (target.includes(term) ? 1 : 0), 0);
    if (score > mejorScore) {
      mejorScore = score;
      mejor = p;
    }
  }
  return mejorScore > 0 ? mejor : null;
}

/** ---- Búsqueda recursiva del archivo en `pt/` ---- */
async function buscarArchivo(carpetaPt: string, id: string): Promise<string | null> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const idL = id.toLowerCase().replace(/[^a-z0-9_]/g, "");
  const pila = [carpetaPt];
  while (pila.length) {
    const dir = pila.pop()!;
    let entradas: import("node:fs").Dirent[];
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entradas) {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) {
        pila.push(ruta);
      } else if (/\.pdf$/i.test(e.name)) {
        const base = path.basename(e.name).replace(/\.pdf$/i, "").toLowerCase();
        const limpia = base.replace(/[^a-z0-9_]/g, "");
        if (limpia === idL || base.startsWith(idL) || idL.startsWith(limpia)) return ruta;
      }
    }
  }
  return null;
}

/** ---- Extracción de texto de un PDF (best-effort) ---- */
function desescapePdf(s: string): string {
  return s.replace(/\\([nrtbf()\\])/g, (_m, c: string) => {
    switch (c) {
      case "n": return "\n";
      case "r": return "\r";
      case "t": return "\t";
      case "b": return "\b";
      case "f": return "\f";
      default: return c;
    }
  });
}

function hexAString(hex: string): string {
  const limpio = hex.replace(/\s+/g, "");
  let out = "";
  for (let i = 0; i + 1 < limpio.length; i += 2) {
    const byte = parseInt(limpio.slice(i, i + 2), 16);
    if (!Number.isNaN(byte)) out += String.fromCharCode(byte);
  }
  return out;
}

function extraerTextoOperadores(contenido: string): string {
  // Separa por saltos de línea de texto (TD/Td/T*/ET) para conservar estructura.
  const bloques = contenido.split(/\b(?:TD|Td|T\*|ET)\b/);
  const lineas: string[] = [];
  for (const bloque of bloques) {
    const partes: string[] = [];
    const re = /\(\\.\)|\((?:[^\\()]|\\.)*\)|\<[0-9A-Fa-f\s]*\>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(bloque)) !== null) {
      const tok = m[0];
      if (tok.startsWith("(")) {
        partes.push(desescapePdf(tok.slice(1, -1)));
      } else if (tok.startsWith("<")) {
        partes.push(hexAString(tok.slice(1, -1)));
      }
    }
    if (partes.length) lineas.push(partes.join(""));
  }
  return lineas.filter((l) => l.trim()).join("\n");
}

async function extraerTextoPdf(ruta: string): Promise<string> {
  try {
    const fs = await import("node:fs");
    const zlib = await import("node:zlib");
    const buf = fs.readFileSync(ruta);
    const s = buf.toString("latin1");
    const chunks: string[] = [];
    const reStreams = /<<([^>]*?)>>\s*stream\r?\n([\s\S]*?)endstream/g;
    let m: RegExpExecArray | null;
    while ((m = reStreams.exec(s)) !== null) {
      const dict = m[1] ?? "";
      const isFlate = /\/FlateDecode/.test(dict);
      let data = Buffer.from(m[2] ?? "", "latin1");
      if (isFlate) {
        try {
          data = zlib.inflateSync(data);
        } catch {
          try {
            data = zlib.inflateRawSync(data);
          } catch {
            continue;
          }
        }
      }
      const texto = extraerTextoOperadores(data.toString("latin1"));
      if (texto.trim().length) chunks.push(texto);
    }
    return chunks.join("\n");
  } catch {
    return "";
  }
}

/** ---- Extracción de fórmulas por patrones ---- */
const PATRONES_FORMULA: Array<{ nombre: string; re: RegExp }> = [
  { nombre: "Valor actual / valor presente", re: /(?:valor actual|valor presente|\bVA\b|\bVP\b)[\s:=]*([^\n.;]{2,90})/i },
  { nombre: "Flujo de caja descontado (DCF)", re: /(?:flujo de caja descontado|flujo de fondos descontado|dcf|valor de la empresa)[\s:=]*([^\n.;]{2,90})/i },
  { nombre: "Valor terminal (Gordon / perpetuidad)", re: /(?:valor terminal|gordon|perpetuidad|crecimiento terminal)[\s:=]*([^\n.;]{2,90})/i },
  { nombre: "WACC", re: /(?:\bWACC\b|costo medio ponderado|costo de capital medio)[\s:=]*([^\n.;]{2,90})/i },
  { nombre: "CAPM", re: /(?:\bCAPM\b|costo de capital propio)[\s:=]*([^\n.;]{2,90})/i },
  { nombre: "VAN / VPN", re: /(?:\bVAN\b|\bVPN\b|valor actual neto)[\s:=]*([^\n.;]{2,90})/i },
  { nombre: "TIR", re: /(?:\bTIR\b|\bIRR\b|tasa interna de retorno)[\s:=]*([^\n.;]{2,90})/i },
  { nombre: "Interés compuesto", re: /(?:interes compuesto|monto final|capitalizacion)[\s:=]*([^\n.;]{2,90})/i },
];

const TOKENS_VARIABLES = new Set([
  "FCF", "VA", "VF", "VAN", "VPN", "TIR", "WACC", "CAPM", "E", "D", "K", "B", "TV", "FC",
]);

function extraerVariablesDeExpresion(expresion: string): string[] {
  const vars = new Set<string>();
  for (const m of expresion.matchAll(/\b([A-Z]{2,4})\b/g)) {
    const v = m[1]!;
    if (TOKENS_VARIABLES.has(v)) vars.add(v);
  }
  for (const m of expresion.matchAll(/\b(r|g|i|n|t|tasa|crecimiento|flujo)\b/gi)) {
    vars.add(m[1]!.toUpperCase());
  }
  return [...vars];
}

export function extraerFormulas(texto: string): Formula[] {
  const formulas: Formula[] = [];
  for (const p of PATRONES_FORMULA) {
    const matches = [...texto.matchAll(p.re)];
    for (const m of matches.slice(0, 2)) {
      const contexto = texto.slice(Math.max(0, (m.index ?? 0) - 60), (m.index ?? 0) + 100).replace(/\s+/g, " ").trim();
      const expresion = (m[1] ?? "").trim();
      if (!expresion) continue;
      formulas.push({
        nombre: p.nombre,
        expresion,
        variables: extraerVariablesDeExpresion(`${p.nombre} ${expresion}`),
        contexto: contexto.length > 180 ? `${contexto.slice(0, 180)}…` : contexto,
      });
    }
  }
  const unicos: Formula[] = [];
  const vistos = new Set<string>();
  for (const f of formulas) {
    const k = `${f.nombre}|${f.expresion.slice(0, 40)}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    unicos.push(f);
  }
  return unicos.slice(0, 12);
}

/** ---- Supuestos por defecto según metodología ---- */
const SUPUESTOS_DEFECTO: Record<string, Supuesto[]> = {
  DCF: [
    { variable: "Horizonte de proyección", valor: "5 años", fuente: "Práctica estándar del paper", descripcion: "Años de proyección explícita de flujos de caja." },
    { variable: "Crecimiento terminal", valor: "2.5% (US) / 3.5% (emergentes)", fuente: "PIB nominal esperado", descripcion: "Tasa de crecimiento perpetuo del valor terminal (Gordon)." },
    { variable: "Tasa libre de riesgo", valor: "10Y Treasury (US) / Bonar 2030 (AR)", fuente: "Mercado (Yahoo Finance ^TNX)", descripcion: "Rendimiento del bono soberano de referencia." },
    { variable: "Premio de riesgo de mercado", valor: "5.5%", fuente: "Damodaran / paper", descripcion: "Equity risk premium de referencia para CAPM." },
    { variable: "Beta", valor: "3 años daily vs SPY / MERVAL", fuente: "Yahoo Finance chart (R² mayor)", descripcion: "Beta contra el benchmark con mejor ajuste." },
  ],
  EMERGENTES: [
    { variable: "Horizonte de proyección", valor: "5 años", fuente: "Práctica del paper", descripcion: "Años de proyección explícita de flujos." },
    { variable: "Crecimiento terminal", valor: "3.5%", fuente: "PIB nominal esperado de mercados emergentes", descripcion: "Crecimiento perpetuo con prima por país." },
    { variable: "Tasa libre de riesgo", valor: "Bonar 2030 / tesoro de referencia", fuente: "Mercado", descripcion: "Riesgo soberano del país emergente." },
    { variable: "Premio de riesgo de mercado", valor: "6.0% - 7.0%", fuente: "Damodaran ajustado por riesgo país", descripcion: "MRP mayor que en mercados desarrollados." },
    { variable: "Beta", valor: "3 años daily vs MERVAL / SPY", fuente: "Yahoo Finance chart (R² mayor)", descripcion: "Se elige el benchmark local cuando ajusta mejor (R²)." },
  ],
  CAPM: [
    { variable: "Tasa libre de riesgo", valor: "10Y Treasury (US)", fuente: "Mercado (^TNX)", descripcion: "Rendimiento del bono a 10 años." },
    { variable: "Premio de riesgo de mercado", valor: "5.5%", fuente: "Damodaran / paper", descripcion: "Equity risk premium de referencia." },
    { variable: "Beta", valor: "3 años daily vs SPY / MERVAL", fuente: "Yahoo Finance chart", descripcion: "Beta con el benchmark de mejor R²." },
    { variable: "Prima de tamaño / país", valor: "0% - 2%", fuente: "Ajuste discrecional del analista", descripcion: "Solo si el paper lo pide." },
  ],
};

function supuestosPorTema(tema: string): Supuesto[] {
  const t = normalizar(tema);
  if (/(emergente|pais|mercados emergentes)/.test(t)) return SUPUESTOS_DEFECTO["EMERGENTES"] ?? [];
  if (/(capm|beta|costo de capital)/.test(t)) return SUPUESTOS_DEFECTO["CAPM"] ?? [];
  return SUPUESTOS_DEFECTO["DCF"] ?? [];
}

/** Extrae supuestos mencionados explícitamente en el texto del paper. */
export function extraerSupuestos(texto: string, tema: string): Supuesto[] {
  const encontrados: Supuesto[] = [];
  const patrones = /([^\n.;]*(?:supuest|asum|premisa|hip[oó]tesis|se asume|considera)[^\n.;]*[.;])/gi;
  for (const m of texto.matchAll(patrones)) {
    const frase = (m[1] ?? "").replace(/\s+/g, " ").trim();
    if (!frase || frase.length > 220) continue;
    encontrados.push({
      variable: frase.split(":")[0]?.trim().slice(0, 60) ?? "Supuesto",
      valor: null,
      fuente: "Texto del paper (pt/)",
      descripcion: frase,
    });
    if (encontrados.length >= 5) break;
  }
  if (!encontrados.length) return supuestosPorTema(tema);
  // Completa con los defaults solo si el paper no cubre esas variables.
  const defaults = supuestosPorTema(tema);
  const todas = [...encontrados];
  const tieneWacc = texto.toLowerCase().includes("wacc");
  const tieneCrec = /crecimiento terminal|crecimiento perpetuo|gordon/i.test(texto);
  if (!tieneWacc && defaults.length) {
    const wacc = defaults.find((d) => /wacc|descuento/i.test(d.variable));
    if (wacc) todas.push(wacc);
  }
  if (!tieneCrec && defaults.length) {
    const gT = defaults.find((d) => /terminal|perpetuo/i.test(d.variable));
    if (gT) todas.push(gT);
  }
  return todas.slice(0, 8);
}

/** ---- API pública ---- */
export async function leerPaper(tema: string): Promise<PaperMetodologia> {
  const temaLimpio = (tema ?? "").trim();
  const papers = indexarPapers();
  const descriptor = elegirDescriptor(temaLimpio, papers);
  const carpetaPt = await existeCarpetaPt();
  let archivo: string | null = null;
  let rutaAbsoluta: string | null = null;
  if (descriptor && carpetaPt) {
    const encontrado = await buscarArchivo(carpetaPt, descriptor.id);
    if (encontrado) {
      archivo = encontrado;
      rutaAbsoluta = encontrado;
    }
  }

  let texto = "";
  let extraidoCompleto = false;
  if (rutaAbsoluta) {
    texto = await extraerTextoPdf(rutaAbsoluta);
    if (texto.trim().length >= 60) {
      extraidoCompleto = true;
    } else {
      texto = "";
    }
  }

  const nombre = descriptor?.nombre ?? (temaLimpio || "Metodología de valoración");
  const categoria = descriptor?.categoria ?? "Knowledge base";
  const resumen = extraidoCompleto
    ? texto.slice(0, 600).replace(/\s+/g, " ").trim()
    : (descriptor
        ? `Paper del índice académico: ${descriptor.id} — ${nombre} (${categoria}). ` +
          "El PDF no permitió extraer texto de forma confiable; se usan los supuestos estándar de la metodología y los datos de mercado."
        : `No se encontró un paper específico para "${temaLimpio}" en la carpeta pt/. Se aplica la metodología DCF estándar con supuestos documentados.`);

  const formulas = extraidoCompleto ? extraerFormulas(texto) : [];
  if (!formulas.length && /dcf|flujo de caja|descontad/i.test(temaLimpio)) {
    formulas.push(
      {
        nombre: "Flujo de caja descontado (DCF) - 2 etapas",
        expresion: "EV = Σ FCFₜ/(1+r)ᵗ + TV/(1+r)ⁿ   con  TV = FCFₙ·(1+g)/(r-g)",
        variables: ["FCF", "R", "G", "N", "TV"],
        contexto: "Modelo de dos etapas: proyección explícita de FCF más valor terminal de Gordon.",
      },
      {
        nombre: "Valor del patrimonio",
        expresion: "ValorAcción = (EV - DeudaNeta) / AccionesCirculación",
        variables: ["EV", "D", "N"],
        contexto: "Del valor de la empresa se resta la deuda neta y se divide por acciones.",
      },
      {
        nombre: "CAPM (costo de capital propio)",
        expresion: "Ke = rf + β·(MRP)",
        variables: ["R", "F", "B", "MRP"],
        contexto: "Costo del capital propio usado en la tasa de descuento.",
      },
    );
  }

  const supuestos = extraidoCompleto
    ? extraerSupuestos(texto, temaLimpio)
    : supuestosPorTema(temaLimpio);

  const variablesRequeridas = Array.from(
    new Set(formulas.flatMap((f) => f.variables.map((v) => v.toUpperCase()))),
  ).slice(0, 12);

  return {
    tema: temaLimpio,
    nombre,
    id: descriptor?.id ?? "",
    categoria,
    archivo,
    rutaAbsoluta,
    textoExtraido: texto.slice(0, 8000),
    extraidoCompleto,
    resumen,
    formulas,
    supuestos,
    variablesRequeridas,
    encontrado: Boolean(descriptor) || Boolean(rutaAbsoluta),
  };
}
