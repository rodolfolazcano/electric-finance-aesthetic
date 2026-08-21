// @ts-nocheck
// Earth2Studio — Análisis de impacto climático en activos financieros
// Correlaciona pronósticos meteorológicos con sectores/activos argentinos

import type { ForecastStep, SectorImpact } from "./earth2-types";

export interface AssetWeatherCorrelation {
  ticker: string;
  name: string;
  sector: string;
  weatherSensitivity: "alta" | "media" | "baja";
  relevantVariables: string[];
  forecastImpact: "positivo" | "negativo" | "neutral" | "mixto";
  reasoning: string;
}

const ASSET_WEATHER_MAP: Record<
  string,
  {
    sector: string;
    name: string;
    sensitivity: "alta" | "media" | "baja";
    vars: string[];
    impactFn: (vars: Record<string, number[]>) => number;
  }
> = {
  PAMP: {
    sector: "Energía",
    name: "Pampa Energía",
    sensitivity: "alta",
    vars: ["t2m", "tp"],
    impactFn: (v) =>
      (v["t2m"] ? (Math.max(...v["t2m"]) > 35 ? 0.8 : 0.2) : 0) +
      (v["tp"] ? (Math.max(...v["tp"]) > 30 ? 0.6 : 0) : 0),
  },
  CEPU: {
    sector: "Energía",
    name: "Central Puerto",
    sensitivity: "alta",
    vars: ["tp", "t2m"],
    impactFn: (v) =>
      (v["tp"] ? (Math.max(...v["tp"]) > 20 ? 0.7 : 0) : 0) +
      (v["t2m"] ? (Math.max(...v["t2m"]) > 35 ? 0.5 : 0) : 0),
  },
  TGSU2: {
    sector: "Energía",
    name: "TGS",
    sensitivity: "media",
    vars: ["t2m"],
    impactFn: (v) => (v["t2m"] ? (Math.max(...v["t2m"]) > 35 ? 0.6 : 0) : 0),
  },
  AGRO: {
    sector: "Agro",
    name: "Agro",
    sensitivity: "alta",
    vars: ["tp", "t2m"],
    impactFn: (v) => {
      let s = 0;
      if (v["tp"]) {
        const total = v["tp"].reduce((a, b) => a + b, 0);
        s += total > 60 ? -0.6 : total > 20 ? 0.4 : -0.2;
      }
      if (v["t2m"]) {
        const minT = Math.min(...v["t2m"]);
        s += minT < 0 ? -0.8 : 0;
      }
      return Math.max(-1, Math.min(1, s));
    },
  },
  MOLA: {
    sector: "Agro",
    name: "Molinos Agro",
    sensitivity: "media",
    vars: ["tp"],
    impactFn: (v) => (v["tp"] ? (Math.max(...v["tp"]) > 40 ? -0.5 : 0) : 0),
  },
  BYMA: {
    sector: "Financiero",
    name: "Bolsa y Mercados",
    sensitivity: "baja",
    vars: [],
    impactFn: () => 0,
  },
  GGAL: {
    sector: "Financiero",
    name: "Grupo Galicia",
    sensitivity: "baja",
    vars: ["tp"],
    impactFn: (v) => (v["tp"] ? (Math.max(...v["tp"]) > 50 ? -0.2 : 0) : 0),
  },
  SUPV: {
    sector: "Financiero",
    name: "Supervielle",
    sensitivity: "baja",
    vars: [],
    impactFn: () => 0,
  },
};

export function analyzeAssetCorrelations(steps: ForecastStep[]): AssetWeatherCorrelation[] {
  if (!steps || steps.length === 0) return [];

  // Build variable time series from forecast
  const varSeries: Record<string, number[]> = {};
  for (const s of steps) {
    for (const [k, v] of Object.entries(s.data)) {
      if (!varSeries[k]) varSeries[k] = [];
      varSeries[k].push(v);
    }
  }

  const results: AssetWeatherCorrelation[] = [];

  for (const [ticker, meta] of Object.entries(ASSET_WEATHER_MAP)) {
    const impactScore = meta.impactFn(varSeries);
    const forecastImpact: AssetWeatherCorrelation["forecastImpact"] =
      impactScore > 0.3
        ? "positivo"
        : impactScore < -0.3
          ? "negativo"
          : Math.abs(impactScore) > 0.1
            ? "mixto"
            : "neutral";

    const reasoning = buildReasoning(ticker, meta, varSeries, impactScore);

    results.push({
      ticker,
      name: meta.name,
      sector: meta.sector,
      weatherSensitivity: meta.sensitivity,
      relevantVariables: meta.vars,
      forecastImpact,
      reasoning,
    });
  }

  return results.sort((a, b) => {
    const order = { alta: 0, media: 1, baja: 2 };
    return (order[a.weatherSensitivity] ?? 2) - (order[b.weatherSensitivity] ?? 2);
  });
}

function buildReasoning(
  ticker: string,
  meta: { name: string; sector: string },
  varSeries: Record<string, number[]>,
  score: number,
): string {
  const parts: string[] = [];
  if (varSeries["t2m"]) {
    const maxT = Math.max(...varSeries["t2m"]);
    const minT = Math.min(...varSeries["t2m"]);
    if (maxT > 35) parts.push(`temperatura extrema ${maxT.toFixed(1)}°C`);
    if (minT < 0) parts.push(`helada ${minT.toFixed(1)}°C`);
  }
  if (varSeries["tp"]) {
    const totalP = varSeries["tp"].reduce((a, b) => a + b, 0);
    if (totalP > 50) parts.push(`precipitación acumulada ${totalP.toFixed(0)}mm`);
  }
  if (varSeries["u10m"] && varSeries["v10m"]) {
    const maxW = Math.max(
      ...varSeries["u10m"].map((u, i) =>
        Math.sqrt(u * u + varSeries["v10m"][i] * varSeries["v10m"][i]),
      ),
    );
    if (maxW > 15) parts.push(`viento fuerte ${maxW.toFixed(1)}m/s`);
  }
  return parts.length > 0
    ? `${meta.name}: ${parts.join(", ")} → impacto ${score > 0 ? "positivo" : "negativo"} (${(score * 100).toFixed(0)}%)`
    : `${meta.name}: sin sensibilidad climática directa en este pronóstico`;
}

export function generateMarketOutlook(correlations: AssetWeatherCorrelation[]): string[] {
  const lines: string[] = [];
  const positives = correlations.filter((c) => c.forecastImpact === "positivo");
  const negatives = correlations.filter((c) => c.forecastImpact === "negativo");

  if (positives.length > 0) {
    lines.push(
      `✅ Sectores beneficiados: ${positives.map((c) => `${c.ticker} (${c.sector})`).join(", ")}`,
    );
  }
  if (negatives.length > 0) {
    lines.push(
      `⚠️ Sectores presionados: ${negatives.map((c) => `${c.ticker} (${c.sector})`).join(", ")}`,
    );
  }
  if (lines.length === 0) {
    lines.push("➡️ Sin impacto climático significativo en el universo de cobertura");
  }
  return lines;
}
