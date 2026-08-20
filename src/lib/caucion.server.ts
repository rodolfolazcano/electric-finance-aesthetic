import { buscar, extraerTexto, dominio } from "@/lib/search.server";
import type { FuenteMercado } from "@/lib/mercado.server";

/** Token del API de Estadísticas del BCRA (v4) y de api.estadisticasbcra.com. Se puede sobrescribir por entorno. */
const BCRA_TOKEN =
  process.env["BCRA_API_TOKEN"] ??
  "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE4MTg2NjM1OTYsInR5cGUiOiJleHRlcm5hbCIsInVzZXIiOiJib29zYW5kcjk3QGdtYWlsLmNvbSJ9.9K-OA06ViqIJdvLwUU_eBuuUBf-NQGy3BVkSSZNqikMoKKNkVnXkMsqDCmetVE3KrakLUiKTm6koOnEmdILdyA";

const FUENTE_BCRA: FuenteMercado = {
  dominio: "api.bcra.gob.ar",
  url: "https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias",
  title: "BCRA Estadísticas (API oficial)",
};

const FUENTE_PPI: FuenteMercado = {
  dominio: "www.portfoliopersonal.com",
  url: "https://www.portfoliopersonal.com/Cotizaciones/Cauciones",
  title: "PPI — Cotización de cauciones (BYMA)",
};

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function txt(n: number | null | undefined): string {
  return typeof n === "number" && isFinite(n) ? nf.format(n) : "s/d";
}

