/** Semáforo técnico + fundamental con datos en vivo de Yahoo Finance.
 *  - Análisis técnico: RSI, MACD, SMA, soportes/resistencias y anomalía de precio.
 *  - Análisis fundamental: P/E, crecimiento, margen, ROE, upside vs consenso y deuda.
 *  - Validación con noticias recientes sobre el activo.
 *  Devuelve un `SemaforoResult` con scores en [-2, 2] y la forma pedida
 *  (techScore, fundScore, totalScore, clasificacionJerarquica, recommendation,
 *  light, signals, history, scoreTecnicoDetalle, soportes/resistencias). */

import { fetchYahooChart, fetchYahooQuoteSummaryJson } from "./yahoo-http";
import type { QuoteSummaryResult } from "./yahoo-types";
import { resolverSimbolo } from "./market-data";
import { consultarNoticias } from "./noticias.server";
import type { FuenteMercado } from "./mercado.server";
import {
  analizarTendencia,
  analizarMomentum,
  analizarSoporteResistencia,
  analizarAnomaliaPrecio,
  calcularScoreTecnico,
  clasificarScore,
  calcularScoreFundamental,
  scoreMetricaFundamental,
  sma,
  rsi,
  macd,
  fmtNum,
  type LuzSemaforo,
  type MetricasFundamentales,
} from "./semaforo-tecnico";

const MODULOS_FUNDAMENTALES = [
  "financialData",
  "summaryDetail",
  "defaultKeyStatistics",
  "price",
  "assetProfile",
];

