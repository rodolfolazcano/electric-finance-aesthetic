import type { FundamentalAFResult, PeriodoHistoricoRow } from "./fundamental-af.functions";
import { calcularCostosDeCambio } from "./costos-de-cambio.functions";

function makeResult(overrides: Partial<FundamentalAFResult> = {}): FundamentalAFResult {
  return {
    symbol: "TEST", companyName: "Test Corp", sector: "Tecnología", industry: "Software",
    country: "US", pegImpliedGrowthRate: null, currentPrice: 100, marketCapM: 50000,
    trailingPE: 25, forwardPE: 22, pegRatio: 1.5, priceToBook: 3, evToEbitda: 12,
    returnOnEquity: 0.18, returnOnAssets: 0.08, profitMargin: 0.20, operatingMargin: 0.25,
    grossMargin: 0.55, revenueGrowth: 0.15, earningsGrowth: 0.12, debtToEquityRaw: 60,
    currentRatio: 1.8, quickRatio: 1.2, freeCashflowM: 5000, fcfYield: 0.05, dividendYield: 0.01,
    payoutRatio: 0.25, targetMeanPrice: 120, targetLowPrice: 100, targetHighPrice: 140,
    recommendationMean: 2, numberOfAnalystOpinions: 12, upsidePct: 20, beta: 1.2,
    betaAnomalo: false, betaPropio: 1.15, betaR2: 0.75, betaBenchmarkUsado: "SPY",
    betaAdvertencia: null, revisionEstimadosPct: 8, revisionEstimadosDetalle: null,
    insiderNetActivityPct: 5, insiderNetActivityInterpretacion: null, secFilings: [],
    benchmarkPrice: 500, benchmarkMarketCapM: 400000, benchmarkBeta: 1, benchmarkName: "SPY",
    sharesOutstanding: 500000000, min10y: 40, max10y: 150, avg10y: 90, pricePercentile10y: 60,
    peHistory: [], pePercentile: 50, pegPercentile: null, fundScore: 72, fundScoreRaw: 72,
    fundScoreAbsolute: 72, dataCoverage: 0.875, metricsAvailable: 7, metricsTotal: 7, rawPts: 72,
    maxPts: 100, scoreDetails: [], healthScoreHistory: [], plazo: "Largo plazo", accion: "Acumular",
    error: null, totalAssets: 80000, totalLiabilities: 40000, totalStockholderEquity: 40000,
    totalCurrentAssets: 30000, totalCurrentLiabilities: 15000, cashAndEquivalents: 10000,
    totalDebtBalance: 5000, workingCapital: 15000, currentRatioCheck: 2, currentRatioWarning: null,
    totalCashFromOperatingActivities: 12000, capitalExpenditures: 3000, dividendsPaid: 1000,
    fcfCalculadoManual: 9000, fcfWarning: null, incomeBeforeTax: 15000, incomeTaxExpense: 3000,
    ebit: 15000, interestExpense: 500, effectiveTaxRate: 20, interestCoverageRatio: 30,
    totalRevenue: 50000, researchDevelopment: 5000, rdToRevenuePct: 10, netIncomeFromIS: 12000,
    netReceivables: null, inventory: null, accountsPayable: null, costOfRevenue: null,
    retainedEarnings: null, dilutedAverageShares: null, trailingEps: 4, freeCashflowRaw: 8000,
    _riesgoPaisPct: 0, insidersPercentHeld: null, institutionsPercentHeld: null,
    insiderTransactions: [], ratingChanges: [], companyOfficers: [],
    governanceRiskScores: { auditRisk: null, boardRisk: null, compensationRisk: null, shareHolderRightsRisk: null, overallRisk: null },
    governanceRiskLabel: null, governanceEpochDate: null, longBusinessSummary: null,
    quoteType: "EQUITY", esETF: false, ...overrides,
  };
}

