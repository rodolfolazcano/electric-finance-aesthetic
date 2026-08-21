// @ts-nocheck
// Server function: detecta tickers a partir de texto pegado (ej: resumen
// de portafolio IOL) usando el mismo diccionario de la app (sectores.json,
// el que usa el tab Sectores). Devuelve para cada ticker sus variantes
// especie ARS (.BA) y especie D (CEDEAR en USD, sufijo D).
import { createServerFn } from "@tanstack/react-start";
import sectoresData from "@/lib/sectores.json";

export interface PortfolioHolding {
  /** Código base detectado (ej: "AMZN", "PAMP") */
  code: string;
  /** Nombre/descripción, preferentemente el que venía en el texto pegado */
  nombre: string;
  /** Cantidad detectada en el texto (puede ser null) */
  qty: number | null;
  tipo: string;
  moneda: string;
  mercado: string;
  /** True si es / tiene CEDEAR en BCBA (existe variante especie D) */
  esCedear: boolean;
  /** Símbolo en especie D (CEDEAR USD en BCBA), ej: "AMZND" */
  dTicker: string | null;
  /** Símbolo en especie ARS en BCBA, ej: "AMZN.BA", "PAMP.BA" */
  baTicker: string | null;
}

export interface PortafolioDetectado {
  holdings: PortfolioHolding[];
  unknown: string[];
}

const STOPWORDS = new Set([
  "ARS",
  "USD",
  "USDC",
  "MEP",
  "BASE",
  "CEDEAR",
  "CEDEARS",
  "ACCION",
  "ACCIONES",
  "PORTFOLIO",
  "OPERACIONES",
  "MOVIMIENTOS",
  "TENENCIAS",
  "CANTIDAD",
  "VARIACION",
  "VARIACIÓN",
  "MONTO",
  "RENDIMIENTOS",
  "REPORTES",
  "PERSONALES",
  "FLUJO",
  "FONDOS",
  "PROYECTADOS",
  "SALDO",
  "DISPONIBILIDAD",
  "MONEDA",
  "PATRIMONIO",
  "TOTAL",
  "GLOBAL",
  "INGRESAR",
  "RETIRAR",
  "DINERO",
  "ACTIVOS",
  "ORDEN",
  "ULTIMA",
  "ÚLTIMA",
  "ALIAS",
  "CUENTAS",
  "CUENTA",
  "MANDATO",
  "PERFIL",
  "INVERSOR",
  "MODERADO",
  "ARANCEL",
  "CUSTODIO",
  "ARGENTINA",
  "ERSION",
  "REPORTES",
  "TENENCIAS",
  "PROMEDIO",
  "GANANCIA",
  "RENDIMIENTO",
  "OMBRE",
  "CON",
  "EL",
  "LA",
  "LOS",
  "LAS",
  "DE",
  "DEL",
  "EN",
  "Y",
  "POR",
  "QUE",
  "PARA",
  "TIPO",
  "INTERVALO",
  "PERIODO",
  "PERÍODO",
  "ANALIZAR",
  "MERCADO",
  "SELECCIONAR",
  "SECTOR",
  "SIMULACIONES",
  "MONTE",
  "CARLO",
  "BENCHMARK",
  "BENCHMARKS",
  "AUTO",
  "RECALCULAR",
  "DETECTAR",
  "SEMAFORO",
  "SEMÁFORO",
  "TAB",
  "RESUMEN",
  "TU",
  "SU",
  "ES",
  "SE",
  "UN",
  "UNA",
  "UNOS",
  "UNAS",
  "AL",
  "LO",
  "ELS",
  "MONEDAS",
  "SEG",
  "CUSTODIA",
  "VALORES",
  "DIARIA",
  "TENENCIA",
  "PATRIMON",
  "VARIACIO",
  "DISPONIBILIDAD",
  "BERTUCCI",
  "JAVIER",
  "MARCELO",
]);

interface TickerEntry {
  ticker?: string;
  nombre?: string;
  tipo?: string;
  moneda?: string;
  mercado?: string;
  pais?: string;
}

type SectoresMap = Record<string, Record<string, TickerEntry[]>>;

function flattenSectores(): TickerEntry[] {
  const out: TickerEntry[] = [];
  const data = sectoresData as SectoresMap;
  for (const industrias of Object.values(data)) {
    for (const items of Object.values(industrias)) {
      if (Array.isArray(items)) {
        for (const t of items) if (t && typeof t === "object") out.push(t);
      }
    }
  }
  return out;
}

