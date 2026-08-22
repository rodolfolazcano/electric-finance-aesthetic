// FASE 2 — Validación de los 4 sub-motores migrados.
// 3 tickers (GGAL, YPF, AL30) x 4 módulos = 12 llamadas.
// Criterios: sin NaN y valores en [0, 100]. Si disponible=false => valor === 50.
// Datos simulados y realistas por ticker (no inventa fuentes, solo mocks de test).

import { calcularTecnico, type TecnicoInput } from "../lib/scoring/tecnico";
import { calcularFundamental, type FundamentalInput } from "../lib/scoring/fundamental";
import { calcularCuantitativo, type CuantitativoInput } from "../lib/scoring/cuantitativo";
import { calcularSectorial, type SectorialInput } from "../lib/scoring/sectorial";

function genCloses(precioInicial: number, pendiente: number, n = 260): number[] {
  const out: number[] = [];
  let v = precioInicial;
  for (let i = 0; i < n; i++) {
    v = v + pendiente + Math.sin(i / 9) * precioInicial * 0.004;
    out.push(Math.max(0.01, v));
  }
  return out;
}

function buildSr(current: number): TecnicoInput["sr"] {
  return {
    soportes: [{ tipo: "soporte", precio: 0.95 * current, fecha: "2026-07-01", vecesTocado: 3 }],
    resistencias: [
      { tipo: "resistencia", precio: 1.05 * current, fecha: "2026-07-15", vecesTocado: 2 },
    ],
    soporteMasCercano: {
      tipo: "soporte",
      precio: 0.95 * current,
      fecha: "2026-07-01",
      vecesTocado: 3,
    },
    resistenciaMasCercana: {
      tipo: "resistencia",
      precio: 1.05 * current,
      fecha: "2026-07-15",
      vecesTocado: 2,
    },
    distanciaSoportePct: 5,
    distanciaResistenciaPct: 5,
  };
}

function tecnico(ticker: string): TecnicoInput {
  if (ticker === "GGAL")
    return {
      current: 4200,
      sma50: 4000,
      sma200: 3500,
      rsi: 58,
      macd: 12,
      macdSignal: 8,
      closes: genCloses(3400, 3),
      sr: buildSr(4200),
    };
  if (ticker === "YPF")
    return {
      current: 18000,
      sma50: 19000,
      sma200: 17000,
      rsi: 62,
      macd: 5,
      macdSignal: 7,
      closes: genCloses(16000, 8),
      sr: buildSr(18000),
    };
  return {
    current: 280,
    sma50: 270,
    sma200: 260,
    rsi: 50,
    macd: 0.5,
    macdSignal: 0.3,
    closes: genCloses(250, 0.12),
    sr: buildSr(280),
  };
}

const FUNDAMENTAL_VACIO: FundamentalInput = {
  trailingPE: null,
  forwardPE: null,
  sectorPE: null,
  priceToBook: null,
  debtToEquity: null,
  returnOnEquity: null,
  revenueGrowth: null,
  earningsGrowth: null,
  fcfYield: null,
  evToEbitda: null,
  recommendationMean: null,
  marketCap: null,
  pePercentile: null,
  totalLiabilities: null,
  totalStockholderEquity: null,
  ebit: null,
  totalAssets: null,
  wacc: null,
};

function fundamental(ticker: string): FundamentalInput {
  if (ticker === "AL30") return FUNDAMENTAL_VACIO;
  if (ticker === "GGAL")
    return {
      trailingPE: 14,
      forwardPE: 11,
      sectorPE: 13,
      priceToBook: 1.1,
      debtToEquity: 85,
      returnOnEquity: 0.21,
      revenueGrowth: 0.42,
      earningsGrowth: 0.35,
      fcfYield: 0.02,
      evToEbitda: 9,
      recommendationMean: 1.7,
      marketCap: 1.2e10,
      pePercentile: 34,
      totalLiabilities: 12e12,
      totalStockholderEquity: 9e12,
      ebit: 2.4e12,
      totalAssets: 21e12,
      wacc: 0.35,
    };
  return {
    trailingPE: 6,
    forwardPE: 5,
    sectorPE: 8,
    priceToBook: 1.6,
    debtToEquity: 60,
    returnOnEquity: 0.17,
    revenueGrowth: 0.03,
    earningsGrowth: 0.02,
    fcfYield: 0.06,
    evToEbitda: 4.5,
    recommendationMean: 1.9,
    marketCap: 8e9,
    pePercentile: 22,
    totalLiabilities: 6e12,
    totalStockholderEquity: 8e12,
    ebit: 1.5e12,
    totalAssets: 14e12,
    wacc: 0.3,
  };
}

function cuantitativo(ticker: string): CuantitativoInput {
  if (ticker === "GGAL") return { sharpeRatio: 1.2, beta: 1.1, rSquared: 0.7, var95: -0.04 };
  if (ticker === "YPF") return { sharpeRatio: 0.6, beta: 1.3, rSquared: 0.55, var95: -0.07 };
  return { sharpeRatio: null, beta: null, rSquared: null, var95: null };
}

function sectorial(ticker: string): SectorialInput {
  if (ticker === "GGAL")
    return {
      symbol: "GGAL",
      sector: "Servicios financieros",
      esETF: false,
      currentPrice: 4200,
      trailingPE: 14,
      totalStockholderEquity: 9e12,
      sharesOutstanding: 2.1e9,
      totalAssets: 21e12,
      healthScoreHistory: [],
      returnOnEquity: 0.21,
      profitMargin: 0.25,
      debtToEquityRaw: 85,
      operatingMargin: 0.3,
    } as unknown as SectorialInput;
  if (ticker === "YPF")
    return {
      symbol: "YPF",
      sector: "Energía",
      esETF: false,
      currentPrice: 18000,
      trailingPE: 6,
      totalStockholderEquity: 8e12,
      sharesOutstanding: 393e6,
      totalAssets: 14e12,
      healthScoreHistory: [],
      freeCashflowM: 1500,
      debtToEquityRaw: 45,
      returnOnEquity: 0.12,
      operatingMargin: 0.22,
      totalCashFromOperatingActivities: 4500,
    } as unknown as SectorialInput;
  return {
    symbol: "AL30",
    sector: null,
    esETF: false,
    currentPrice: 280,
    trailingPE: null,
    totalStockholderEquity: null,
    sharesOutstanding: null,
    totalAssets: null,
    healthScoreHistory: [],
  } as unknown as SectorialInput;
}

const TICKERS = ["GGAL", "YPF", "AL30"] as const;
let errores = 0;

function assert(r: { valor: number; disponible: boolean }, ticker: string, motor: string) {
  const nu = Number.isNaN(r.valor);
  const rango = r.valor >= 0 && r.valor <= 100;
  const flagOk = !r.disponible ? r.valor === 50 : true;
  if (nu || !rango || !flagOk) errores++;
  console.log(
    `${ticker.padEnd(5)} | ${motor.padEnd(12)} | valor=${String(r.valor).padStart(6)} | disponible=${r.disponible} | NaN=${nu} | rango=${rango} | flagOk=${flagOk}`,
  );
}

for (const t of TICKERS) {
  assert(calcularTecnico(tecnico(t)), t, "tecnico");
  assert(calcularFundamental(fundamental(t)), t, "fundamental");
  assert(calcularCuantitativo(cuantitativo(t)), t, "cuantitativo");
  assert(calcularSectorial(sectorial(t)), t, "sectorial");
}

console.log(errores === 0 ? "4 sub-motores migrados, 12/12 pruebas OK" : `FALLOS: ${errores}`);
process.exit(errores === 0 ? 0 : 1);