function fechaAr(fecha: string | null | undefined): string {
  if (!fecha) return "s/d";
  const m = String(fecha).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return fecha;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Últimos valores de una serie del API de Estadísticas del BCRA v4 (con token). Devuelve vacío si falla. */
async function bcraSerie(
  idVariable: number,
): Promise<Array<{ fecha?: string | null; valor?: number | null }>> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/${idVariable}?Limit=2`,
      {
        headers: { Authorization: `BEARER ${BCRA_TOKEN}`, Accept: "application/json" },
        signal: controller.signal,
      },
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      results?: Array<{ detalle?: Array<{ fecha?: string; valor?: number }> }>;
    };
    return json.results?.[0]?.detalle ?? [];
  } catch {
    return [];
  }
}

async function ultimoBcra(idVariable: number): Promise<{ fecha: string; valor: number } | null> {
  const serie = await bcraSerie(idVariable);
  const ultimo = serie.find((x) => typeof x.valor === "number");
  if (!ultimo || typeof ultimo.valor !== "number") return null;
  return { fecha: String(ultimo.fecha ?? ""), valor: ultimo.valor };
}

/** Referencias de tasas del BCRA (API oficial con token). Se usan como contexto, no como tasa de caución. */
async function tasasReferenciaBcra(): Promise<{ texto: string; fuentes: FuenteMercado[] }> {
  const [badlar, depositos, pases] = await Promise.all([
    ultimoBcra(7),
    ultimoBcra(12),
    ultimoBcra(150),
  ]);
  if (!badlar && !depositos && !pases) return { texto: "", fuentes: [FUENTE_BCRA] };
  const lineas = ["Referencia de tasas del BCRA (API oficial):"];
  if (badlar)
    lineas.push(`- BADLAR (bancos privados): ${txt(badlar.valor)}% (${fechaAr(badlar.fecha)})`);
  if (depositos)
    lineas.push(
      `- Tasa de depósitos a 30 días: ${txt(depositos.valor)}% (${fechaAr(depositos.fecha)})`,
    );
  if (pases)
    lineas.push(`- Pases entre terceros a 1 día: ${txt(pases.valor)}% (${fechaAr(pases.fecha)})`);
  return { texto: lineas.join("\n"), fuentes: [FUENTE_BCRA] };
}

/** Extrae la tasa de cauciones por plazo del panel público de PPI (datos BYMA). */
async function caucionesPpi(): Promise<{
  tasas: Map<string, number>;
  ultimaCotizacion: string;
}> {
  const out = { tasas: new Map<string, number>(), ultimaCotizacion: "" };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch("https://www.portfoliopersonal.com/Cotizaciones/Cauciones", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "Accept-Language": "es-AR,es;q=0.9",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return out;
    const body = await res.text();
    for (const m of body.matchAll(/"ticker":"(PESOS\d+)"[\s\S]{0,400}?"lastPrice":([0-9.]+)/g)) {
      const dias = parseInt((m[1] ?? "").replace("PESOS", ""), 10);
      const valor = parseFloat(m[2] ?? "");
      if (isFinite(dias) && isFinite(valor) && valor > 0) out.tasas.set(String(dias), valor);
    }
    const q = body.match(/"lastQuote":"([^"]+)"/g)?.pop();
    if (q) out.ultimaCotizacion = q.replace(/.*"lastQuote":"([^"]+)".*/, "$1").slice(0, 16);
  } catch {
    /* se sigue sin datos */
  }
  return out;
}

/** Busca en la web la tasa de caución a 30 días como fallback cuando el panel directo no responde. */
async function caucionWebFallback(): Promise<{ texto: string; fuentes: FuenteMercado[] }> {
  const results = await buscar("tasa de caución a 30 días hoy BYMA");
  const utiles = (results ?? []).filter((r) =>
    /caucion|byma|ppi|plazo/i.test(`${r.title} ${r.url}`),
  );
  const top = (utiles.length ? utiles : (results ?? [])).slice(0, 3);
  const cuerpos = await Promise.all(
    top.map(async (r) => {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 8000);
      try {
        const t2 = await extraerTexto(r.url, 900);
        clearTimeout(t);
        return t2;
      } catch {
        clearTimeout(t);
        return "";
      }
    }),
  );
  const fuentes: FuenteMercado[] = top
    .filter((r) => r.url)
    .map((r) => ({ dominio: dominio(r.url), url: r.url, title: r.title }));
  if (!top.length) return { texto: "", fuentes: [] };
  const cuerpo = top
    .map(
      (r, i) =>
        `${i + 1}. ${r.title}\n${cuerpos[i] || "Contenido no disponible."}\nFuente: ${dominio(r.url)}`,
    )
    .join("\n\n");
  return { texto: `Validación en la web sobre la tasa de caución a 30 días:\n${cuerpo}`, fuentes };
}

/**
 * Tasa de caución a 30 días.
 * Estrategia: primero se consultan las APIs públicas (BCRA con token: BADLAR, depósitos a 30 días,
 * pases a 1 día) para contexto; como la caución en sí no la publica ninguna API, se obtiene de la web
 * el panel público de cauciones de PPI (datos BYMA, TNA por plazo, incluida la de 30 días).
 */
export async function consultarCaucion30Dias(): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
}> {
  const [referencia, ppi] = await Promise.all([tasasReferenciaBcra(), caucionesPpi()]);
  const fuentes = [...referencia.fuentes];
  const tasa30 = ppi.tasas.get("30");
  if (typeof tasa30 === "number") {
    fuentes.push(FUENTE_PPI);
    const lineas = [
      `Tasa de caución a 30 días (TNA, BYMA): ${txt(tasa30)}%. Dato del ${ppi.ultimaCotizacion || "último cierre"} (panel público de PPI).`,
    ];
    const extras: Array<[string, number]> = [];
    for (const d of ["1", "2", "7", "60"]) {
      const v = ppi.tasas.get(d);
      if (typeof v === "number") extras.push([d, v]);
    }
    if (extras.length) {
      lineas.push(
        `Otras cauciones en pesos: ${extras.map(([d, v]) => `${d} día${d === "1" ? "" : "s"} ${txt(v)}%`).join(" · ")}.`,
      );
    }
    if (referencia.texto) lineas.push(referencia.texto);
    lineas.push(
      "La tasa de caución la fija el mercado en BYMA y no se publica en las APIs de BCRA, ArgentinaDatos ni CriptoYa; por eso se tomó del panel de cauciones de PPI.",
    );
    return { texto: lineas.join("\n"), fuentes };
  }
  if (referencia.texto) {
    fuentes.push(FUENTE_PPI);
    return {
      texto: `${referencia.texto}\nNo se pudo obtener la tasa de caución puntual a 30 días del panel de cauciones en este momento.`,
      fuentes,
    };
  }
  return caucionWebFallback();
}

/**
 * Tasas del BCRA (API de Estadísticas v4 con token) para consultas de tasas de interés oficiales:
 * BADLAR, TM20, depósitos a 30 días, LELIQ a 1 mes, pases a 1 día. Si no matchea ninguna, devuelve BADLAR + TM20 + depósitos a 30 días.
 */
export async function consultarTasasBcra(
  query: string,
): Promise<{ texto: string; fuentes: FuenteMercado[] }> {
  const raw = (query ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  let ids: number[] = [7, 8, 12];
  let nombres: Array<[number, string]> = [
    [7, "BADLAR (bancos privados)"],
    [8, "TM20 (bancos privados)"],
    [12, "depósitos a 30 días"],
  ];
  if (/leliq|notaliq/.test(raw)) {
    ids = [166, 8, 12];
    nombres = [
      [166, "LEBAQ / LELIQ a 1 mes"],
      [8, "TM20 (bancos privados)"],
      [12, "depósitos a 30 días"],
    ];
  } else if (/pase|pases/.test(raw)) {
    ids = [150, 162, 164];
    nombres = [
      [150, "pases entre terceros a 1 día"],
      [162, "pases pasivos BCRA a 1 día"],
      [164, "pases activos BCRA a 1 día"],
    ];
  } else if (/badlar/.test(raw)) {
    ids = [7];
    nombres = [[7, "BADLAR (bancos privados)"]];
  } else if (/tm20|tm 20/.test(raw)) {
    ids = [8];
    nombres = [[8, "TM20 (bancos privados)"]];
  } else if (/deposito/.test(raw)) {
    ids = [12];
    nombres = [[12, "depósitos a 30 días"]];
  }
  const valores = await Promise.all(ids.map((id) => ultimoBcra(id)));
  const lineas = ["Tasas de interés del BCRA (API de Estadísticas v4):"];
  let alguno = false;
  nombres.forEach(([id, nombre], i) => {
    const v = valores[i];
    if (v) {
      alguno = true;
      lineas.push(`- ${nombre}: ${txt(v.valor)}% (${fechaAr(v.fecha)})`);
    }
  });
  if (!alguno) return { texto: "", fuentes: [FUENTE_BCRA] };
  return { texto: lineas.join("\n"), fuentes: [FUENTE_BCRA] };
}
