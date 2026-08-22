import { createServerFn } from "@tanstack/react-start";
import { CEDEARS_LIQUIDOS, ACCIONES_BCBA_TOP, toSubyacenteUS, validarTickerEstricto } from "./mapeo-cedear";

export type FiltroSenal = "liquidos" | "noticias" | "movers" | "todos";
export type SenalCedear = {
  tickerBCBA: string; // ej MSFT (cedear) o GGAL.BA (accion)
  tickerUS: string; // ej MSFT / GGAL
  yahooBCBA: string;
  yahooUS: string;
  nombre: string;
  tipo: "cedear" | "accion_local";
  mercado: "BCBA" | "NYSE/NASDAQ";
  moneda: "ARS" | "USD";
  precioBCBA: number | null; // ARS para BCBA
  precioUS: number | null; // USD para US
  variacionBCBA: number | null;
  variacionUS: number | null;
  volumen: number | null;
  motivo: string;
  senal: "COMPRA" | "VENTA" | "NEUTRAL" | "MANTENER";
  prob: number | null;
  fuente: string;
};

// Lista negra de tickers inventados/no existentes que nunca deben usarse
const TICKERS_INVALIDOS = new Set(["ALAS", "CIEN", "BBVA", "ALAS.BA", "CIEN.BA", "BBVA.BA"]);

async function yahooQuote(symbol: string): Promise<{ precio: number | null; variacion: number | null; volumen: number | null } | null> {
  try {
    const { getYahooQuoteServer } = await import("./market-data.functions");
    const q: any = await (getYahooQuoteServer as any)({ data: { symbol } });
    if (!q || q.precio == null) return null;
    return { precio: q.precio, variacion: q.variacionPct ?? null, volumen: q.volumen ?? null };
  } catch {
    return null;
  }
}