function makePeriodo(overrides: Partial<PeriodoHistoricoRow> = {}): PeriodoHistoricoRow {
  return {
    label: "FY2024", endDate: "2024-12-31", revenue: 50000, revenuePrev: 45000,
    revenueChgPct: 0.11, netIncome: 12000, netIncomePrev: 10000, netIncomeChgPct: 0.20,
    eps: 4, epsPrev: 3.5, epsChgPct: 0.14, grossMargin: 0.55, operatingMargin: 0.25,
    netMargin: 0.20, ebit: 15000, interestExpense: 500, totalAssets: 80000,
    totalLiabilities: 40000, totalEquity: 40000, currentAssets: 30000,
    currentLiabilities: 15000, inventory: 8000, netReceivables: 10000,
    netFixedAssets: 20000, cash: 10000, totalDebt: 5000,
    cashFromOps: 12000, capex: 3000, fcf: 9000,
    earningsDate: "2025-01-30", ...overrides,
  };
}

let passed = 0; let failed: string[] = [];
function assert(condition: boolean, msg: string) { if (condition) passed++; else failed.push(msg); }

// ── Test (a): margen resiliente + baja volatilidad + sector "alto" → "Altos" ──
(() => {
  // 4 periods: revenue decelerates in periods 2-3 but grossMargin holds/increases
  const historico = [
    makePeriodo({ label: "FY2021", endDate: "2021-12-31", revenueChgPct: 0.20, grossMargin: 0.50 }),
    makePeriodo({ label: "FY2022", endDate: "2022-12-31", revenueChgPct: 0.12, grossMargin: 0.52 }), // decel, margin up
    makePeriodo({ label: "FY2023", endDate: "2023-12-31", revenueChgPct: 0.08, grossMargin: 0.53 }), // decel, margin up
    makePeriodo({ label: "FY2024", endDate: "2024-12-31", revenueChgPct: 0.15, grossMargin: 0.55 }),
  ];
  const res = calcularCostosDeCambio(makeResult({ sector: "Tecnología" }), historico);
  assert(res.resilienciaMargen.fuerza === "positiva", `[a] resiliencia positiva, es ${res.resilienciaMargen.fuerza}`);
  assert(res.estabilidadIngresos.fuerza === "positiva", `[a] estabilidad positiva, es ${res.estabilidadIngresos.fuerza}`);
  assert(res.clasificacionSectorEstatica.nivel === "alto", `[a] sector alto`);
  assert(res.conclusion === "Altos", `[a] conclusion Altos, es ${res.conclusion}`);
})();

// ── Test (b): <3 periodos → ambas señales "no_disponible", conclusion "No concluyente" ──
(() => {
  const historico = [
    makePeriodo({ label: "FY2023", endDate: "2023-12-31", revenueChgPct: 0.10 }),
    makePeriodo({ label: "FY2024", endDate: "2024-12-31", revenueChgPct: 0.15 }),
  ];
  const res = calcularCostosDeCambio(makeResult({ sector: "Tecnología" }), historico);
  assert(res.resilienciaMargen.fuerza === "no_disponible", `[b] resiliencia no_disponible`);
  assert(res.estabilidadIngresos.fuerza === "no_disponible", `[b] estabilidad no_disponible`);
  assert(res.conclusion === "No concluyente", `[b] conclusion No concluyente, es ${res.conclusion}`);
})();

// ── Test (c): sector no reconocido → clasificacionSectorEstatica.nivel "no_disponible" ──
(() => {
  const res = calcularCostosDeCambio(makeResult({ sector: "Conglomerates" }), null);
  assert(res.clasificacionSectorEstatica.nivel === "no_disponible", `[c] nivel no_disponible, es ${res.clasificacionSectorEstatica.nivel}`);
  assert(res.clasificacionSectorEstatica.sector === "Conglomerates", `[c] sector raw preservado`);
})();

// ── Test (d): esETF → no corre ──
(() => {
  const res = calcularCostosDeCambio(makeResult({ esETF: true }), null);
  assert(res.resilienciaMargen.fuerza === "no_disponible", `[d] ETF resiliencia no_disponible`);
  assert(res.estabilidadIngresos.fuerza === "no_disponible", `[d] ETF estabilidad no_disponible`);
  assert(res.conclusion === "No concluyente", `[d] ETF conclusion No concluyente`);
})();

console.log(`\nResultados:`);
console.log(`  Pasaron: ${passed}`);
console.log(`  Fallaron: ${failed.length}`);
if (failed.length > 0) { for (const f of failed) console.log(`  ✗ ${f}`); process.exit(1); }
else console.log(`  ✓ Todos los tests pasaron`);
