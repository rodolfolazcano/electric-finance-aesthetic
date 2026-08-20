import { consultarCaucion30Dias, consultarTasasBcra } from "@/lib/caucion.server";

export type FuenteMercado = { dominio: string; url: string; title: string };

type Entrada = {
  price?: number | null;
  ask?: number | null;
  bid?: number | null;
  variation?: number | null;
  timestamp?: number | null;
};

type CriptoYaDolar = {
  mayorista?: Entrada;
  oficial?: Entrada;
  ahorro?: Entrada;
  tarjeta?: Entrada;
  blue?: Entrada;
  cripto?: Entrada;
  mep?: Record<string, { "24hs"?: Entrada }>;
  ccl?: Record<string, { "24hs"?: Entrada }>;
};

type Serie = Array<{ fecha?: string | null; valor?: number | null }>;
type Letra = {
  ticker?: string | null;
  fechaEmision?: string | null;
  fechaVencimiento?: string | null;
  tem?: number | null;
  vpv?: number | null;
};
type TasaPf = {
  entidad?: string | null;
  tnaClientes?: number | null;
  tnaNoClientes?: number | null;
};
type Fci = {
  fondo?: string | null;
  fecha?: string | null;
  vcp?: number | null;
  patrimonio?: number | null;
  horizonte?: string | null;
};
type Criptopeso = { token?: string | null; entidad?: string | null; tna?: number | null };
type CotizacionAd = {
  moneda?: string | null;
  casa?: string | null;
  fecha?: string | null;
  compra?: number | null;
  venta?: number | null;
};

