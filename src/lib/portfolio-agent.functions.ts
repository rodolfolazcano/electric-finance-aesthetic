// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";

// ── Types ──────────────────────────────────────────────────────────────

export type ActivoClasificacion =
  | "Accion" | "ADR" | "CEDEAR" | "Bono" | "Letra" | "ON"
  | "ETF" | "FCI" | "Opcion" | "Futuro" | "Caucion"
  | "Moneda" | "Cripto" | "Otro";

export type CategoriaMacro = "RentaVariable" | "RentaFija" | "Efectivo";
export type MercadoTipo = "BCBA" | "NYSE/NASDAQ" | "CRIPT" | "OTRO";
export type MonedaTipo = "ARS" | "USD" | "USD.C";

export interface DataFrameRow {
  id: string;
  ticker: string;
  nombre: string;
  tipo: ActivoClasificacion;
  categoriaMacro: CategoriaMacro;
  sector: string;
  industria: string;
  mercado: MercadoTipo;
  monedaOrigen: MonedaTipo;
  cantidad: number;
  precioPromedio: number | null;
  ultimoOperado: number | null;
  ganancia: number | null;
  montoMonedaOrigen: number;
  variacion24h: number | null;
  rendimientoPct: number | null;
  pesoPct: number;
  fuentePrecio: "Paste" | "Catalogo" | "IOL";
  revisar: string[];
}

export interface ClienteDetectado {
  nombreCompleto: string | null;
  cuenta: string | null;
  alias: string | null;
  perfil: string | null;
  custodio: string | null;
  mandato: string | null;
  arancel: string | null;
}

export interface ResumenPortfolio {
  patrimonioTotal: number;
  invertido: number;
  efectivo: number;
  porGrupo: { grupo: string; cantidad: number; monto: number; pesoPct: number }[];
  porMoneda: { moneda: string; monto: number; pesoPct: number }[];
  tickersDesconocidos: string[];
}

export interface PortafolioImportado {
  cliente: ClienteDetectado;
  filas: DataFrameRow[];
  resumen: ResumenPortfolio;
  avisos: string[];
}

// ── Catalogo (lazy, cached) ────────────────────────────────────────────

interface TickerEntry {
  ticker: string;
  nombre: string;
  tipo: string;
  moneda: string;
  mercado: string;
  pais: string;
  sector: string;
  industria: string;
}

let CATALOGO: Map<string, TickerEntry> | null = null;
let CEDEARS: { ARS: Set<string>; USD: Set<string> } | null = null;
let BONOS: Record<string, any> | null = null;

function normTk(t: string): string {
  return t.toUpperCase().trim();
}

async function loadCatalogs() {
  if (CATALOGO) return;
  try {
    const [sectoresMod, cedearsMod, bonosMod] = await Promise.all([
      import("@/data/unificado_completo.json"),
      import("@/data/cedears-universe.json"),
      import("@/data/bonos.json"),
    ]);
    const sectores = (sectoresMod as any).default ?? sectoresMod;
    const cedears = (cedearsMod as any).default ?? cedearsMod;
    BONOS = (bonosMod as any).default ?? bonosMod;

    const mapa = new Map<string, TickerEntry>();
    const root = sectores.sectores ?? sectores;
    for (const [sector, secObj] of Object.entries(root)) {
      const industrias = (secObj as any).industrias ?? secObj;
      for (const [industria, lista] of Object.entries(industrias)) {
        if (!Array.isArray(lista)) continue;
        for (const item of lista as any[]) {
          const tk = normTk(item.ticker);
          const entry: TickerEntry = {
            ticker: tk,
            nombre: item.nombre ?? "",
            tipo: item.tipo ?? "accion",
            moneda: item.moneda ?? "ARS",
            mercado: item.mercado ?? "BCBA",
            pais: item.pais ?? "",
            sector,
            industria,
          };
          const prev = mapa.get(tk);
          if (!prev || (!prev.nombre && entry.nombre)) mapa.set(tk, entry);
        }
      }
    }
    CATALOGO = mapa;
    CEDEARS = {
      ARS: new Set((cedears.ARS ?? []).map((x: string) => normTk(x))),
      USD: new Set((cedears.USD ?? []).map((x: string) => normTk(x))),
    };
  } catch {
    CATALOGO = new Map();
    CEDEARS = { ARS: new Set(), USD: new Set() };
    BONOS = {};
  }
}

// ── Clasificador (razona: sección + descripción + catálogo + patrones) ──