const FORMATO_FECHA = new Intl.DateTimeFormat("es-AR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

interface YQuoteSummaryEnvelope {
  quoteSummary?: {
    result?: QuoteSummaryResult[];
    error?: { description?: string } | null;
  };
}

function numero(o: unknown): number | null {
  if (typeof o === "number" && isFinite(o)) return o;
  if (o && typeof o === "object" && "raw" in (o as object)) {
    const raw = (o as { raw?: unknown }).raw;
    if (typeof raw === "number" && isFinite(raw)) return raw;
  }
  return null;
}

function extraerMetricas(
  r: QuoteSummaryResult | undefined,
  precio: number | null,
): MetricasFundamentales {
  const fd = r?.financialData;
  const sd = r?.summaryDetail;
  const dks = r?.defaultKeyStatistics;
  const pe = numero(sd?.trailingPE) ?? numero(dks?.trailingPE);
  const revenueGrowth = numero(fd?.revenueGrowth);
  const profitMargin = numero(fd?.profitMargins);
  const roe = numero(fd?.returnOnEquity);
  const deudaEquity = numero(fd?.debtToEquity);
  const target = numero(fd?.targetMeanPrice);
  const upside =
    target != null && precio != null && precio > 0 ? (target - precio) / precio : null;
  return { pe, revenueGrowth, profitMargin, roe, upside, deudaEquity };
}

export interface SenalSemaforo {
  nombre: string;
  score: number | null;
  peso: number | null;
  detalle: string;
}

export interface SemaforoResult {
  simbolo: string;
  nombre: string | null;
  moneda: string | null;
  precio: number | null;
  fechaDatos: string;
  techScore: number | null;
  fundScore: number | null;
  totalScore: number | null;
  scoreUnificado: number | null;
  clasificacionJerarquica: string;
  recommendation: string;
  light: LuzSemaforo;
  signals: SenalSemaforo[];
  history: {
    precio: number | null;
    rsi: number | null;
    macd: number | null;
    senal: number | null;
    histMacd: number | null;
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    high52: number | null;
    low52: number | null;
  };
  scoreTecnicoDetalle: {
    tendencia: number | null;
    momentum: number | null;
    soporteResistencia: number | null;
    anomalia: number | null;
    score: number | null;
    detalle: string;
  };
  scoreFundamentalDetalle: MetricasFundamentales & {
    score: number | null;
    detalle: string;
    metodos: string[];
  };
  soportes: number[];
  resistencias: number[];
  noticias: string;
  fuentes: FuenteMercado[];
  origen: string;
  error: string | null;
}

function baseResultado(simbolo: string): SemaforoResult {
  return {
    simbolo: simbolo.toUpperCase(),
    nombre: null,
    moneda: null,
    precio: null,
    fechaDatos: FORMATO_FECHA.format(new Date()),
    techScore: null,
    fundScore: null,
    totalScore: null,
    scoreUnificado: null,
    clasificacionJerarquica: "SIN DATOS",
    recommendation: "SIN DATOS",
    light: "gray",
    signals: [],
    history: {
      precio: null,
      rsi: null,
      macd: null,
      senal: null,
      histMacd: null,
      sma20: null,
      sma50: null,
      sma200: null,
      high52: null,
      low52: null,
    },
    scoreTecnicoDetalle: {
      tendencia: null,
      momentum: null,
      soporteResistencia: null,
      anomalia: null,
      score: null,
      detalle: "",
    },
    scoreFundamentalDetalle: {
      pe: null,
      revenueGrowth: null,
      profitMargin: null,
      roe: null,
      upside: null,
      deudaEquity: null,
      score: null,
      detalle: "",
      metodos: [],
    },
    soportes: [],
    resistencias: [],
    noticias: "",
    fuentes: [],
    origen: "",
    error: null,
  };
}

function luzPara(score: number | null): LuzSemaforo {
  if (score == null || !isFinite(score)) return "gray";
  if (score > 1.5) return "green";
  if (score > 0.3) return "green";
  if (score > -0.3) return "yellow";
  if (score > -1.5) return "red";
  return "red";
}

/** Analiza un activo con datos reales + noticias de validación. */
export async function analizarSemaforo(consulta: string): Promise<SemaforoResult> {
  const entrada = (consulta ?? "").trim();
  const out = baseResultado(entrada);
  if (!entrada) {
    return { ...out, error: "no se recibió un símbolo o empresa para analizar" };
  }
  try {
    let simbolo = entrada;
    if (!/^[A-Z0-9.\-^]+$/i.test(entrada)) {
      const resuelto = await resolverSimbolo(entrada);
      if (!resuelto) {
        return { ...out, error: `no pude resolver "${entrada}" a un ticker de mercado` };
      }
      simbolo = resuelto;
    }
    out.simbolo = simbolo.toUpperCase();

    const [chart, qsResp] = await Promise.all([
      fetchYahooChart(simbolo, "2y", "1d"),
      fetchYahooQuoteSummaryJson<YQuoteSummaryEnvelope>(simbolo, MODULOS_FUNDAMENTALES),
    ]);

    const res = chart?.chart?.result?.[0];
    const quoteRaw = res?.indicators?.quote?.[0];
    const closes = (quoteRaw?.close ?? []).filter(
      (c): c is number => typeof c === "number" && isFinite(c) && c > 0,
    );
    const precio =
      numero(res?.meta?.regularMarketPrice) ?? (closes.length ? (closes[closes.length - 1] ?? null) : null);
    const fechaUltimo = res?.meta?.regularMarketTime
      ? new Date(res?.meta?.regularMarketTime * 1000)
      : new Date();
    out.fechaDatos = FORMATO_FECHA.format(fechaUltimo);
    out.nombre =
      res?.meta?.longName ?? res?.meta?.shortName ?? qsResp?.json?.quoteSummary?.result?.[0]?.price?.longName ?? null;
    out.moneda =
      res?.meta?.currency ?? qsResp?.json?.quoteSummary?.result?.[0]?.price?.currency ?? null;
    out.precio = precio;

    if (closes.length < 30) {
      return {
        ...out,
        error: `sin suficientes datos de precios de ${simbolo} para el análisis técnico`,
      };
    }

    // ---- Análisis técnico ----
    const ultimas252 = closes.slice(-252);
    const high52 = Math.max(...ultimas252);
    const low52 = Math.min(...ultimas252);
    const tendencia = analizarTendencia(closes);
    const momentum = analizarMomentum(closes);
    const sr = analizarSoporteResistencia(closes, 5, high52, low52);
    const anomalia = analizarAnomaliaPrecio(closes);
    const scoreTecnico = calcularScoreTecnico({
      tendencia: tendencia.score,
      momentum: momentum.score,
      soporteResistencia: sr.score,
      anomalia: anomalia.score,
    });
    out.scoreTecnicoDetalle = {
      tendencia: tendencia.score,
      momentum: momentum.score,
      soporteResistencia: sr.score,
      anomalia: anomalia.score,
      score: scoreTecnico,
      detalle: [tendencia.detalle, momentum.detalle, sr.detalle, anomalia.detalle].join("\n"),
    };

    const r = qsResp?.json?.quoteSummary?.result?.[0];
    const metricas = extraerMetricas(r, precio);
    const fund = calcularScoreFundamental(metricas);
    const metodosFund = fund.detalle.split(" · ").filter(Boolean);
    out.scoreFundamentalDetalle = {
      ...metricas,
      score: fund.score,
      detalle: fund.detalle,
      metodos: metodosFund,
    };

    const totalScore =
      scoreTecnico != null && fund.score != null
        ? (scoreTecnico + fund.score) / 2
        : (scoreTecnico ?? fund.score ?? null);
    out.techScore = scoreTecnico;
    out.fundScore = fund.score;
    out.totalScore = totalScore;
    out.scoreUnificado = totalScore;
    out.clasificacionJerarquica = clasificarScore(totalScore).clasificacion;
    out.recommendation = clasificarScore(totalScore).clasificacion;
    out.light = luzPara(totalScore);

    const resumenMacd = macd(closes);
    out.history = {
      precio,
      rsi: rsi(closes, 14),
      macd: resumenMacd.macd,
      senal: resumenMacd.senal,
      histMacd: resumenMacd.hist,
      sma20: sma(closes, 20),
      sma50: closes.length >= 50 ? sma(closes, 50) : null,
      sma200: closes.length >= 200 ? sma(closes, 200) : null,
      high52,
      low52,
    };

    out.soportes = sr.sr.soportes;
    out.resistencias = sr.sr.resistencias;

    // ---- Señales ----
    const signals: SenalSemaforo[] = [
      { nombre: "Tendencia", score: tendencia.score, peso: 0.4, detalle: tendencia.detalle },
      { nombre: "Momentum", score: momentum.score, peso: 0.3, detalle: momentum.detalle },
      { nombre: "Soporte/Resistencia", score: sr.score, peso: 0.2, detalle: sr.detalle },
      { nombre: "Anomalía de precio", score: anomalia.score, peso: 0.1, detalle: anomalia.detalle },
    ];
    for (const key of ["pe", "revenueGrowth", "profitMargin", "roe", "upside", "deudaEquity"] as const) {
      if (metricas[key] == null) continue;
      const v = metricas[key];
      let nombre: string = key;
      let texto = "";
      if (key === "pe") { nombre = "P/E"; texto = `P/E ${fmtNum(v, 1)}`; }
      else if (key === "revenueGrowth") { nombre = "Crecimiento ingresos"; texto = `${((v ?? 0) * 100).toFixed(1)}%`; }
      else if (key === "profitMargin") { nombre = "Margen"; texto = `${((v ?? 0) * 100).toFixed(1)}%`; }
      else if (key === "roe") { nombre = "ROE"; texto = `${((v ?? 0) * 100).toFixed(1)}%`; }
      else if (key === "upside") { nombre = "Upside vs consenso"; texto = `${((v ?? 0) * 100).toFixed(1)}%`; }
      else { nombre = "Deuda/Patrimonio"; texto = fmtNum(v, 2); }
      signals.push({ nombre, score: scoreMetricaFundamental(key, v), peso: null, detalle: texto });
    }

    // ---- Validación con noticias ----
    const nombreCompania = out.nombre ?? simbolo;
    const fuentes: FuenteMercado[] = [];
    fuentes.push({
      dominio: "Yahoo Finance",
      url: "",
      title: `Datos de mercado y precios de ${simbolo.toUpperCase()}`,
    });
    try {
      const noticias = await consultarNoticias(nombreCompania, "última semana");
      out.noticias = noticias.texto;
      for (const f of noticias.fuentes) {
        if (!fuentes.some((x) => x.url && x.url === f.url)) fuentes.push(f);
      }
    } catch {
      out.noticias = `No se pudieron obtener noticias recientes sobre ${nombreCompania}.`;
    }
    out.fuentes = fuentes;
    out.origen = "Yahoo Finance (chart + quoteSummary) + RSS/Google Noticias";
    return out;
  } catch (e) {
    return { ...out, error: e instanceof Error ? e.message : "error inesperado" };
  }
}

function textoLuz(light: LuzSemaforo): string {
  if (light === "green") return "verde";
  if (light === "yellow") return "amarilla";
  if (light === "red") return "roja";
  return "gris";
}

function textoSeñalSig(score: number | null): string {
  if (score == null) return "s/d";
  if (score >= 1.5) return "muy alcista";
  if (score >= 0.3) return "levemente alcista";
  if (score > -0.3) return "neutral";
  if (score > -1.5) return "levemente bajista";
  return "muy bajista";
}

/** Formatea el resultado del semáforo para que el agente lo imprima con datos
 *  correctos, coherentes y con sus fuentes. */
export function textoSemaforo(r: SemaforoResult): string {
  if (r.error) {
    return `SEMÁFORO DE ${r.simbolo}:\nNO se pudo completar el análisis con datos reales (${r.error}). Está prohibido inventar indicadores, niveles o métricas; si el dato en vivo no está disponible, respondé con honestidad que el análisis no pudo completarse y ofrecé reintentar.`;
  }
  const t = r.scoreTecnicoDetalle;
  const f = r.scoreFundamentalDetalle;
  const L = [];
  L.push(`SEMÁFORO TÉCNICO + FUNDAMENTAL — ${r.simbolo}`);
  L.push(`Activo: ${r.nombre ?? r.simbolo} · Moneda: ${r.moneda ?? "s/d"}`);
  L.push(`Precio actual: ${fmtNum(r.precio, 4)} · Datos al: ${r.fechaDatos}`);
  L.push("");
  L.push("ANÁLISIS TÉCNICO");
  L.push(`- RSI14: ${fmtNum(r.history.rsi, 1)} · MACD: ${fmtNum(r.history.macd, 3)} (hist. ${fmtNum(r.history.histMacd, 3)})${r.history.senal != null ? ` · señal MACD ${fmtNum(r.history.senal, 3)}` : ""}`);
  L.push(`- SMA20: ${fmtNum(r.history.sma20)} | SMA50: ${fmtNum(r.history.sma50)} | SMA200: ${fmtNum(r.history.sma200)}`);
  L.push(`- Máx 52s: ${fmtNum(r.history.high52)} | Mín 52s: ${fmtNum(r.history.low52)}`);
  L.push(`- ${t.detalle.replace(/\n/g, "\n  ")}`);
  L.push(`- Soportes: ${r.soportes.length ? r.soportes.map((s) => fmtNum(s)).join(" / ") : "s/d"} | Resistencias: ${r.resistencias.length ? r.resistencias.map((s) => fmtNum(s)).join(" / ") : "s/d"}`);
  L.push(`- Score técnico: ${t.score == null ? "s/d" : fmtNum(t.score, 2)} (sobre 2) · señal ${textoSeñalSig(t.score)}`);
  L.push("");
  L.push("ANÁLISIS FUNDAMENTAL");
  if (f.score == null) {
    L.push(`- ${f.detalle}`);
  } else {
    L.push(`- ${f.detalle}`);
    L.push(`- Score fundamental: ${f.score == null ? "s/d" : fmtNum(f.score, 2)} (sobre 2) · señal ${textoSeñalSig(f.score)}`);
  }
  L.push("");
  L.push("SEMÁFORO UNIFICADO (técnico + fundamental)");
  L.push(`- Técnico: ${r.techScore == null ? "s/d" : fmtNum(r.techScore, 2)} | Fundamental: ${r.fundScore == null ? "s/d" : fmtNum(r.fundScore, 2)} | Unificado: ${r.scoreUnificado == null ? "s/d" : fmtNum(r.scoreUnificado, 2)}`);
  L.push(`- Clasificación: ${r.clasificacionJerarquica}`);
  L.push(`- Luz: ${textoLuz(r.light)} (umbrales: >1.5 COMPRA · >0.3 COMPRA CON CAUTELA · >-0.3 MANTENER · >-1.5 REDUCIR · VENTA)`);
  if (r.signals.length) {
    L.push("");
    L.push("SEÑALES DETALLADAS");
    for (const s of r.signals) {
      L.push(`- ${s.nombre}${s.peso != null ? ` (peso ${Math.round(s.peso * 100)}%)` : ""}: score ${s.score == null ? "s/d" : fmtNum(s.score, 2)} — ${s.detalle}`);
    }
  }
  if (r.noticias && !/no se pudieron obtener noticias/i.test(r.noticias)) {
    L.push("");
    L.push("NOTICIAS QUE VALIDAN EL ANÁLISIS:");
    L.push(r.noticias);
  }
  L.push("");
  L.push("Este análisis es educativo y NO constituye recomendación de inversión. Los datos provienen de fuentes públicas externas y pueden contener errores o demoras.");
  return L.join("\n");
}