async function obtenerJson<T>(url: string, timeout = 8000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const nfPts = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

function txt(n: number | null | undefined): string {
  return typeof n === "number" && isFinite(n) ? nf.format(n) : "s/d";
}

function txtPts(n: number | null | undefined): string {
  return typeof n === "number" && isFinite(n) ? nfPts.format(n) : "s/d";
}

function fechahoraria(ts: number | null | undefined): string {
  if (typeof ts !== "number" || !isFinite(ts)) return "s/d";
  const d = new Date((ts - 3 * 3600) * 1000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())} hs`;
}

function fechaAr(fecha: string | null | undefined): string {
  if (!fecha) return "s/d";
  const m = String(fecha).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return fecha;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function ultimoValido(
  serie: Serie | null,
): { fecha?: string | null; valor?: number | null } | null {
  if (!serie) return null;
  for (let i = serie.length - 1; i >= 0; i--) {
    const x = serie[i];
    if (x && typeof x.valor === "number") return x;
  }
  return null;
}

const FUENTE_CRIPTOYA: FuenteMercado = {
  dominio: "criptoya.com",
  url: "https://criptoya.com/api/dolar",
  title: "CriptoYa — dólar",
};
const FUENTE_ARGENTINADATOS: FuenteMercado = {
  dominio: "api.argentinadatos.com",
  url: "https://api.argentinadatos.com/v1",
  title: "ArgentinaDatos",
};
const FUENTE_BCRA: FuenteMercado = {
  dominio: "api.bcra.gob.ar",
  url: "https://api.bcra.gob.ar/estadisticascambiarias/v1.0",
  title: "BCRA Estadísticas",
};
const FUENTE_AMBITO: FuenteMercado = {
  dominio: "mercados.ambito.com",
  url: "https://mercados.ambito.com/",
  title: "Ámbito — riesgo país",
};

function mejorTicker(
  obj?: Record<string, { "24hs"?: Entrada }>,
): { ticker: string; "24hs"?: Entrada } | null {
  if (!obj) return null;
  const preferidos = ["al30", "gd30", "letras", "bpo27"];
  for (const k of preferidos) {
    const v = obj[k];
    if (v) return { ticker: k, ...v };
  }
  const k0 = Object.keys(obj)[0];
  if (!k0) return null;
  return { ticker: k0, ...obj[k0] };
}

async function cotizacionDolar(): Promise<{ texto: string; fuentes: FuenteMercado[] }> {
  const data = await obtenerJson<CriptoYaDolar>("https://criptoya.com/api/dolar");
  const fuentes = [FUENTE_CRIPTOYA];
  if (!data) return { texto: "", fuentes };
  const lineas = ["Cotizaciones del dólar en Argentina (CriptoYa):"];
  if (data.oficial) {
    lineas.push(
      `- Dólar oficial: compra $${txt(data.oficial.bid)} / venta $${txt(data.oficial.ask)} (variación ${txt(data.oficial.variation)}%)`,
    );
  }
  if (data.mayorista) {
    lineas.push(
      `- Dólar mayorista: $${txt(data.mayorista.price)} (${txt(data.mayorista.variation)}%)`,
    );
  }
  if (data.blue) {
    lineas.push(
      `- Dólar blue: compra $${txt(data.blue.bid)} / venta $${txt(data.blue.ask)} (${txt(data.blue.variation)}%)`,
    );
  }
  if (data.ahorro) {
    lineas.push(
      `- Dólar ahorro/solidario: compra $${txt(data.ahorro.bid)} / venta $${txt(data.ahorro.ask)}`,
    );
  }
  if (data.tarjeta) {
    lineas.push(`- Dólar tarjeta: $${txt(data.tarjeta.price)}`);
  }
  const mep = mejorTicker(data.mep);
  if (mep && mep["24hs"]?.price) {
    lineas.push(
      `- Dólar MEP (${mep.ticker}): $${txt(mep["24hs"].price)} (${txt(mep["24hs"].variation)}%)`,
    );
  }
  const ccl = mejorTicker(data.ccl);
  if (ccl && ccl["24hs"]?.price) {
    lineas.push(
      `- Dólar CCL contado con liqui (${ccl.ticker}): $${txt(ccl["24hs"].price)} (${txt(ccl["24hs"].variation)}%)`,
    );
  }
  lineas.push(
    `Actualización: ${fechahoraria(data.blue?.timestamp ?? data.oficial?.timestamp)}. Precios informativos; pueden diferir del valor de tu operación.`,
  );
  return { texto: lineas.join("\n"), fuentes };
}

/** Cotizaciones del dólar por casa desde ArgentinaDatos (histórico, último valor por casa). Se usa como segunda fuente. */
async function dolaresArgentinaDatos(): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
}> {
  const arr = await obtenerJson<CotizacionAd[]>(
    "https://api.argentinadatos.com/v1/cotizaciones/dolares",
  );
  const fuentes = [FUENTE_ARGENTINADATOS];
  if (!arr?.length) return { texto: "", fuentes };
  const casas = [
    "oficial",
    "blue",
    "bolsa",
    "contadoconliqui",
    "mayorista",
    "solidario",
    "turista",
  ];
  const etiquetas: Record<string, string> = {
    oficial: "oficial",
    blue: "blue",
    bolsa: "MEP (bolsa)",
    contadoconliqui: "contado con liqui",
    mayorista: "mayorista",
    solidario: "solidario",
    turista: "turista",
  };
  const ultimas = casas
    .map((casa) => {
      const fila = (arr ?? []).find((c) => c.casa === casa);
      if (!fila) return null;
      return { casa, compra: fila.compra, venta: fila.venta, fecha: fila.fecha };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);
  if (!ultimas.length) return { texto: "", fuentes };
  const lineas = [
    "Dólar por casa de cambio (ArgentinaDatos, histórico al día):",
    ...ultimas.map(
      (u) =>
        `- ${etiquetas[u.casa] ?? u.casa}: compra $${txt(u.compra)} / venta $${txt(u.venta)} (${fechaAr(u.fecha)})`,
    ),
  ];
  return { texto: lineas.join("\n"), fuentes };
}

/** Tasa de interés por depósitos a 30 días (serie BCRA vía ArgentinaDatos). */
async function depositos30Dias(): Promise<{ texto: string; fuentes: FuenteMercado[] }> {
  const serie = await obtenerJson<Serie>(
    "https://api.argentinadatos.com/v1/finanzas/tasas/depositos30Dias",
  );
  const fuentes = [FUENTE_ARGENTINADATOS];
  const ultimo = ultimoValido(serie);
  if (!ultimo) return { texto: "", fuentes };
  return {
    texto: `Tasa de interés por depósitos a 30 días: ${txt(ultimo.valor)}% (dato del ${fechaAr(ultimo.fecha)}, BCRA vía ArgentinaDatos).`,
    fuentes,
  };
}

/** Tasas nominales anuales de criptopesos por entidad (Belo, Ripio, Buenbit, etc.). */
async function criptopesos(): Promise<{ texto: string; fuentes: FuenteMercado[] }> {
  const arr = await obtenerJson<Criptopeso[]>(
    "https://api.argentinadatos.com/v1/finanzas/criptopesos",
  );
  const fuentes = [FUENTE_ARGENTINADATOS];
  if (!arr?.length) return { texto: "", fuentes };
  const validos = arr.filter((c) => c.entidad && typeof c.tna === "number");
  if (!validos.length) return { texto: "", fuentes };
  return {
    texto: `Tasas de criptopesos (TNA por entidad, ArgentinaDatos):\n${validos
      .map((c) => `- ${c.entidad} (${c.token ?? "s/d"}): ${txt(c.tna)}% TNA`)
      .join("\n")}`,
    fuentes,
  };
}

type AmbitoRiesgo = {
  ultimo?: string | null;
  fecha?: string | null;
  variacion?: string | null;
  "class-variacion"?: string | null;
};

async function riesgoPais(): Promise<{ texto: string; fuentes: FuenteMercado[] }> {
  const [ambito, adSerie, adUltimo] = await Promise.all([
    obtenerJson<AmbitoRiesgo>("https://mercados.ambito.com/riesgopais/variacion"),
    obtenerJson<Serie>("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais"),
    obtenerJson<{ fecha?: string | null; valor?: number | null }>(
      "https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo",
    ),
  ]);
  const validos = (adSerie ?? []).filter((x) => typeof x.valor === "number" && isFinite(x.valor));
  if (adUltimo && typeof adUltimo.valor === "number" && !ambito?.ultimo) {
    return {
      texto: `Riesgo país (EMBI Argentina): ${txtPts(adUltimo.valor)} puntos básicos (dato del ${fechaAr(adUltimo.fecha)}, ArgentinaDatos).`,
      fuentes: [FUENTE_ARGENTINADATOS],
    };
  }
  if (ambito && ambito.ultimo) {
    const ultimo = parseFloat(String(ambito.ultimo).replace(",", "."));
    if (isFinite(ultimo)) {
      const fechaAmbito = String(ambito.fecha ?? "").replace(/-/g, "/") || "s/d";
      let anterior = validos[validos.length - 1];
      if (anterior && ambito.fecha) {
        const iso = String(ambito.fecha).split("-").reverse().join("-");
        if (String(anterior.fecha).slice(0, 10) === iso) anterior = validos[validos.length - 2];
      }
      const lineas = [
        `Riesgo país (EMBI Argentina), valor actual: ${txtPts(ultimo)} puntos básicos (dato del ${fechaAmbito}).`,
      ];
      if (anterior && typeof anterior.valor === "number") {
        const delta = ultimo - anterior.valor;
        const pct = anterior.valor !== 0 ? (delta / anterior.valor) * 100 : 0;
        const s = delta >= 0 ? "+" : "";
        lineas.push(
          `Cierre anterior: ${txtPts(anterior.valor)} puntos (${fechaAr(anterior.fecha)}).`,
        );
        lineas.push(`Variación: ${s}${nfPts.format(delta)} puntos (${s}${nf.format(pct)}%).`);
      } else {
        let pct = parseFloat(
          String(ambito.variacion ?? "0")
            .replace(",", ".")
            .replace("%", "")
            .trim(),
        );
        if (!isFinite(pct)) pct = 0;
        const negativo =
          String(ambito.variacion ?? "")
            .trim()
            .startsWith("-") || /down/i.test(String(ambito["class-variacion"] ?? ""));
        if (negativo && pct > 0) pct = -pct;
        if (pct !== -100) {
          const prev = ultimo / (1 + pct / 100);
          const delta = ultimo - prev;
          const s = delta >= 0 ? "+" : "";
          lineas.push(
            `Cierre anterior (estimado): ${txtPts(prev)} puntos · Variación: ${s}${nfPts.format(delta)} puntos (${pct >= 0 ? "+" : ""}${nf.format(pct)}%).`,
          );
        }
      }
      lineas.push("Fuente: Ámbito (dato en vivo), cierre anterior de ArgentinaDatos.");
      return { texto: lineas.join("\n"), fuentes: [FUENTE_AMBITO, FUENTE_ARGENTINADATOS] };
    }
  }
  if (!validos.length) return { texto: "", fuentes: [FUENTE_ARGENTINADATOS] };
  const ultimo = validos[validos.length - 1]!;
  const anterior = validos[validos.length - 2];
  const partes = [
    `Riesgo país (EMBI Argentina): ${txtPts(ultimo.valor)} puntos básicos (dato del ${fechaAr(ultimo.fecha)}).`,
  ];
  if (anterior && typeof anterior.valor === "number") {
    partes.push(`Cierre anterior: ${txtPts(anterior.valor)} puntos (${fechaAr(anterior.fecha)}).`);
    const delta = (ultimo.valor ?? 0) - anterior.valor;
    const pct = anterior.valor !== 0 ? (delta / anterior.valor) * 100 : 0;
    const signo = delta >= 0 ? "+" : "";
    partes.push(`Variación: ${signo}${nfPts.format(delta)} puntos (${signo}${nf.format(pct)}%).`);
  }
  partes.push("Fuente: ArgentinaDatos (BCRA / datos de mercado).");
  return { texto: partes.join("\n"), fuentes: [FUENTE_ARGENTINADATOS] };
}

async function uva(): Promise<{ texto: string; fuentes: FuenteMercado[] }> {
  const serie = await obtenerJson<Serie>("https://api.argentinadatos.com/v1/finanzas/indices/uva");
  const ultimo = ultimoValido(serie);
  const fuentes = [FUENTE_ARGENTINADATOS];
  if (!ultimo) return { texto: "", fuentes };
  return {
    texto: `Valor de la UVA (Unidad de Valor Adquisitivo): $${txt(ultimo.valor)} (dato del ${fechaAr(ultimo.fecha)}, BCRA vía ArgentinaDatos).`,
    fuentes,
  };
}

async function inflacion(): Promise<{ texto: string; fuentes: FuenteMercado[] }> {
  const [men, inter] = await Promise.all([
    obtenerJson<Serie>("https://api.argentinadatos.com/v1/finanzas/indices/inflacion"),
    obtenerJson<Serie>("https://api.argentinadatos.com/v1/finanzas/indices/inflacionInteranual"),
  ]);
  const m = ultimoValido(men);
  const i = ultimoValido(inter);
  const fuentes = [FUENTE_ARGENTINADATOS];
  if (!m && !i) return { texto: "", fuentes };
  return {
    texto: `Inflación (IPC, BCRA vía ArgentinaDatos): mensual ${
      m ? `${txt(m.valor)}% (${fechaAr(m.fecha)})` : "s/d"
    } · interanual ${i ? `${txt(i.valor)}% (${fechaAr(i.fecha)})` : "s/d"}.`,
    fuentes,
  };
}

async function letras(raw: string): Promise<{ texto: string; fuentes: FuenteMercado[] }> {
  const arr = await obtenerJson<Letra[]>("https://api.argentinadatos.com/v1/finanzas/letras");
  const fuentes = [FUENTE_ARGENTINADATOS];
  if (!arr?.length) return { texto: "", fuentes };
  const token = raw.match(/\b([a-z]{1,2}\d{2}[a-z]?\d?)\b/)?.[1];
  const filtradas = token
    ? arr.filter((l) => l.ticker?.toLowerCase().includes(token))
    : [...arr].sort((a, b) =>
        String(a.fechaVencimiento ?? "").localeCompare(String(b.fechaVencimiento ?? "")),
      );
  if (!filtradas.length) return { texto: "", fuentes };
  const top = filtradas.slice(0, 8);
  return {
    texto: `Letras del Tesoro (LECAP/BONCAP, ArgentinaDatos):\n${top
      .map(
        (l) =>
          `- ${l.ticker ?? "s/d"}: vencimiento ${l.fechaVencimiento ?? "s/d"}, TEM ${txt(l.tem)}%, valor al vencimiento $${txt(l.vpv)} por cada $100 de valor nominal.`,
      )
      .join("\n")}${token ? "" : "\nLa lista completa incluye más emisiones."}`,
    fuentes,
  };
}

async function plazoFijo(): Promise<{ texto: string; fuentes: FuenteMercado[] }> {
  const arr = await obtenerJson<TasaPf[]>(
    "https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo",
  );
  const fuentes = [FUENTE_ARGENTINADATOS];
  const validas = (arr ?? []).filter(
    (t) => t.entidad && typeof t.tnaClientes === "number" && isFinite(t.tnaClientes),
  );
  if (!validas.length) return { texto: "", fuentes };
  const top = validas.sort((a, b) => (b.tnaClientes ?? 0) - (a.tnaClientes ?? 0)).slice(0, 5);
  return {
    texto: `Tasas de plazo fijo online a 30 días, para $100.000 (reportadas a la BCRA, vía ArgentinaDatos). Mayores TNA para clientes:\n${top
      .map((t) => `- ${t.entidad}: TNA ${txt(t.tnaClientes)}%`)
      .join("\n")}`,
    fuentes,
  };
}

function tipoFci(raw: string): { tipo: string; etiqueta: string; resto: string } {
  const sinonimos = [
    { tipo: "rentaVariable", etiqueta: "renta variable", pat: /renta variable|rv|fci de accion/ },
    { tipo: "rentaFija", etiqueta: "renta fija", pat: /renta fija|rf|fci de bono/ },
    { tipo: "rentaMixta", etiqueta: "renta mixta", pat: /renta mixta|mixta/ },
    {
      tipo: "mercadoDinero",
      etiqueta: "money market / mercado de dinero",
      pat: /mercado de dinero|money market|money|fci ahorro/,
    },
  ];
  for (const s of sinonimos) {
    if (s.pat.test(raw)) {
      const resto = raw.replace(s.pat, "").trim();
      return { tipo: s.tipo, etiqueta: s.etiqueta, resto };
    }
  }
  return { tipo: "mercadoDinero", etiqueta: "money market / mercado de dinero", resto: raw };
}

const RELLENO_FCI = new Set([
  "el",
  "la",
  "los",
  "las",
  "de",
  "del",
  "que",
  "y",
  "con",
  "un",
  "una",
  "al",
  "fondo",
  "fondos",
  "fci",
  "mas",
  "grande",
  "grandes",
  "mayor",
  "mejor",
  "mejores",
  "top",
  "rendimiento",
  "rentabilidad",
  "quiero",
  "ver",
]);

async function fci(raw: string): Promise<{ texto: string; fuentes: FuenteMercado[] }> {
  const { tipo, etiqueta, resto } = tipoFci(raw);
  const arr = await obtenerJson<Fci[]>(
    `https://api.argentinadatos.com/v1/finanzas/fci/${tipo}/ultimo`,
  );
  const fuentes = [FUENTE_ARGENTINADATOS];
  if (!arr?.length) return { texto: "", fuentes };
  const palabra = resto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !RELLENO_FCI.has(w))
    .join(" ");
  const conFiltro = palabra ? arr.filter((f) => f.fondo?.toLowerCase().includes(palabra)) : arr;
  if (!conFiltro.length) return { texto: "", fuentes };
  const top = [...conFiltro].sort((a, b) => (b.patrimonio ?? 0) - (a.patrimonio ?? 0)).slice(0, 6);
  const fecha = top.find((f) => f.fecha)?.fecha ?? "s/d";
  return {
    texto: `Fondos comunes de inversión — ${etiqueta} (CAFCI vía ArgentinaDatos, fecha ${fechaAr(fecha)}), ordenados por patrimonio:\n${top
      .map(
        (f) =>
          `- ${f.fondo ?? "s/d"}: valor cuota parte $${txt(f.vcp)}, patrimonio $${txt(f.patrimonio)} (horizonte ${f.horizonte ?? "s/d"}).`,
      )
      .join("\n")}`,
    fuentes,
  };
}