interface ClasifCtx {
  seccion?: string;      // "acciones"|"cedears"|"bonos"|"on"|"letras"|"fci"|"cauciones"|...
  descripcion?: string;  // texto del paste ej "USD ON Celulosa Arg. Vto. ..."
}

interface ClasifOut {
  tipo: ActivoClasificacion;
  categoriaMacro: CategoriaMacro;
  mercado: MercadoTipo;
  moneda: MonedaTipo;
  nombre: string;
  sector: string;
  industria: string;
  revisar: string[];
}

const ETF_CEDears = new Set(["SPY", "SMH", "URA", "XLE", "QQQ", "IWM", "DIA", "SLV", "GLD"]);

function clasificarTicker(tickerRaw: string, ctx: ClasifCtx = {}): ClasifOut {
  const t = normTk(tickerRaw);
  const clean = t.replace(/\.BA$/, "");
  const desc = (ctx.descripcion ?? "").toUpperCase();
  const revisar: string[] = [];

  const out = (
    tipo: ActivoClasificacion,
    cat: CategoriaMacro,
    mercado: MercadoTipo,
    moneda: MonedaTipo,
    nombre: string,
    sector: string,
    industria: string
  ): ClasifOut => ({ tipo, categoriaMacro: cat, mercado, moneda, nombre, sector, industria, revisar });

  // 1) DESCRIPCIÓN del paste (pista más fuerte — el broker la provee)
  if (/\bCEDEAR\b/.test(desc)) return out("CEDEAR", "RentaVariable", "BCBA", "ARS", "", "", "");
  if (/\bON\b|OBLIGACIONES?\s+NEGOCIABLE/.test(desc))
    return out("ON", "RentaFija", "BCBA", "ARS", "", "Renta Fija", "Obligaciones Negociables");
  if (/\bBONO\b|BONAR|BOCON|BONCENT|TESORO|SOBERANO|PROGRESAR|CUOTA PURA/.test(desc))
    return out("Bono", "RentaFija", "BCBA", "ARS", "", "Renta Fija", "Bonos");
  if (/\bLETRA\b|\bLECAP\b|\bTEM\b/.test(desc))
    return out("Letra", "RentaFija", "BCBA", "ARS", "", "Renta Fija", "Letras");
  if (/\bFCI\b|FONDO COMÚN|FONDO COMUN/.test(desc))
    return out("FCI", "RentaFija", "BCBA", "ARS", "", "Renta Fija", "FCI");
  if (/\bCAUCION\b/.test(desc))
    return out("Caucion", "RentaFija", "BCBA", "ARS", "", "Renta Fija", "Cauciones");

  // 2) SECCIÓN del paste (contexto estructural)
  const sec = ctx.seccion;
  if (sec === "bonos" || sec === "on")
    return out(sec === "on" ? "ON" : "Bono", "RentaFija", "BCBA", "ARS", "", "Renta Fija", sec === "on" ? "Obligaciones Negociables" : "Bonos");
  if (sec === "letras")
    return out("Letra", "RentaFija", "BCBA", "ARS", "", "Renta Fija", "Letras");
  if (sec === "fci")
    return out("FCI", "RentaFija", "BCBA", "ARS", "", "Renta Fija", "FCI");
  if (sec === "cauciones")
    return out("Caucion", "RentaFija", "BCBA", "ARS", "", "Renta Fija", "Cauciones");
  if (sec === "cedears") {
    const esETF = ETF_CEDears.has(clean) || /^\s*ETF\s/i.test(ctx.descripcion ?? "");
    return out(esETF ? "ETF" : "CEDEAR", "RentaVariable", "BCBA", "ARS", "", "", esETF ? "CEDEARs ETF" : "CEDEARs");
  }

  // 3) BONOS DB local
  if (BONOS?.[t]) {
    const b = BONOS[t];
    const esOn = String(b.tipo ?? "").startsWith("ON");
    return out(esOn ? "ON" : "Bono", "RentaFija", "BCBA", "ARS", b.nombre ?? "", "Renta Fija", esOn ? "Obligaciones Negociables" : "Bonos");
  }

  // 4) CATÁLOGO unificado
  const found = CATALOGO?.get(t) ?? CATALOGO?.get(clean);
  if (found) {
    if (found.tipo === "cedear")
      return out("CEDEAR", "RentaVariable", "BCBA", found.moneda === "USD" ? "USD" : "ARS", found.nombre, found.sector, found.industria);
    if (found.tipo === "accion" && found.pais === "EE.UU.")
      return out("ADR", "RentaVariable", "NYSE/NASDAQ", "USD", found.nombre, found.sector, found.industria);
    if (found.tipo === "accion")
      return out("Accion", "RentaVariable", "BCBA", "ARS", found.nombre, found.sector, found.industria);
  }

  // 5) Universo CEDEARs
  if (CEDEARS?.ARS.has(clean) || CEDEARS?.USD.has(clean))
    return out("CEDEAR", "RentaVariable", "BCBA", "ARS", "", "", "CEDEARs");

  // 6) PATRONES sintácticos
  // Letras: S23A5/T24B2 o S23A
  if (/^[ST]\d{2}[A-Z]\d?$/.test(t))
    return out("Letra", "RentaFija", "BCBA", "ARS", "", "Renta Fija", "Letras");
  // Bonos soberanos típicos: AL30 GD30 AE38 GD41 AO28 CRCEO IRCPF YMCIO TC24 TP21...
  if (/^(AL|GD|AE|AO|TD|BP|TP|TV|DI|CU|PR|NO|YM|CR|IR|PA|PB|PC)[A-Z0-9]{2}$/.test(clean) && /\d/.test(clean))
    return out("Bono", "RentaFija", "BCBA", "ARS", "", "Renta Fija", "Bonos");

  if (t.endsWith(".BA"))
    return out("Accion", "RentaVariable", "BCBA", "ARS", "", "", "");
  if (/^[A-Z]{1,5}$/.test(clean)) {
    revisar.push(`# REVISAR: ${clean} no está en catálogo — resolver con IOL`);
    return out("ADR", "RentaVariable", "NYSE/NASDAQ", "USD", "", "", "", );
  }

  revisar.push(`# REVISAR: ${t} no identificado`);
  return out("Otro", "RentaVariable", "OTRO", "ARS", "", "", "");
}

