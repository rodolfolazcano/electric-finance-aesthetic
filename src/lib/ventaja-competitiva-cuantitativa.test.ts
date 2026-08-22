import type { FundamentalAFResult, PeriodoHistoricoRow } from "./fundamental-af.functions";
import type { ConclusionSectorialInteligente } from "./interpretacion-sectorial.functions";
import { calcularVentajaCompetitivaCuantitativa } from "./ventaja-competitiva-cuantitativa.functions";
import type { VentajaCompetitivaCuantitativaResult } from "./ventaja-competitiva-cuantitativa.functions";

// ── Helpers ──

function makeResult(overrides: Partial<FundamentalAFResult> = {}): FundamentalAFResult {
  return {
    symbol: "TEST",
    companyName: "Test Corp",
    sector: "Technology",
    industry: "Software",
    country: "US",
    pegImpliedGrowthRate: null,
    currentPrice: 100,
    marketCapM: 50000,
    trailingPE: 25,
    forwardPE: 22,
    pegRatio: 1.5,
    priceToBook: 3.0,
    evToEbitda: 12,
    returnOnEquity: 0.18,
    returnOnAssets: 0.08,
    profitMargin: 0.20,
    operatingMargin: 0.25,
    grossMargin: 0.55,
    revenueGrowth: 0.15,
    earningsGrowth: 0.12,
    debtToEquityRaw: 60,
    currentRatio: 1.8,
    quickRatio: 1.2,
    freeCashflowM: 5000,
    fcfYield: 0.05,
    dividendYield: 0.01,
    payoutRatio: 0.25,
    targetMeanPrice: 120,
    targetLowPrice: 100,
    targetHighPrice: 140,
    recommendationMean: 2.0,
    numberOfAnalystOpinions: 12,
    upsidePct: 20,
    beta: 1.2,
    betaAnomalo: false,
    betaPropio: 1.15,
    betaR2: 0.75,
    betaBenchmarkUsado: "SPY",
    betaAdvertencia: null,
    revisionEstimadosPct: 8,
    revisionEstimadosDetalle: "Revisiones al alza en 90 días: +8%.",
    insiderNetActivityPct: 5,
    insiderNetActivityInterpretacion: "Actividad balanceada",
    secFilings: [],
    benchmarkPrice: 500,
    benchmarkMarketCapM: 400000,
    benchmarkBeta: 1.0,
    benchmarkName: "SPY",
    sharesOutstanding: 500000000,
    min10y: 40,
    max10y: 150,
    avg10y: 90,
    pricePercentile10y: 60,
    peHistory: [],
    pePercentile: 50,
    pegPercentile: null,
    fundScore: 72,
    fundScoreRaw: 72,
    fundScoreAbsolute: 72,
    dataCoverage: 0.875,
    metricsAvailable: 7,
    metricsTotal: 7,
    rawPts: 72,
    maxPts: 100,
    scoreDetails: [],
    healthScoreHistory: [],
    plazo: "Largo plazo",
    accion: "Acumular",
    error: null,
    totalAssets: 80000,
    totalLiabilities: 40000,
    totalStockholderEquity: 40000,
    totalCurrentAssets: 30000,
    totalCurrentLiabilities: 15000,
    cashAndEquivalents: 10000,
    totalDebtBalance: 5000,
    workingCapital: 15000,
    currentRatioCheck: 2.0,
    currentRatioWarning: null,
    totalCashFromOperatingActivities: 12000,
    capitalExpenditures: 3000,
    dividendsPaid: 1000,
    fcfCalculadoManual: 9000,
    fcfWarning: null,
    incomeBeforeTax: 15000,
    incomeTaxExpense: 3000,
    ebit: 15000,
    interestExpense: 500,
    effectiveTaxRate: 20,
    interestCoverageRatio: 30,
    totalRevenue: 50000,
    researchDevelopment: 5000,
    rdToRevenuePct: 10,
    netIncomeFromIS: 12000,
    netReceivables: null,
    inventory: null,
    accountsPayable: null,
    costOfRevenue: null,
    retainedEarnings: null,
    dilutedAverageShares: null,
    trailingEps: 4.0,
    freeCashflowRaw: 8000,
    _riesgoPaisPct: 0,
    insidersPercentHeld: null,
    institutionsPercentHeld: null,
    insiderTransactions: [],
    ratingChanges: [],
    companyOfficers: [],
    governanceRiskScores: { auditRisk: null, boardRisk: null, compensationRisk: null, shareHolderRightsRisk: null, overallRisk: null },
    governanceRiskLabel: null,
    governanceEpochDate: null,
    longBusinessSummary: null,
    quoteType: "EQUITY",
    esETF: false,
    ...overrides,
  };
}

