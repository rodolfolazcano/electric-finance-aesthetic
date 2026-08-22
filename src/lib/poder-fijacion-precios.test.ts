import type { FundamentalAFResult, PeriodoHistoricoRow } from "./fundamental-af.functions";
import { calcularPoderFijacionPrecios } from "./poder-fijacion-precios.functions";

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
    betaAnomalo: false, betaPropio: null, betaR2: null, betaBenchmarkUsado: null,
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
    totalRevenue: null, researchDevelopment: null, rdToRevenuePct: null, netIncomeFromIS: null,
    netReceivables: null, inventory: null, accountsPayable: null, costOfRevenue: null,
    retainedEarnings: null, dilutedAverageShares: null, trailingEps: null, freeCashflowRaw: null,
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

// Test (a): revenueChgPct > cost growth en 3+ períodos → "Alto"
(() => {
  // grossMargin improving → costOfRevenue growing slower than revenue
  const historico = [
    makePeriodo({ label: "FY2021", endDate: "2021-12-31", revenue: 40000, revenueChgPct: 0.20, grossMargin: 0.50 }),
    makePeriodo({ label: "FY2022", endDate: "2022-12-31", revenue: 48000, revenueChgPct: 0.20, grossMargin: 0.55 }), // margin up → cost grows slower
    makePeriodo({ label: "FY2023", endDate: "2023-12-31", revenue: 57000, revenueChgPct: 0.19, grossMargin: 0.58 }),
    makePeriodo({ label: "FY2024", endDate: "2024-12-31", revenue: 68000, revenueChgPct: 0.19, grossMargin: 0.60 }),
  ];
  const res = calcularPoderFijacionPrecios(makeResult(), historico);
  assert(res.conclusion === "Alto", `[a] conclusion Alto, es ${res.conclusion}`);
})();

// Test (b): <3 periodos → crecimientoIngresosVsCosto "no_disponible"
(() => {
  const historico = [
    makePeriodo({ label: "FY2023", endDate: "2023-12-31", revenue: 50000, revenueChgPct: 0.10, grossMargin: 0.55 }),
    makePeriodo({ label: "FY2024", endDate: "2024-12-31", revenue: 55000, revenueChgPct: 0.10, grossMargin: 0.55 }),
  ];
  const res = calcularPoderFijacionPrecios(makeResult(), historico);
  assert(res.crecimientoIngresosVsCosto.fuerza === "no_disponible", `[b] costo no_disponible, es ${res.crecimientoIngresosVsCosto.fuerza}`);
})();

// Test (c): costo creciendo más rápido que ingresos → "Bajo"
(() => {
  // grossMargin compressing → costOfRevenue growing faster
  const historico = [
    makePeriodo({ label: "FY2021", endDate: "2021-12-31", revenue: 40000, revenueChgPct: 0.20, grossMargin: 0.55 }),
    makePeriodo({ label: "FY2022", endDate: "2022-12-31", revenue: 48000, revenueChgPct: 0.20, grossMargin: 0.50 }), // margin down
    makePeriodo({ label: "FY2023", endDate: "2023-12-31", revenue: 55000, revenueChgPct: 0.15, grossMargin: 0.48 }),
    makePeriodo({ label: "FY2024", endDate: "2024-12-31", revenue: 62000, revenueChgPct: 0.13, grossMargin: 0.45 }),
  ];
  const res = calcularPoderFijacionPrecios(makeResult(), historico);
  assert(res.conclusion === "Bajo" || res.conclusion === "Moderado", `[c] Bajo o Moderado, es ${res.conclusion}`);
})();

// Test (d): esETF
(() => {
  const res = calcularPoderFijacionPrecios(makeResult({ esETF: true }), null);
  assert(res.resilienciaMargen.fuerza === "no_disponible", `[d] ETF`);
  assert(res.conclusion === "No concluyente", `[d] ETF conclusion`);
})();

console.log(`\nPoder Fijación Precios:`);
console.log(`  Pasaron: ${passed}`);
console.log(`  Fallaron: ${failed.length}`);
if (failed.length > 0) { for (const f of failed) console.log(`  ✗ ${f}`); process.exit(1); }
else console.log(`  ✓ Todos los tests pasaron`);