function codigoMoneda(raw: string): { codigo: string; nombre: string } {
  if (/(eur|euro)/.test(raw)) return { codigo: "EUR", nombre: "euro" };
  if (/(brl|real)/.test(raw)) return { codigo: "BRL", nombre: "real brasileño" };
  if (/(gbp|libra)/.test(raw)) return { codigo: "GBP", nombre: "libra esterlina" };
  if (/(jpy|yen)/.test(raw)) return { codigo: "JPY", nombre: "yen japonés" };
  if (/(cny|yuan)/.test(raw)) return { codigo: "CNY", nombre: "yuan chino" };
  return { codigo: "USD", nombre: "dólar estadounidense" };
}

async function moneda(raw: string): Promise<{ texto: string; fuentes: FuenteMercado[] }> {
  const { codigo, nombre } = codigoMoneda(raw);
  const data = await obtenerJson<{
    results?: Array<{ fecha?: string | null; detalle?: Array<{ tipoCotizacion?: number | null }> }>;
  }>(`https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/${codigo}`);
  const fuentes = [FUENTE_BCRA];
  const primero = data?.results?.find((r) => r.detalle?.length);
  const valor = primero?.detalle?.[0]?.tipoCotizacion;
  if (typeof valor !== "number" || !isFinite(valor)) return { texto: "", fuentes };
  return {
    texto: `Tipo de cambio minorista del ${nombre} (BCRA): $${txt(valor)} por unidad (dato del ${fechaAr(primero?.fecha)}).`,
    fuentes,
  };
}