function makePeer(ticker: string, rd: number | null, rev: number | null, overrides: Partial<FundamentalAFResult> = {}): FundamentalAFResult {
  return makeResult({ symbol: ticker, rdToRevenuePct: rd, revisionEstimadosPct: rev, revenueGrowth: 0.1, profitMargin: 0.15, ...overrides });
}

function makePeriodo(overrides: Partial<PeriodoHistoricoRow> = {}): PeriodoHistoricoRow {
  return {
    label: "FY2024",
    endDate: "2024-12-31",
    revenue: 50000,
    revenuePrev: 45000,
    revenueChgPct: 0.11,
    netIncome: 12000,
    netIncomePrev: 10000,
    netIncomeChgPct: 0.20,
    eps: 4.0,
    epsPrev: 3.5,
    epsChgPct: 0.14,
    grossMargin: 0.55,
    operatingMargin: 0.25,
    netMargin: 0.20,
    ebit: 15000,
    interestExpense: 500,
    totalAssets: 80000,
    totalLiabilities: 40000,
    totalEquity: 40000,
    currentAssets: 30000,
    currentLiabilities: 15000,
    inventory: 8000,
    netReceivables: 10000,
    netFixedAssets: 20000,
    cash: 10000,
    totalDebt: 5000,
    cashFromOps: 12000,
    capex: 3000,
    fcf: 9000,
    earningsDate: "2025-01-30",
    ...overrides,
  };
}

function makeConclusion(overrides: Partial<ConclusionSectorialInteligente> = {}): ConclusionSectorialInteligente {
  return {
    resumenEjecutivo: "Test",
    fortalezas: [],
    debilidades: [],
    mejorAlternativaSector: null,
    advertencias: [],
    ...overrides,
  };
}

// ── Tests ──

let passed = 0;
let failed: string[] = [];

function assert(condition: boolean, msg: string) {
  if (condition) passed++;
  else failed.push(msg);
}

// ── Test (a): 4 señales completas y positivas ──
(() => {
  const result = makeResult();
  const peers = [
    makePeer("PEER1", 5, 3),
    makePeer("PEER2", 3, 1),
    makePeer("PEER3", 8, 5),
    makePeer("PEER4", 2, -2),
    makePeer("PEER5", 4, 2),
  ];
  const conclusion = makeConclusion({
    fortalezas: [
      "margen neto: Líder del sector (percentil ~85).",
      "crecimiento de ingresos: Líder del sector (percentil ~80).",
    ],
    debilidades: [],
  });
  const historico = [
    makePeriodo({ label: "FY2021", endDate: "2021-12-31", netMargin: 0.15, revenueChgPct: 0.08 }),
    makePeriodo({ label: "FY2022", endDate: "2022-12-31", netMargin: 0.17, revenueChgPct: 0.10 }),
    makePeriodo({ label: "FY2023", endDate: "2023-12-31", netMargin: 0.19, revenueChgPct: 0.12 }),
    makePeriodo({ label: "FY2024", endDate: "2024-12-31", netMargin: 0.20, revenueChgPct: 0.15 }),
  ];

  const res = calcularVentajaCompetitivaCuantitativa(result, { peers, sector: "Technology", industria: "Software" }, conclusion, historico);

  assert(res.senales.length === 4, `[a] debe tener 4 señales, tiene ${res.senales.length}`);
  assert(res.senalesPositivas >= 2, `[a] al menos 2 señales positivas, tiene ${res.senalesPositivas}`);
  assert(res.conclusion === "Alta evidencia" || res.conclusion === "Evidencia moderada", `[a] conclusión esperada, obtuvo ${res.conclusion}`);
  assert(res.senales[0].fuerza === "positiva", `[a] Señal 1 debe ser positiva, es ${res.senales[0].fuerza}`);
  assert(res.senales[1].fuerza === "positiva", `[a] Señal 2 debe ser positiva, es ${res.senales[1].fuerza}`);
  assert(res.senales[2].comparadoConSector === true, `[a] Señal 3 debe compararse con sector`);
  assert(res.senales[3].comparadoConSector === true, `[a] Señal 4 debe compararse con sector`);
})();

