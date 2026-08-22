import type { FundamentalAFResult, PeriodoHistoricoRow } from "./fundamental-af.functions";
import { calcularGobiernoCorporativoCualitativo } from "./gobierno-corporativo-cualitativo.functions";

function makeResult(overrides: Partial<FundamentalAFResult> = {}): FundamentalAFResult {
  return {
    symbol: "TEST", companyName: "Test Corp", sector: "Technology", industry: "Software",
    country: "US", pegImpliedGrowthRate: null, currentPrice: 100, marketCapM: 50000,
    trailingPE: 25, forwardPE: 22, pegRatio: 1.5, priceToBook: 3, evToEbitda: 12,
    returnOnEquity: 0.18, returnOnAssets: 0.08, profitMargin: 0.20, operatingMargin: 0.25,
    grossMargin: 0.55, revenueGrowth: 0.15, earningsGrowth: 0.12, debtToEquityRaw: 60,
    currentRatio: 1.8, quickRatio: 1.2, freeCashflowM: 5000, fcfYield: 0.05, dividendYield: 0.01,
    payoutRatio: 0.25, targetMeanPrice: 120, targetLowPrice: 100, targetHighPrice: 140,
    recommendationMean: 2, numberOfAnalystOpinions: 12, upsidePct: 20, beta: 1.2,
    betaAnomalo: false, betaPropio: 1.15, betaR2: 0.75, betaBenchmarkUsado: "SPY",
    betaAdvertencia: null, revisionEstimadosPct: null, revisionEstimadosDetalle: null,
    insiderNetActivityPct: null, insiderNetActivityInterpretacion: null, secFilings: [],
    benchmarkPrice: null, benchmarkMarketCapM: null, benchmarkBeta: null, benchmarkName: null,
    sharesOutstanding: 500000000, min10y: null, max10y: null, avg10y: null, pricePercentile10y: null,
    peHistory: [], pePercentile: null, pegPercentile: null, fundScore: 72, fundScoreRaw: 72,
    fundScoreAbsolute: 72, dataCoverage: 0.875, metricsAvailable: 7, metricsTotal: 7, rawPts: 72,
    maxPts: 100, scoreDetails: [], healthScoreHistory: [], plazo: "", accion: "", error: null,
    totalAssets: null, totalLiabilities: null, totalStockholderEquity: null,
    totalCurrentAssets: null, totalCurrentLiabilities: null, cashAndEquivalents: null,
    totalDebtBalance: null, workingCapital: null, currentRatioCheck: null, currentRatioWarning: null,
    totalCashFromOperatingActivities: null, capitalExpenditures: null, dividendsPaid: null,
    fcfCalculadoManual: null, fcfWarning: null, incomeBeforeTax: null, incomeTaxExpense: null,
    ebit: null, interestExpense: null, effectiveTaxRate: null, interestCoverageRatio: null,
    totalRevenue: null, researchDevelopment: null, rdToRevenuePct: null, netIncomeFromIS: 12000,
    netReceivables: null, inventory: null, accountsPayable: null, costOfRevenue: null,
    retainedEarnings: null, dilutedAverageShares: 490000000, trailingEps: 4, freeCashflowRaw: null,
    _riesgoPaisPct: 0, insidersPercentHeld: null, institutionsPercentHeld: null,
    insiderTransactions: [], ratingChanges: [], companyOfficers: [
      { nombre: "Jane Doe", cargo: "Chief Executive Officer", edad: 52, compensacionAnual: 15000000 },
    ],
    governanceRiskScores: { auditRisk: 2, boardRisk: 3, compensationRisk: 4, shareHolderRightsRisk: 2, overallRisk: 3 },
    governanceRiskLabel: null, governanceEpochDate: null, longBusinessSummary: null,
    quoteType: "EQUITY", esETF: false, ...overrides,
  };
}

let passed = 0; let failed: string[] = [];
function assert(condition: boolean, msg: string) { if (condition) passed++; else failed.push(msg); }

// Test (a): governance completo + sin dilución (buyback) → "Favorable"
(() => {
  // dilutedAverageShares > sharesOutstanding → buyback (variación negativa)
  const res = calcularGobiernoCorporativoCualitativo(
    makeResult({ dilutedAverageShares: 510000000 }),
    null,
  );
  assert(res.riesgoISS.fuerza === "positiva", `[a] riesgoISS positiva, es ${res.riesgoISS.fuerza}`);
  assert(res.dilucionVsValor.fuerza === "positiva", `[a] dilucionVsValor positiva, es ${res.dilucionVsValor.fuerza}`);
  assert(res.compensacionVsPerformance.fuerza !== "no_disponible", `[a] compensacion disponible`);
  assert(res.conclusion === "Favorable", `[a] conclusion Favorable, es ${res.conclusion}`);
})();

// Test (b): governanceRiskScores null → riesgoISS no_disponible
(() => {
  const res = calcularGobiernoCorporativoCualitativo(
    makeResult({ governanceRiskScores: { auditRisk: null, boardRisk: null, compensationRisk: null, shareHolderRightsRisk: null, overallRisk: null } }),
    null,
  );
  assert(res.riesgoISS.fuerza === "no_disponible", `[b] riesgoISS no_disponible, es ${res.riesgoISS.fuerza}`);
})();

// Test (c): dilución alta sin creación de valor → dilucionVsValor negativa
(() => {
  const res = calcularGobiernoCorporativoCualitativo(
    makeResult({ dilutedAverageShares: 400000000, returnOnEquity: 0.02, netIncomeFromIS: -500 }),
    null,
  );
  assert(res.dilucionVsValor.fuerza === "negativa", `[c] dilucionVsValor negativa, es ${res.dilucionVsValor.fuerza}`);
})();

// Test (d): esETF
(() => {
  const res = calcularGobiernoCorporativoCualitativo(makeResult({ esETF: true }), null);
  assert(res.riesgoISS.fuerza === "no_disponible", `[d] ETF`);
  assert(res.conclusion === "Evidencia insuficiente", `[d] ETF conclusion`);
})();

console.log(`\nGobierno Corporativo:`);
console.log(`  Pasaron: ${passed}`);
console.log(`  Fallaron: ${failed.length}`);
if (failed.length > 0) { for (const f of failed) console.log(`  ✗ ${f}`); process.exit(1); }
else console.log(`  ✓ Todos los tests pasaron`);
