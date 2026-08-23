/**
 * Scraper Datos Técnicos IOL — reciclado de "scraper bonos.py" (Python/BS4) a TS server-side.
 * Fuente pública: https://iol.invertironline.com/titulo/cotizacion/{mercado}/{simbolo}/-/fundamentalesTecnicos
 * Devuelve condiciones de emisión (vencimiento, cupón, frecuencia, convención) + medidas dinámicas
 * (TIR, duration, convexity, paridad) que IOL publica. Sin autenticación (página pública).
 *
 * Uso principal: FALLBACK cuando RENTA_FIJA_COMPLETA.json trae flujo_fondos: null (AE38, AL41, GD35...)
 * → con las condiciones se regenera el calendario de flujos y se recalcula TODO desde el precio vivo.
 */

export interface CondicionesEmision {
  descripcion?: string;
  isin?: string;
  jurisdiccion?: string;
  tipoCupon?: string;
  moneda?: string;
  frecuenciaPago?: string;
  residual?: number;
  convencionDias?: string;
  vencimiento?: string; // YYYY-MM-DD
  tipoAmortizacion?: string;
  montoEmision?: number;
  cuponAnualPct?: number; // % anual
  valorPar?: number;
}

export interface MedidasDinamicas {
  tir?: number; // decimal (ej 0.1064)
  tna?: number;
  paridad?: number; // ratio (ej 0.7768) o % según página
  interesesAcumulados?: number;
  valorTecnico?: number;
  durationModificada?: number;
  macaulayDuration?: number;
  convexity?: number;
  currentYield?: number;
}

export interface TecnicosBono extends CondicionesEmision, MedidasDinamicas {
  simbolo: string;
  mercado: string;
  fuente: string;
  timestamp: number;
}

// ── Cache en memoria + persistido (condiciones de emisión son estáticas → TTL largo) ──
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 días para condiciones
const memoria = new Map<string, { data: TecnicosBono; at: number }>();

function cacheGet(key: string): TecnicosBono | null {
  const hit = memoria.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;
  return null;
}
function cacheSet(key: string, data: TecnicosBono) {
  memoria.set(key, { data, at: Date.now() });
  persistirBestEffort(key, data);
}

function persistirBestEffort(key: string, data: TecnicosBono) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("node:fs");
    const path = require("node:path");
    const dir = path.join(process.cwd(), ".data", "renta-fija");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "tecnicos-iol.json");
    let obj: Record<string, any> = {};
    if (fs.existsSync(file)) obj = JSON.parse(fs.readFileSync(file, "utf-8"));
    obj[key] = data;
    fs.writeFileSync(file, JSON.stringify(obj).slice(0, 2_000_000));
  } catch {}
}