let _index: Record<string, TickerEntry> | null = null;
function getIndex(): Record<string, TickerEntry> {
  if (_index) return _index;
  const idx: Record<string, TickerEntry> = {};
  for (const e of flattenSectores()) {
    const t = String(e.ticker ?? "").toUpperCase();
    if (t && !idx[t]) idx[t] = e;
  }
  _index = idx;
  return idx;
}

function parseQty(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = parseFloat(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function buildHolding(code: string, nombre: string | null, qty: number | null): PortfolioHolding {
  const idx = getIndex();
  const base = idx[code];
  const dEntry = idx[code + "D"];
  const baEntry = idx[code + ".BA"];

  const esCedear =
    base?.tipo === "cedear" || dEntry?.tipo === "cedear" || baEntry?.tipo === "cedear";
  const esAccionBCBA =
    base?.tipo === "accion" && (base?.mercado === "BCBA" || base?.moneda === "ARS");

  return {
    code,
    nombre:
      nombre ?? base?.nombre ?? baEntry?.nombre ?? dEntry?.nombre ?? "Sin nombre en diccionario",
    qty,
    tipo: dEntry?.tipo ?? base?.tipo ?? "desconocido",
    moneda: dEntry?.moneda ?? base?.moneda ?? "—",
    mercado: base?.mercado ?? "—",
    esCedear,
    dTicker: dEntry ? code + "D" : null,
    baTicker: esAccionBCBA || baEntry ? code + ".BA" : base ? code : null,
  };
}

export const detectarTickersPortafolio = createServerFn({ method: "POST" })
  .inputValidator((input: unknown): { raw: string } => {
    const raw = String((input as { raw?: unknown })?.raw ?? "");
    if (!raw.trim()) throw new Error("No se recibió texto para analizar");
    return { raw };
  })
  .handler(async ({ data }): Promise<PortafolioDetectado> => {
    const texto = String(data.raw ?? "");
    const upper = texto.toUpperCase();
    const idx = getIndex();

    const holdingsMap = new Map<string, PortfolioHolding>();
    const unknown = new Set<string>();
    const seen = new Set<string>();

    //  Pase 1: líneas típicas de IOL "TOKEN\n(pct%) | Descripción\nQTY"
    const lineRe =
      /\b([A-Z][A-Z0-9]{1,7})\s*\n\s*\([0-9][0-9.,]*%\)\s*\|\s*([^\n]*)\n\s*([0-9][0-9.,]*)/g;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(texto)) !== null) {
      const code = m[1].toUpperCase();
      const nombre = m[2]?.trim() || null;
      const qty = parseQty(m[3]);
      if (STOPWORDS.has(code)) continue;
      const base = idx[code];
      const hasD = !!idx[code + "D"];
      const hasBA = !!idx[code + ".BA"];
      if (base || hasD || hasBA) {
        holdingsMap.set(code, buildHolding(code, nombre, qty));
        seen.add(code);
      } else {
        unknown.add(code);
      }
    }

    //  Pase 2: líneas del tipo "PAMP 74" / "AMZN 209 1,20%" (ticker + cantidad)
    const qtyLineRe = /^\s*([A-Z][A-Z0-9]{1,7})(?:\.[A-Z]{2,4})?\s+([0-9][0-9.,]*)\b.*$/gm;
    let q: RegExpExecArray | null;
    while ((q = qtyLineRe.exec(upper)) !== null) {
      const code = q[1].toUpperCase();
      if (STOPWORDS.has(code)) continue;
      const base = idx[code];
      const hasD = !!idx[code + "D"];
      const hasBA = !!idx[code + ".BA"];
      if ((base || hasD || hasBA) && !seen.has(code)) {
        holdingsMap.set(code, buildHolding(code, null, parseQty(q[2])));
        seen.add(code);
      }
    }

    //  Pase 3: tokens sueltos (listas separadas por coma/espacio)
    const tokenRe = /(?<![A-Z0-9.])([A-Z][A-Z0-9]{1,7})(?:\.[A-Z]{2,4})?(?![A-Z0-9.])/g;
    let t: RegExpExecArray | null;
    while ((t = tokenRe.exec(upper)) !== null) {
      const code = t[1];
      if (seen.has(code) || STOPWORDS.has(code)) continue;
      if (/^[0-9.]+$/.test(code)) continue;
      const base = idx[code];
      const hasD = !!idx[code + "D"];
      const hasBA = !!idx[code + ".BA"];
      if (base || hasD || hasBA) {
        holdingsMap.set(code, buildHolding(code, null, null));
        seen.add(code);
      } else {
        unknown.add(code);
      }
    }

    return {
      holdings: [...holdingsMap.values()],
      unknown: [...unknown].filter((u) => !STOPWORDS.has(u)).slice(0, 30),
    };
  });