export async function consultarMercado(
  query: string,
): Promise<{ texto: string; fuentes: FuenteMercado[] }> {
  const raw = (query ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!raw) return { texto: "", fuentes: [] };

  if (
    /(dolar|blue|mep|ccl|contado |tipo de cambio|oficial|ahorro|tarjeta|solidario|mayorista|bolsa)/.test(
      raw,
    )
  ) {
    const [criptoya, argentinaDatos] = await Promise.all([
      cotizacionDolar(),
      dolaresArgentinaDatos(),
    ]);
    return {
      texto: [criptoya.texto, argentinaDatos.texto].filter(Boolean).join("\n\n"),
      fuentes: [...criptoya.fuentes, ...argentinaDatos.fuentes],
    };
  }
  if (/(riesgo pais|embi)/.test(raw)) return riesgoPais();
  if (/(\buva\b|unidad de valor adquisitivo)/.test(raw)) return uva();
  if (/(inflacion)/.test(raw)) return inflacion();
  if (/(letra|lecap|boncap)/.test(raw)) return letras(raw);
  if (/(plazo fijo|deposito|dep[óo]sito)/.test(raw)) {
    const [pf, dep30] = await Promise.all([plazoFijo(), depositos30Dias()]);
    return {
      texto: [pf.texto, dep30.texto].filter(Boolean).join("\n\n"),
      fuentes: [...pf.fuentes, ...dep30.fuentes],
    };
  }
  if (/(criptopeso|cripto.*peso|argt|wars|usdt.*peso)/.test(raw)) return criptopesos();
  if (/(caucion|cauciones)/.test(raw)) return consultarCaucion30Dias();
  if (
    /(badlar|leliq|tm20|tasa de pase|pases|monetaria|tasa(s)? (del|de) (bcra|banco central)|tasa de interes oficial)/.test(
      raw,
    )
  ) {
    return consultarTasasBcra(raw);
  }
  if (
    /(fondo|fci|money market|mercado de dinero|renta variable|renta fija|renta mixta)/.test(raw)
  ) {
    return fci(raw);
  }
  if (/(euro|eur|real|brl|libra|gbp|yen|jpy|yuan|cny)/.test(raw)) return moneda(raw);
  return { texto: "", fuentes: [] };
}