export const generarSenalesCedear = createServerFn({ method: "GET" })
  .inputValidator((d: { filtro?: FiltroSenal; topN?: number } | undefined) => d ?? {})
  .handler(async ({ data }): Promise<{ senales: SenalCedear[]; generadoEn: string; criterio: string; advertencia?: string }> => {
    const filtro: FiltroSenal = (data?.filtro as FiltroSenal) ?? "todos";
    const topN = Math.min(Math.max(data?.topN ?? 6, 1), 15);
    const generadoEn = new Date().toISOString();

    let noticias: string[] = [];
    let tickersNoticias = new Set<string>();
    let screeners: any = null;
    let cierre: any = null;
    try {
      const { getMarketNews } = await import("./market-news.functions");
      const n: any = await (getMarketNews as any)();
      const items = n?.items ?? [];
      for (const it of items.slice(0, 12)) {
        const txt = (it.title + " " + (it.summary ?? "")).toUpperCase();
        noticias.push(it.title);
        for (const t of [...CEDEARS_LIQUIDOS, ...ACCIONES_BCBA_TOP.map((x) => x.replace(".BA", ""))]) {
          if (TICKERS_INVALIDOS.has(t)) continue;
          if (txt.includes(t)) tickersNoticias.add(t);
        }
      }
    } catch {}
    try {
      const { getMarketScreeners } = await import("./herramientas/daily-opportunities.functions");
      screeners = await (getMarketScreeners as any)();
    } catch {}
    try {
      const { getCierreMercadoDashboard } = await import("./cierre-mercado.functions");
      cierre = await (getCierreMercadoDashboard as any)();
    } catch {}

    // Construir universo con filtro estricto: solo tickers validados
    let universo: string[] = [];
    if (filtro === "noticias" && tickersNoticias.size > 0) {
      universo = Array.from(tickersNoticias).filter((t) => !TICKERS_INVALIDOS.has(t)).slice(0, topN * 2);
    } else if (filtro === "movers" && screeners) {
      const movers = [...(screeners.day_gainers ?? []), ...(screeners.day_losers ?? [])]
        .sort((a: any, b: any) => Math.abs(b.percentChange ?? 0) - Math.abs(a.percentChange ?? 0))
        .map((m: any) => m.symbol?.toUpperCase())
        .filter((s: string) => Boolean(s) && !TICKERS_INVALIDOS.has(s) && validarTickerEstricto(s, "cedear"))
        .slice(0, topN * 2);
      universo = movers.length ? movers : CEDEARS_LIQUIDOS.filter((t) => !TICKERS_INVALIDOS.has(t)).slice(0, topN * 2);
    } else if (filtro === "liquidos") {
      universo = CEDEARS_LIQUIDOS.filter((t) => !TICKERS_INVALIDOS.has(t) && validarTickerEstricto(t, "cedear")).slice(0, topN * 2);
    } else {
      const movers = screeners ? [...(screeners.most_actives ?? [])].map((m: any) => m.symbol).filter((s: string) => !TICKERS_INVALIDOS.has(s)).slice(0, 4) : [];
      universo = [...new Set([...CEDEARS_LIQUIDOS.filter((t) => !TICKERS_INVALIDOS.has(t)).slice(0, 8), ...ACCIONES_BCBA_TOP.slice(0, 4).map((x) => x.replace(".BA", "")), ...movers])];
    }

    universo = [...new Set(universo.map((x) => x.toUpperCase()))]
      .filter((t) => !TICKERS_INVALIDOS.has(t))
      .slice(0, 12);

    const senales: SenalCedear[] = [];
    let omitidosSinDatos = 0;
    for (const raw of universo) {
      if (TICKERS_INVALIDOS.has(raw)) continue;
      const esAccionLocal = ACCIONES_BCBA_TOP.includes(raw) || raw.endsWith(".BA");
      const tickerUS = esAccionLocal ? raw.replace(".BA", "") : toSubyacenteUS(raw);
      const yahooUS = tickerUS;
      const yahooBCBA = esAccionLocal ? raw : tickerUS; // cedear ARS cotiza con mismo ticker sin .BA en BCBA
      // Para cedear, BCBA yahoo es con .BA? Verificamos: MSFT.BA existe pero cedear BCBA real cotiza como MSFT en IOL. Usamos ambos intentos.
      const yahooBCBA_alt = esAccionLocal ? raw : tickerUS + ".BA";
      const tickerBCBA = esAccionLocal ? raw : tickerUS;

      // Validar tipo estricto
      const tipoEsperado = esAccionLocal ? "accion" : "cedear";
      if (!validarTickerEstricto(raw, tipoEsperado as any)) continue;

      const [qUS, qBCBA, qBCBA_alt] = await Promise.all([yahooQuote(yahooUS), yahooQuote(yahooBCBA), yahooQuote(yahooBCBA_alt)]);
      // Para cedear, priorizar BCBA sin .BA, fallback a .BA
      const qBCBA_final = qBCBA ?? qBCBA_alt;

      // ANTI-ALUCINACION: si no hay precio en ninguna fuente, OMITIR ticker (no inventar)
      if (!qUS && !qBCBA_final) {
        omitidosSinDatos++;
        continue;
      }
      // Para accion local, exigir precio BCBA ARS; si no hay, omitir
      if (esAccionLocal && !qBCBA_final) {
        omitidosSinDatos++;
        continue;
      }
      // Para cedear, exigir al menos uno de los dos; si solo hay US sin BCBA, igual se muestra pero advierte

      const varUS = qUS?.variacion ?? null;
      const varBCBA = qBCBA_final?.variacion ?? null;
      const precioUS = qUS?.precio ?? null;
      const precioBCBA = qBCBA_final?.precio ?? null;

      let senal: SenalCedear["senal"] = "NEUTRAL";
      let motivo = "";
      let prob: number | null = null;

      // Usar variacion del subyacente US para cedears, BCBA para acciones locales
      const variacionRef = esAccionLocal ? varBCBA : varUS ?? varBCBA;
      const mercadoRef = esAccionLocal ? "BCBA" : "NYSE/NASDAQ";
      if (variacionRef != null) {
        if (variacionRef >= 3) {
          senal = "VENTA";
          motivo = `Suba ${variacionRef.toFixed(2)}% en ${mercadoRef}; tomar ganancia / esperar pullback.`;
          prob = 0.58;
        } else if (variacionRef <= -3) {
          senal = "COMPRA";
          motivo = `Caida ${variacionRef.toFixed(2)}% en ${mercadoRef}; oportunidad mean-reversion si confirma volumen.`;
          prob = 0.57;
        } else if (variacionRef >= 1.2) {
          senal = "MANTENER";
          motivo = `Momentum +${variacionRef.toFixed(2)}% en ${mercadoRef}; mantener con stop.`;
          prob = 0.53;
        } else if (variacionRef <= -1.2) {
          senal = "MANTENER";
          motivo = `Presion ${variacionRef.toFixed(2)}% en ${mercadoRef}; evitar entrada hasta reversion.`;
          prob = 0.52;
        } else {
          motivo = `Variacion ${variacionRef.toFixed(2)}% en ${mercadoRef}; sin senal clara.`;
        }
      } else {
        motivo = "Sin variacion disponible hoy; usar tecnico/valor intrinseco para confirmar.";
      }
      // No inventar valor intrinseco ni volatilidad aqui; esos se obtienen con herramientas separadas (valor_intrinseco_real, analizar_riesgo)

      if (tickersNoticias.has(tickerUS) || tickersNoticias.has(tickerBCBA)) {
        motivo += " En noticias hoy.";
        if (senal === "NEUTRAL") senal = "MANTENER";
      }

      if (cierre?.sectores && tickerUS) {
        const sect = cierre.sectores[0]?.etf;
        if (sect === "XLF" && ["JPM", "BAC", "C", "GS", "BMA", "GGAL"].includes(tickerUS)) motivo += " Sector financiero lider hoy.";
        if (sect === "XLE" && ["XOM", "CVX", "YPF"].includes(tickerUS)) motivo += " Energia lider hoy.";
      }

      const tipo: SenalCedear["tipo"] = esAccionLocal ? "accion_local" : "cedear";
      const mercado: SenalCedear["mercado"] = esAccionLocal ? "BCBA" : "BCBA";
      const moneda: SenalCedear["moneda"] = "ARS"; // CEDEAR y accion BCBA siempre ARS (variante D es USD pero se informa como ARS base)

      senales.push({
        tickerBCBA,
        tickerUS,
        yahooBCBA: yahooBCBA + (qBCBA ? "" : " (alt " + yahooBCBA_alt + ")"),
        yahooUS,
        nombre: tickerUS,
        tipo,
        mercado,
        moneda,
        precioBCBA, // ARS
        precioUS, // USD solo para referencia subyacente, NO conversion
        variacionBCBA: varBCBA,
        variacionUS: varUS,
        volumen: qUS?.volumen ?? qBCBA_final?.volumen ?? null,
        motivo,
        senal,
        prob,
        fuente: "yfinance BCBA(.BA)/US + screeners + noticias - precios verificados, no inventados",
      });
      if (senales.length >= topN) break;
    }

    senales.sort((a, b) => Math.abs(b.variacionUS ?? b.variacionBCBA ?? 0) - Math.abs(a.variacionUS ?? a.variacionBCBA ?? 0));

    const criterio =
      filtro === "noticias"
        ? `Tickers en noticias hoy (${Array.from(tickersNoticias).slice(0, 3).join(" | ") || "sin noticias"})`
        : filtro === "movers"
          ? "Mayores variaciones del dia (gainers/losers) - solo CEDEARs/acciones validadas"
          : filtro === "liquidos"
            ? "Activos mas liquidos verificados (volumen 30d) - solo tipo=cedear BCBA"
            : "Mix liquidos + movers + noticias - validado";

    const advertencia = omitidosSinDatos > 0 ? `${omitidosSinDatos} tickers omitidos por falta de datos reales (no se inventaron precios).` : undefined;

    return { senales: senales.slice(0, topN), generadoEn, criterio, advertencia };
  });

export async function guardarSenalesDelDia(fecha: string, payload: { senales: SenalCedear[]; criterio: string; generadoEn: string }) {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const dir = join(process.cwd(), ".data", "senales");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${fecha}.json`);
  await writeFile(path, JSON.stringify(payload, null, 2), "utf-8");
  return path;
}