// ── Helpers de parseo ──

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parsea números es-AR: "10,64 %", "0.776757", "7.213.696.728", "5%" */
function parseNumEs(raw: string | undefined | null): number | null {
  if (!raw) return null;
  let s = raw.replace(/%/g, "").replace(/\s/g, "").trim();
  if (!s) return null;
  if (s.includes(",")) {
    // formato AR: puntos miles, coma decimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // solo puntos múltiples → miles (monto emisión)
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const MAP_CLAVES: Record<string, string> = {
  descripcion: "descripcion",
  jurisdiccion: "jurisdiccion",
  tipo_de_cupon: "tipoCupon",
  moneda: "moneda",
  frecuencia_de_pago: "frecuenciaPago",
  residual: "residual",
  convencion_de_conteo_de_dias: "convencionDias",
  vencimiento: "vencimiento",
  tipo_de_amortizacion: "tipoAmortizacion",
  monto_de_emision: "montoEmision",
  cupon_anual: "cuponAnualPct",
  valor_par: "valorPar",
  tir: "tir",
  tna: "tna",
  paridad: "paridad",
  intereses_acumulados: "interesesAcumulados",
  valor_tecnico: "valorTecnico",
  duration: "durationModificada",
  macaulay_duration: "macaulayDuration",
  convexity: "convexity",
  current_yield: "currentYield",
};

const NUMERICOS = new Set([
  "residual", "montoEmision", "cuponAnualPct", "valorPar",
  "tir", "tna", "paridad", "interesesAccumPlaceholder", "interesesAcumulados",
  "valorTecnico", "durationModificada", "macaulayDuration", "convexity", "currentYield",
]);

function extraerIsin(descripcion: string | undefined): string | undefined {
  if (!descripcion) return undefined;
  const m = descripcion.match(/\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/);
  return m?.[1];
}

// ── Scraper principal ──

export async function scrapearTecnicosBono(
  simboloRaw: string,
  mercado = "BCBA",
): Promise<TecnicosBono | null> {
  const simbolo = simboloRaw.trim().toUpperCase();
  const cacheKey = `${mercado}:${simbolo}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const url = `https://iol.invertironline.com/titulo/cotizacion/${mercado}/${encodeURIComponent(simbolo)}/-/fundamentalesTecnicos`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    } as any);
    if (!res.ok) return null;
    const html = await res.text();

    // Tabla técnica: primera table.table-striped de la página
    const tablaMatch = html.match(/<table[^>]*class="[^"]*table-striped[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
    if (!tablaMatch) return null;
    const tablaHtml = tablaMatch[1]!;

    const pares: Record<string, string> = {};
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowM: RegExpExecArray | null;
    while ((rowM = rowRe.exec(tablaHtml)) !== null) {
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells: string[] = [];
      let cellM: RegExpExecArray | null;
      while ((cellM = cellRe.exec(rowM[1]!)) !== null) cells.push(stripTags(cellM[1]!));
      if (cells.length >= 2) {
        const clave = cells[0]!.toLowerCase().replace(/ /g, "_").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        pares[clave] = cells.slice(1).join(" ");
      }
    }

    const out: TecnicosBono = { simbolo, mercado, fuente: url, timestamp: Date.now() };
    for (const [claveCruda, valorCrudo] of Object.entries(pares)) {
      const campo = MAP_CLAVES[claveCruda];
      if (!campo) continue;
      if (NUMERICOS.has(campo)) {
        (out as any)[campo] = parseNumEs(valorCrudo);
      } else {
        (out as any)[campo] = valorCrudo || undefined;
      }
    }
    out.isin = extraerIsin(out.descripcion);

    // Normalizar unidades de medidas según formato de la página:
    // TIR/TNA vienen como "10,64" (%) → decimal; Paridad puede venir 77,68 (%) o 0,7768 (ratio)
    if (out.tir != null && out.tir > 1) out.tir = out.tir / 100;
    if (out.tna != null && out.tna > 1) out.tna = out.tna / 100;
    if (out.currentYield != null && out.currentYield > 1) out.currentYield /= 100;
    if (out.interesesAcumulados != null && out.interesesAcumulados > 1) out.interesesAcumulados /= 100;
    if (out.valorTecnico != null && out.valorTecnico > 5) out.valorTecnico /= 100;

    cacheSet(cacheKey, out);
    return out;
  } catch {
    return null;
  }
}

// ── Generador de flujos desde condiciones de emisión ──

export interface FlujoGenerado {
  fecha: string;
  tipo: string;
  monto_por_cien: number;
  moneda: string;
}

export function mesesPorFrecuenciaIng(frecuencia: string | undefined): number {
  const f = (frecuencia || "").toLowerCase();
  if (f.includes("month") || f.includes("mensual")) return 1;
  if (f.includes("quarter") || f.includes("trimes")) return 3;
  if (f.includes("semi")) return 6;
  if (f.includes("annual") || f.includes("anual") || f.includes("year")) return 12;
  return 6;
}

/**
 * Regenera el calendario de flujos futuros a partir de condiciones de emisión
 * (scrapeadas de IOL o del JSON maestro). Bullet/Sinkable sin cronograma → capital al vencimiento.
 * Limitación conocida: step-ups se modelan a tasa plana (la página no expone escalones).
 */
export function generarFlujosDesdeCondiciones(cond: {
  vencimiento: string;
  cuponAnualPct: number;
  frecuenciaPago?: string;
  residual?: number;
  moneda?: string;
}): FlujoGenerado[] {
  const [y, m, d] = cond.vencimiento.split("-").map(Number);
  if (!y || !m || !d) return [];
  const venc = new Date(Date.UTC(y, m - 1, d, 12));
  const hoy = new Date();
  hoy.setUTCHours(12, 0, 0, 0);
  if (venc <= hoy) return [];

  const meses = mesesPorFrecuenciaIng(cond.frecuenciaPago);
  const cuponPeriodo = +(((cond.cuponAnualPct ?? 0) * meses) / 12).toFixed(6);
  const residual = cond.residual ?? 100;
  const moneda = (cond.moneda ?? "USD").toUpperCase().includes("ARS") ? "ARS" : "USD";

  const fechas: Date[] = [];
  const cursor = new Date(venc);
  while (cursor > hoy && fechas.length < 200) {
    fechas.push(new Date(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() - meses);
  }
  fechas.reverse();

  return fechas.map((fecha, i) => {
    const esUltimo = i === fechas.length - 1;
    return {
      fecha: fecha.toISOString().slice(0, 10),
      tipo: esUltimo ? "Cupon+Amortizacion" : "Cupon",
      monto_por_cien: esUltimo ? +(cuponPeriodo + residual).toFixed(6) : cuponPeriodo,
      moneda,
    };
  });
}