// ── Test (b): peer individual con rdToRevenuePct null → se excluye del percentil ──
(() => {
  const result = makeResult({ rdToRevenuePct: 10 });
  const peers = [
    makePeer("PEER1", 5, 3),
    makePeer("PEER2", null, 1),
    makePeer("PEER3", 8, 5),
    makePeer("PEER4", 2, -2),
  ];
  const conclusion = makeConclusion({
    fortalezas: ["margen neto: Líder del sector (percentil ~85)."],
    debilidades: [],
  });
  const historico = [
    makePeriodo({ label: "FY2022", endDate: "2022-12-31", netMargin: 0.18, revenueChgPct: 0.10 }),
    makePeriodo({ label: "FY2023", endDate: "2023-12-31", netMargin: 0.19, revenueChgPct: 0.12 }),
    makePeriodo({ label: "FY2024", endDate: "2024-12-31", netMargin: 0.20, revenueChgPct: 0.15 }),
  ];

  const res = calcularVentajaCompetitivaCuantitativa(result, { peers, sector: "Technology", industria: "Software" }, conclusion, historico);

  const senal3 = res.senales[2];
  assert(senal3.nombre === "I+D e innovación", `[b] Señal 3 debe existir, es ${senal3.nombre}`);
  // PEER2 has null rdToRevenuePct, should be excluded from count
  assert(res.coberturaDatos.peersConRdData === 3, `[b] peersConRdData debe ser 3 (excluye PEER2), es ${res.coberturaDatos.peersConRdData}`);
  assert(res.coberturaDatos.peersTotal === 4, `[b] peersTotal debe ser 4`);
  // Should still compute a valid percentile with remaining 3 peers
  assert(senal3.fuerza !== "no_disponible", `[b] Señal 3 debe tener dato suficiente, es ${senal3.fuerza}`);
})();

// ── Test (c): ETF → no calcula ──
(() => {
  const result = makeResult({ esETF: true, sector: "Technology" });
  const res = calcularVentajaCompetitivaCuantitativa(result, null, null, null);
  assert(res.senales.length === 0, `[c] ETF debe tener 0 señales, tiene ${res.senales.length}`);
  assert(res.senalesEvaluadas === 0, `[c] ETF senalesEvaluadas debe ser 0`);
  assert(res.conclusion === "Evidencia insuficiente", `[c] ETF conclusión insuficiente, es ${res.conclusion}`);
})();

// ── Test (d): historico con menos de 3 períodos → Señal 2 tendencia no_disponible ──
(() => {
  const result = makeResult();
  const peers = [makePeer("PEER1", 5, 3), makePeer("PEER2", 3, 1), makePeer("PEER3", 8, 5)];
  const conclusion = makeConclusion({
    fortalezas: ["crecimiento de ingresos: Líder del sector (percentil ~80)."],
    debilidades: [],
  });
  const historico = [
    makePeriodo({ label: "FY2024", endDate: "2024-12-31", netMargin: 0.20, revenueChgPct: 0.15 }),
  ];

  const res = calcularVentajaCompetitivaCuantitativa(result, { peers, sector: "Technology", industria: "Software" }, conclusion, historico);

  // Señal 1 tendencia no disponible por pocos periodos → debe caer en el else branch de banda sin tendencia
  const senal1 = res.senales[0];
  assert(senal1.nombre === "Premium de margen", `[d] Señal 1 existe`);
  // Con banda buena y <3 periodos: tirada a mixta
  assert(senal1.fuerza === "mixta" || senal1.fuerza === "no_disponible", `[d] Señal 1 debe ser mixta o no_disponible con <3 periodos, es ${senal1.fuerza}`);
})();

// ── Test (e): result.revisionEstimadosPct null → Señal 4 no_disponible ──
(() => {
  const result = makeResult({ revisionEstimadosPct: null });
  const peers = [makePeer("PEER1", 5, 3), makePeer("PEER2", 3, 1)];
  const conclusion = makeConclusion({
    fortalezas: ["margen neto: Líder del sector (percentil ~85)."],
    debilidades: [],
  });
  const historico = [
    makePeriodo({ label: "FY2022", endDate: "2022-12-31", netMargin: 0.18 }),
    makePeriodo({ label: "FY2023", endDate: "2023-12-31", netMargin: 0.19 }),
    makePeriodo({ label: "FY2024", endDate: "2024-12-31", netMargin: 0.20 }),
  ];

  const res = calcularVentajaCompetitivaCuantitativa(result, { peers, sector: "Technology", industria: "Software" }, conclusion, historico);

  const senal4 = res.senales[3];
  assert(senal4.nombre === "Momentum de revisiones", `[e] Señal 4 debe existir`);
  assert(senal4.fuerza === "no_disponible", `[e] Señal 4 debe ser no_disponible, es ${senal4.fuerza}`);
  assert(senal4.comparadoConSector === false, `[e] Señal 4 no debe compararse con sector si no hay dato propio`);
})();

// ── Results ──
console.log(`\nResultados:`);
console.log(`  Pasaron: ${passed}`);
console.log(`  Fallaron: ${failed.length}`);
if (failed.length > 0) {
  console.log(`\nFallos:`);
  for (const f of failed) console.log(`  ✗ ${f}`);
  process.exit(1);
} else {
  console.log(`  ✓ Todos los tests pasaron`);
}
