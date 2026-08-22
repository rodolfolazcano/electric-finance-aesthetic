import type { FundamentalAFResult, PeriodoHistoricoRow } from "./fundamental-af.functions";
import type { ConclusionSectorialInteligente } from "./interpretacion-sectorial.functions";
import { calcularAnalisisCualitativoSemiAutomatico } from "./analisis-cualitativo-semiautomatico.functions";

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
    betaAdvertencia: null, revisionEstimadosPct: 8, revisionEstimadosDetalle: null,
    insiderNetActivityPct: 5, insiderNetActivityInterpretacion: null, secFilings: [],
    benchmarkPrice: 500, benchmarkMarketCapM: 400000, benchmarkBeta: 1, benchmarkName: "SPY",
    sharesOutstanding: 500000000, min10y: 40, max10y: 150, avg10y: 90, pricePercentile10y: 60,
    peHistory: [], pePercentile: 50, pegPercentile: null, fundScore: 72, fundScoreRaw: 72,
    fundScoreAbsolute: 72, dataCoverage: 0.875, metricsAvailable: 7, metricsTotal: 7, rawPts: 72,
    maxPts: 100, scoreDetails: [], healthScoreHistory: [], plazo: "", accion: "", error: null,
    totalAssets: 80000, totalLiabilities: 40000, totalStockholderEquity: 40000,
    totalCurrentAssets: 30000, totalCurrentLiabilities: 15000, cashAndEquivalents: 10000,
    totalDebtBalance: 5000, workingCapital: 15000, currentRatioCheck: 2, currentRatioWarning: null,
    totalCashFromOperatingActivities: 12000, capitalExpenditures: 3000, dividendsPaid: 1000,
    fcfCalculadoManual: 9000, fcfWarning: null, incomeBeforeTax: 15000, incomeTaxExpense: 3000,
    ebit: 15000, interestExpense: 500, effectiveTaxRate: 20, interestCoverageRatio: 30,
    totalRevenue: 50000, researchDevelopment: 5000, rdToRevenuePct: 10, netIncomeFromIS: 12000,
    netReceivables: null, inventory: null, accountsPayable: null, costOfRevenue: null,
    retainedEarnings: null, dilutedAverageShares: 490000000, trailingEps: 4, freeCashflowRaw: 8000,
    _riesgoPaisPct: 0, insidersPercentHeld: null, institutionsPercentHeld: null,
    insiderTransactions: [], ratingChanges: [], companyOfficers: [
      { nombre: "Jane Doe", cargo: "Chief Executive Officer", edad: 52, compensacionAnual: 15000000 },
    ],
    governanceRiskScores: { auditRisk: 2, boardRisk: 3, compensationRisk: 4, shareHolderRightsRisk: 2, overallRisk: 3 },
    governanceRiskLabel: null, governanceEpochDate: null, longBusinessSummary: null,
    quoteType: "EQUITY", esETF: false, ...overrides,
  };
}

function makePeer(ticker: string, rd: number | null, rev: number | null): FundamentalAFResult {
  return { ...makeResult({ symbol: ticker, rdToRevenuePct: rd, revisionEstimadosPct: rev, revenueGrowth: 0.1, profitMargin: 0.15 }) };
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

// Test: esETF → todos los sub-resultados null
(() => {
  const res = calcularAnalisisCualitativoSemiAutomatico(
    makeResult({ esETF: true }), null, null, null,
  );
  assert(res.esETF === true, `ETF esETF flag`);
  assert(res.ventajaCompetitiva === null, `ETF ventajaCompetitiva null`);
  assert(res.costosDeCambio === null, `ETF costosDeCambio null`);
  assert(res.gobiernoCorporativo === null, `ETF gobiernoCorporativo null`);
  assert(res.predictibilidadIngresos === null, `ETF predictibilidad null`);
  assert(res.poderFijacionPrecios === null, `ETF poderFijacion null`);
})();

// Test: datos completos → todos los sub-resultados presentes
(() => {
  const peers = [makePeer("PEER1", 5, 3), makePeer("PEER2", 3, 1), makePeer("PEER3", 8, 5)];
  const conclusion: ConclusionSectorialInteligente = {
    resumenEjecutivo: "Test",
    fortalezas: ["margen neto: Líder del sector (percentil ~85).", "crecimiento de ingresos: Líder del sector (percentil ~80)."],
    debilidades: [],
    mejorAlternativaSector: null,
    advertencias: [],
  };
  const historico = [
    makePeriodo({ label: "FY2021", endDate: "2021-12-31", netMargin: 0.15, revenueChgPct: 0.08 }),
    makePeriodo({ label: "FY2022", endDate: "2022-12-31", netMargin: 0.17, revenueChgPct: 0.10 }),
    makePeriodo({ label: "FY2023", endDate: "2023-12-31", netMargin: 0.19, revenueChgPct: 0.12 }),
    makePeriodo({ label: "FY2024", endDate: "2024-12-31", netMargin: 0.20, revenueChgPct: 0.15 }),
  ];
  const res = calcularAnalisisCualitativoSemiAutomatico(
    makeResult(),
    { peers, sector: "Technology", industria: "Software" },
    conclusion,
    historico,
  );
  assert(res.esETF === false, `completo esETF flag`);
  assert(res.ventajaCompetitiva !== null, `completo ventajaCompetitiva no null`);
  assert(res.costosDeCambio !== null, `completo costosDeCambio no null`);
  assert(res.gobiernoCorporativo !== null, `completo gobiernoCorporativo no null`);
  assert(res.predictibilidadIngresos !== null, `completo predictibilidad no null`);
  assert(res.poderFijacionPrecios !== null, `completo poderFijacion no null`);
  assert(res.ventajaCompetitiva!.senales.length === 4, `completo 4 señales VC, tiene ${res.ventajaCompetitiva!.senales.length}`);
})();

console.log(`\nOrquestador (integración):`);
console.log(`  Pasaron: ${passed}`);
console.log(`  Fallaron: ${failed.length}`);
if (failed.length > 0) { for (const f of failed) console.log(`  ✗ ${f}`); process.exit(1); }
else console.log(`  ✓ Todos los tests pasaron`);