// ── Parsing numérico es-AR ─────────────────────────────────────────────

function parseNumEs(s: string | null): number | null {
  if (!s) return null;
  const negativo = s.includes("-");
  const clean = s.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

function genId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// ── Parser Broker AR (posicional por bloque) ───────────────────────────

const TICKER_RE = /^[A-Z][A-Z0-9]{1,6}(\.BA)?$/;
const JUNK_TICKERS = new Set(["BASE", "MEP", "C", "I", "USD", "USDC", "ARS", "PDF", "ETF", "FCI", "ON", "CI"]);
const SECCION_HEADERS = [
  "acciones", "cedears", "bonos", "obligaciones negociables", "letras",
  "fondos comunes", "fci", "cauciones", "opciones", "futuros", "cripto",
  "dólares", "dolares", "dólares cable", "dolares cable", "pesos",
];

interface ActivoBruto {
  tickerNorm: string;
  nombre: string;
  cantidad: number;
  ultimoOperado: number | null;
  precioPromedio: number | null;
  ganancia: number | null;
  montoMonedaOrigen: number;
  monedaPrecios: MonedaTipo;
  variacion24h: number | null;
  rendimientoPct: number | null;
  seccion: string;
  descripcion: string;
}

function esSeccionHeader(line: string): string | null {
  const low = line.toLowerCase();
  for (const h of SECCION_HEADERS) {
    if (low.startsWith(h) || low === h) return h;
  }
  return null;
}

export function parseBrokerAR(text: string): {
  cliente: Partial<ClienteDetectado>;
  activos: ActivoBruto[];
  resumen: Partial<ResumenPortfolio>;
} {
  const lines = text.split("\n").map((l) => l.trim());
  const cliente: Partial<ClienteDetectado> = {};
  const activos: ActivoBruto[] = [];

  // Cliente (soporta APELLIDO, NOMBRE en CAPS y Title Case)
  for (const l of lines) {
    const s = l.trim();
    if (!s || s.includes(":")) continue;
    if (/^(patrimonio|monto|última|ultima|ingresar|retirar|saldo|portfolio|operaciones|movimientos|reportes|datos)/i.test(s)) continue;
    const caps = s.match(/^([A-ZÑÁÉÍÓÚÜ][A-ZÑÁÉÍÓÚÜ\s]+),\s*([A-ZÑÁÉÍÓÚÜ][A-Za-záéíóúñü\s]+)$/);
    const title = s.match(/^([A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+(?:\s+[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+)+),\s*([A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+(?:\s+[A-Za-záéíóúñü]+)*)$/);
    if (caps) cliente.nombreCompleto = `${caps[1]}, ${caps[2]}`;
    else if (title) cliente.nombreCompleto = `${title[1]}, ${title[2]}`;
  }
  for (const l of lines) {
    const cu = l.match(/Cuentas?:\s*(\d+)/i);
    if (cu) cliente.cuenta = cu[1];
    const al = l.match(/Alias:\s*(\S+)/i);
    if (al) cliente.alias = al[1];
    const pe = l.match(/Perfil de inversor:\s*(.+)/i);
    if (pe) cliente.perfil = pe[1].trim();
    const cuu = l.match(/Custodio\s+(.+)/i);
    if (cuu) cliente.custodio = cuu[1].trim();
    const ma = l.match(/Con mandato:\s*(Sí|No|Si|NO|SI)/i);
    if (ma) cliente.mandato = ma[1];
    const ar = l.match(/Arancel:\s*([\d,.]+\s*%)/i);
    if (ar) cliente.arancel = ar[1].trim();
  }

  // Resumen global
  let patrimonioTotal: number | null = null;
  let montoEnActivos: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (/patrimonio total/i.test(lines[i])) {
      for (let k = i; k < Math.min(i + 6, lines.length); k++) {
        const m = lines[k].match(/ARS\s*([\d.,]+)/);
        if (m) { patrimonioTotal = parseNumEs(m[1]); break; }
      }
    }
    if (/monto en activos/i.test(lines[i])) {
      for (let k = i; k < Math.min(i + 6, lines.length); k++) {
        const m = lines[k].match(/ARS\s*([\d.,]+)/);
        if (m) { montoEnActivos = parseNumEs(m[1]); break; }
      }
    }
  }

  // Localizar inicio de Tenencias (evita tabla Saldo por Disponibilidad)
  const tenIdx = lines.findIndex((l) => /^tenencias$/i.test(l.trim()));
  const startIdx = tenIdx >= 0 ? tenIdx : 0;

  // Máquina de secciones + bloques posicionales
  let seccionActual = "otros";
  const cashVistos = new Set<string>();

  for (let idx = startIdx; idx < lines.length; idx++) {
    const raw = lines[idx];
    const line = raw.trim();
    if (!line) continue;

    // ¿Header de sección?
    const secHdr = esSeccionHeader(line);
    if (secHdr) {
      seccionActual = secHdr;
      continue;
    }

    // ¿Cash? (secciones Dólares/Pesos/Dólares cable) — una sola fila por moneda
    const low = line.toLowerCase();
    const esCashSec =
      low.startsWith("dólares") || low.startsWith("dolares") ||
      low.startsWith("pesos") || low.startsWith("usd.c") || low.startsWith("dólar cable") ||
      low.startsWith("dolar cable");

    if (esCashSec || seccionActual.startsWith("dólares") || seccionActual.startsWith("dolares") || seccionActual === "pesos") {
      // buscar monto en esta línea y siguientes cercanas
      let monto: number | null = null;
      let moneda: MonedaTipo | null = null;
      const scope = lines.slice(idx, Math.min(idx + 5, lines.length));
      for (const s of scope) {
        if (/USD\.C\s*([\d.,]+)/.test(s)) {
          monto = parseNumEs(s.match(/USD\.C\s*([\d.,]+)/)?.[1]);
          moneda = "USD.C";
          break;
        }
        if (/\bUSD\s*([\d.,]+)/.test(s)) {
          monto = parseNumEs(s.match(/\bUSD\s*([\d.,]+)/)?.[1]);
          moneda = "USD";
          break;
        }
        if (/\bARS\s*([\d.,]+)/.test(s)) {
          monto = parseNumEs(s.match(/\bARS\s*([\d.,]+)/)?.[1]);
          moneda = "ARS";
          break;
        }
      }
      if (monto != null && moneda) {
        const key = moneda === "ARS" ? "ARS" : moneda;
        if (!cashVistos.has(key) && monto > 0) {
          cashVistos.add(key);
          activos.push({
            tickerNorm: key,
            nombre: key === "ARS" ? "Pesos" : key === "USD.C" ? "Dólares cable" : "Dólares",
            cantidad: 1,
            ultimoOperado: null,
            precioPromedio: null,
            ganancia: null,
            montoMonedaOrigen: monto,
            monedaPrecios: key,
            variacion24h: null,
            rendimientoPct: null,
            seccion: "efectivo",
            descripcion: "",
          });
        }
      }
      if (esCashSec) continue;
      // si la línea era header de otra cosa cae abajo
    }

    // ¿Ticker?
    if (!TICKER_RE.test(line) || JUNK_TICKERS.has(line)) continue;

    // Recolectar bloque hasta próximo ticker/sección
    const bloque: string[] = [];
    let j = idx + 1;
    while (j < lines.length) {
      const nx = lines[j].trim();
      if (!nx) { j++; if (bloque.length > 0) bloque.push(""); continue; }
      if (TICKER_RE.test(nx) && !JUNK_TICKERS.has(nx)) break;
      if (esSeccionHeader(nx)) break;
      if (nx.toLowerCase().startsWith("tenencias")) break;
      bloque.push(nx);
      j++;
      if (bloque.filter(Boolean).length >= 14) break;
    }

    // Parseo posicional del bloque
    let nombre = "";
    let descripcion = "";
    let cantidad: number | null = null;
    const precios: { moneda: MonedaTipo; valor: number }[] = [];
    const pctsStandalone: { idx: number; val: number }[] = [];

    for (let b = 0; b < bloque.length; b++) {
      const bl = bloque[b];
      if (!bl) continue;
      // nombre: "(12.34%) | Descripcion"
      const nm = bl.match(/^\(?[\d.,]+%\)?\s*\|\s*(.+)/);
      if (nm && !nombre) { nombre = nm[1].trim(); descripcion = nm[1].trim(); continue; }
      // cantidad entera suelta
      if (cantidad == null && /^\d{1,7}$/.test(bl)) { cantidad = parseInt(bl, 10); continue; }
      // precios ARS/USD/USDC
      const pm = bl.match(/(USD\.C|USD|ARS)\s*(-?[\d.,]+)/);
      if (pm) {
        const mon: MonedaTipo = pm[1] === "USD.C" ? "USD.C" : (pm[1] as MonedaTipo);
        const val = parseNumEs(pm[2]);
        if (val != null) precios.push({ moneda: mon, valor: val });
        continue;
      }
      // % standalone (var o rendimiento)
      const pc = bl.match(/^(-?[\d.,]+)\s*%/);
      if (pc) {
        const v = parseNumEs(pc[1]);
        if (v != null) pctsStandalone.push({ idx: b, val: v });
        continue;
      }
      // capturar descripción alternativa (línea con pipe)
      if (!descripcion && bl.includes("|")) descripcion = bl.split("|").pop()?.trim() ?? "";
    }

    const primerPrecioIdx = bloque.findIndex((bl) => /(USD\.C|USD|ARS)\s*-?[\d.,]/.test(bl));
    const variacion24h =
      pctsStandalone.find((p) => primerPrecioIdx === -1 || p.idx < primerPrecioIdx)?.val ??
      (pctsStandalone.length > 0 ? pctsStandalone[pctsStandalone.length - 1].val : null);
    const rendimientoPct =
      pctsStandalone.length >= 2 ? pctsStandalone[pctsStandalone.length - 1].val : null;

    const ultimoOperado = precios[0]?.valor ?? null;
    const precioPromedio = precios[1]?.valor ?? null;
    const ganancia = precios.length >= 3 ? precios[2]?.valor ?? null : null;
    const monto = precios.length >= 1 ? precios[precios.length - 1].valor : 0;
    const monedaPrecios: MonedaTipo = precios[0]?.moneda ?? "ARS";

    // Validación: debe parecer activo real
    if (cantidad != null && (monto > 0 || ultimoOperado != null)) {
      activos.push({
        tickerNorm: line.replace(/\.BA$/, ""),
        nombre,
        cantidad,
        ultimoOperado,
        precioPromedio,
        ganancia,
        montoMonedaOrigen: monto,
        monedaPrecios,
        variacion24h,
        rendimientoPct,
        seccion: seccionActual,
        descripcion,
      });
    }
    idx = j - 1;
  }

  return {
    cliente,
    activos,
    resumen: {
      patrimonioTotal: patrimonioTotal ?? undefined,
      invertido: montoEnActivos ?? undefined,
    },
  };
}

// ── Parser CSV/TSV ─────────────────────────────────────────────────────

export function parseCSV(text: string): any[] {
  const firstLine = text.split("\n")[0] ?? "";
  const delim = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";
  const rows: any[] = [];
  const linesList = text.split("\n").filter((l) => l.trim());
  if (linesList.length < 2) return rows;

  const headers = linesList[0].split(delim).map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  const tIdx = headers.findIndex((h) => /ticker|symbol|activo/.test(h));
  const qIdx = headers.findIndex((h) => /cantidad|qty|quantity|unidades/.test(h));
  const pIdx = headers.findIndex((h) => /precio|price|promedio|costo/.test(h));
  const mIdx = headers.findIndex((h) => /monto|valor|amount|value/.test(h));
  if (tIdx === -1) return rows;

  for (let i = 1; i < linesList.length; i++) {
    const cols = linesList[i].split(delim).map((c) => c.trim().replace(/"/g, ""));
    const ticker = cols[tIdx]?.toUpperCase();
    if (!ticker) continue;
    rows.push({
      tickerNorm: ticker.replace(/\.BA$/, ""),
      nombre: "",
      cantidad: qIdx !== -1 ? parseNumEs(cols[qIdx]) ?? 0 : 0,
      ultimoOperado: null,
      precioPromedio: pIdx !== -1 ? parseNumEs(cols[pIdx]) : null,
      ganancia: null,
      montoMonedaOrigen: mIdx !== -1 ? parseNumEs(cols[mIdx]) ?? 0 : 0,
      monedaPrecios: "ARS",
      variacion24h: null,
      rendimientoPct: null,
      seccion: "otros",
      descripcion: "",
    });
  }
  return rows;
}

// ── Parser líneas simples ──────────────────────────────────────────────

export function parseSimpleLines(text: string): any[] {
  const rows: any[] = [];
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^([A-Z][A-Z0-9]{1,6}(?:\.BA)?)\s+(?:x\s+)?(\d+(?:[.,]\d+)?)\s*(?:([\d.,]+))?$/i);
    if (m) {
      rows.push({
        tickerNorm: m[1].toUpperCase().replace(/\.BA$/, ""),
        nombre: "",
        cantidad: parseInt(m[2], 10),
        ultimoOperado: null,
        precioPromedio: m[3] ? parseNumEs(m[3]) : null,
        ganancia: null,
        montoMonedaOrigen: 0,
        monedaPrecios: "ARS",
        variacion24h: null,
        rendimientoPct: null,
        seccion: "otros",
        descripcion: "",
      });
    }
  }
  return rows;
}

// ── Resolución IOL para desconocidos (tipo/mercado/moneda reales) ──────

function iolToken(bearerToken?: string | null): string | null {
  if (bearerToken) return bearerToken;
  const envToken = process.env.IOL_EXTERNAL_TOKEN;
  return envToken ?? null;
}

async function iolTituloRaw(token: string, mercado: string, simbolo: string) {
  try {
    const r = await fetch(
      `https://api.invertironline.com/api/v2/${mercado}/Titulos/${encodeURIComponent(simbolo)}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" }
    );
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

const IOL_TIPO_MAP: Record<string, { tipo: ActivoClasificacion; cat: CategoriaMacro }> = {
  acciones: { tipo: "Accion", cat: "RentaVariable" },
  adrs: { tipo: "ADR", cat: "RentaVariable" },
  cedears: { tipo: "CEDEAR", cat: "RentaVariable" },
  titulospublicos: { tipo: "Bono", cat: "RentaFija" },
  bonos: { tipo: "Bono", cat: "RentaFija" },
  letras: { tipo: "Letra", cat: "RentaFija" },
  obligacionesnegociables: { tipo: "ON", cat: "RentaFija" },
  cauciones: { tipo: "Caucion", cat: "RentaFija" },
  fondoscomunesinversion: { tipo: "FCI", cat: "RentaFija" },
  etf: { tipo: "ETF", cat: "RentaVariable" },
  opciones: { tipo: "Opcion", cat: "RentaVariable" },
  futuros: { tipo: "Futuro", cat: "RentaVariable" },
  monedas: { tipo: "Moneda", cat: "Efectivo" },
  criptomonedas: { tipo: "Cripto", cat: "RentaVariable" },
};

function mapMonedaIOL(m: string | undefined | null): MonedaTipo {
  const k = (m ?? "").toLowerCase();
  if (k.includes("usd") && k.includes("cable")) return "USD.C";
  if (k === "usd" || k.includes("dolar estadounidense")) return "USD";
  return "ARS";
}

async function resolverConIOL(
  filas: DataFrameRow[],
  bearerToken?: string | null
): Promise<number> {
  const token = iolToken(bearerToken);
  if (!token) return 0;
  const pendientes = filas.filter((f) => f.revisar.length > 0 && f.tipo !== "Moneda").slice(0, 20);
  let resueltos = 0;
  for (const f of pendientes) {
    let titulo = await iolTituloRaw(token, "bCBA", f.ticker);
    if (!titulo) titulo = await iolTituloRaw(token, "nYSE", f.ticker);
    if (!titulo?.tipo) continue;
    const mapped = IOL_TIPO_MAP[String(titulo.tipo).toLowerCase()];
    if (!mapped) continue;
    f.tipo = mapped.tipo;
    f.categoriaMacro = mapped.cat;
    f.mercado = String(titulo.mercado ?? "").toLowerCase() === "nyse" ? "NYSE/NASDAQ" : "BCBA";
    f.monedaOrigen = mapMonedaIOL(titulo.moneda);
    f.nombre = titulo.descripcion ?? f.nombre;
    f.fuentePrecio = "IOL";
    f.revisar = [];
    resueltos++;
  }
  return resueltos;
}

// ── Server-fn principal ────────────────────────────────────────────────

export const importarPortfolioPegado = createServerFn({ method: "POST" })
  .inputValidator((d: { texto: string; bearerToken?: string }) => d)
  .handler(async ({ data }): Promise<PortafolioImportado> => {
    await loadCatalogs();

    const text = data.texto.trim();
    const avisos: string[] = [];
    let activos: any[] = [];
    let cliente: Partial<ClienteDetectado> = {};
    let resumenParcial: Partial<ResumenPortfolio> = {};

    const esBrokerAR = /Patrimonio total|Monto en activos|Tenencias|Custodio|Perfil de inversor/i.test(text);

    if (esBrokerAR) {
      const p = parseBrokerAR(text);
      activos = p.activos;
      cliente = p.cliente;
      resumenParcial = p.resumen;
      avisos.push("Formato detectado: Broker AR (tenencias por sección)");
    } else {
      activos = parseSimpleLines(text);
      if (activos.length === 0) activos = parseCSV(text);
      avisos.push(activos.length ? "Formato detectado: líneas simples / CSV" : "Formato detectado: desconocido");
    }

    if (activos.length === 0) {
      avisos.push("⚠ No se detectaron activos. Pegá formato broker, CSV o líneas 'TICKER cantidad precio'.");
      return {
        cliente: { nombreCompleto: null, cuenta: null, alias: null, perfil: null, custodio: null, mandato: null, arancel: null },
        filas: [],
        resumen: { patrimonioTotal: 0, invertido: 0, efectivo: 0, porGrupo: [], porMoneda: [], tickersDesconocidos: [] },
        avisos,
      };
    }

    // Clasificar
    const filas: DataFrameRow[] = [];
    const desconocidos: string[] = [];

    for (const a of activos) {
      if (a.seccion === "efectivo" || a.tickerNorm === "USD" || a.tickerNorm === "ARS" || a.tickerNorm === "USD.C") {
        filas.push({
          id: genId(),
          ticker: a.tickerNorm,
          nombre: a.nombre,
          tipo: "Moneda",
          categoriaMacro: "Efectivo",
          sector: "Efectivo",
          industria: "Efectivo",
          mercado: "BCBA",
          monedaOrigen: a.monedaPrecios ?? a.tickerNorm,
          cantidad: 1,
          precioPromedio: null,
          ultimoOperado: null,
          ganancia: null,
          montoMonedaOrigen: a.montoMonedaOrigen,
          variacion24h: null,
          rendimientoPct: null,
          pesoPct: 0,
          fuentePrecio: "Paste",
          revisar: [],
        });
        continue;
      }

      const c = clasificarTicker(a.tickerNorm, { seccion: a.seccion, descripcion: a.descripcion });
      const monto =
        a.montoMonedaOrigen > 0
          ? a.montoMonedaOrigen
          : a.cantidad && a.precioPromedio
            ? a.cantidad * a.precioPromedio
            : 0;

      if (c.revisar.some((r) => r.includes("REVISAR"))) desconocidos.push(a.tickerNorm);

      filas.push({
        id: genId(),
        ticker: a.tickerNorm,
        nombre: a.nombre || c.nombre || a.tickerNorm,
        tipo: c.tipo,
        categoriaMacro: c.categoriaMacro,
        sector: c.sector,
        industria: c.industria,
        mercado: c.mercado,
        monedaOrigen: a.monedaPrecios ?? c.moneda,
        cantidad: a.cantidad ?? 0,
        precioPromedio: a.precioPromedio,
        ultimoOperado: a.ultimoOperado,
        ganancia: a.ganancia,
        montoMonedaOrigen: monto,
        variacion24h: a.variacion24h,
        rendimientoPct: a.rendimientoPct,
        pesoPct: 0,
        fuentePrecio: "Paste",
        revisar: c.revisar,
      });
    }

    // Resolver desconocidos vía API IOL (tipo/mercado/moneda oficiales)
    const resueltosIOL = await resolverConIOL(filas, data.bearerToken);
    if (resueltosIOL > 0) avisos.push(`${resueltosIOL} ticker(s) resuelto(s) vía API IOL.`);

    // Pesos %
    const total = filas.reduce((s, f) => s + f.montoMonedaOrigen, 0);
    for (const f of filas) f.pesoPct = total > 0 ? (f.montoMonedaOrigen / total) * 100 : 0;

    // Agrupaciones
    const grupoMap = new Map<string, { cantidad: number; monto: number }>();
    const monedaMap = new Map<string, number>();
    for (const f of filas) {
      const key = `${f.categoriaMacro} · ${f.tipo}`;
      const g = grupoMap.get(key) ?? { cantidad: 0, monto: 0 };
      grupoMap.set(key, { cantidad: g.cantidad + 1, monto: g.monto + f.montoMonedaOrigen });
      monedaMap.set(f.monedaOrigen, (monedaMap.get(f.monedaOrigen) ?? 0) + f.montoMonedaOrigen);
    }

    const invertido = filas.filter((f) => f.categoriaMacro !== "Efectivo").reduce((s, f) => s + f.montoMonedaOrigen, 0);
    const efectivo = filas.filter((f) => f.categoriaMacro === "Efectivo").reduce((s, f) => s + f.montoMonedaOrigen, 0);

    return {
      cliente: {
        nombreCompleto: cliente.nombreCompleto ?? null,
        cuenta: cliente.cuenta ?? null,
        alias: cliente.alias ?? null,
        perfil: cliente.perfil ?? null,
        custodio: cliente.custodio ?? null,
        mandato: cliente.mandato ?? null,
        arancel: cliente.arancel ?? null,
      },
      filas,
      resumen: {
        patrimonioTotal: resumenParcial.patrimonioTotal ?? total,
        invertido,
        efectivo,
        porGrupo: [...grupoMap.entries()].map(([grupo, { cantidad, monto }]) => ({
          grupo, cantidad, monto, pesoPct: total > 0 ? (monto / total) * 100 : 0,
        })),
        porMoneda: [...monedaMap.entries()].map(([moneda, monto]) => ({
          moneda, monto, pesoPct: total > 0 ? (monto / total) * 100 : 0,
        })),
        tickersDesconocidos: [...new Set(desconocidos)],
      },
      avisos,
    };
  });

// ── Supabase CRUD ──────────────────────────────────────────────────────

import { supabaseAdmin } from "@/lib/supabase-admin";

export interface PortafolioGuardado {
  id: string;
  cliente_nombre: string | null;
  cliente_cuenta: string | null;
  cliente_alias: string | null;
  cliente_perfil: string | null;
  cliente_custodio: string | null;
  df: DataFrameRow[];
  resumen: ResumenPortfolio;
  texto_original: string | null;
  created_at: string;
  updated_at: string;
}

export const guardarPortafolioCliente = createServerFn({ method: "POST" })
  .inputValidator((d: { cliente: ClienteDetectado; df: DataFrameRow[]; resumen: ResumenPortfolio; textoOriginal: string }) => d)
  .handler(async ({ data }): Promise<{ id: string | null; error: string | null }> => {
    if (!supabaseAdmin?.from) return { id: null, error: "Supabase no configurado (falta SUPABASE_SERVICE_ROLE_KEY)" };
    const { data: row, error } = await supabaseAdmin
      .from("portafolios_clientes")
      .insert({
        cliente_nombre: data.cliente.nombreCompleto ?? "",
        cliente_cuenta: data.cliente.cuenta ?? null,
        cliente_alias: data.cliente.alias ?? null,
        cliente_perfil: data.cliente.perfil ?? null,
        cliente_custodio: data.cliente.custodio ?? null,
        df: data.df,
        resumen: data.resumen,
        texto_original: data.textoOriginal.slice(0, 50000),
      })
      .select("id")
      .single();
    if (error) return { id: null, error: error.message };
    return { id: row?.id ?? null, error: null };
  });

export const listarPortafoliosGuardados = createServerFn({ method: "GET" })
  .handler(async (): Promise<PortafolioGuardado[]> => {
    if (!supabaseAdmin?.from) return [];
    const { data, error } = await supabaseAdmin
      .from("portafolios_clientes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return [];
    return (data ?? []) as PortafolioGuardado[];
  });

export const eliminarPortafolioGuardado = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<boolean> => {
    if (!supabaseAdmin?.from) return false;
    const { error } = await supabaseAdmin.from("portafolios_clientes").delete().eq("id", data.id);
    return !error;
  });

export const cargarPortafolioGuardado = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<PortafolioGuardado | null> => {
    if (!supabaseAdmin?.from) return null;
    const { data: row, error } = await supabaseAdmin
      .from("portafolios_clientes")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) return null;
    return row as PortafolioGuardado;
  });

// ── Exports puros (testing) ────────────────────────────────────────────

export { clasificarTicker, loadCatalogs };
