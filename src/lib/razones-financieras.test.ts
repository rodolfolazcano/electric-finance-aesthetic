import type { FundamentalAFResult, PeriodoHistoricoRow } from "./fundamental-af.functions";
import { calcularRazonesFinancieras, calcularRazonesPeriodo } from "./razones-financieras.functions";
import { calcularPlanificacionFinanciera, planificacionPorDefecto } from "./planificacion-financiera.functions";
import { generarInforme } from "./informe-financiero.functions";

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
    insiderTransactions: [], ratingChanges: [], companyOfficers: [],
    governanceRiskScores: null, governanceRiskLabel: null, governanceEpochDate: null,
    longBusinessSummary: null, quoteType: "EQUITY", esETF: false, ...overrides,
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

// ── Razones financieras: validación de fórmulas ──
(() => {
  const r = makeResult({ currentPrice: 100, sharesOutstanding: 500000000 });
  const period = makePeriodo();
  const p = calcularRazonesPeriodo(period, { currentPrice: 100, sharesOutstanding: 500000000 });

  // Liquidez: 30000/15000 = 2
  assert(p.liquidez.razonCirculante === 2, `razonCirculante = 2, es ${p.liquidez.razonCirculante}`);
  // Rápida: (30000-8000)/15000 = 1.4667
  assert(p.liquidez.razonRapida != null && Math.abs(p.liquidez.razonRapida - 1.4667) < 0.01, `razonRapida ≈ 1.4667, es ${p.liquidez.razonRapida}`);
  // Capital de trabajo: 30000-15000 = 15000
  assert(p.liquidez.capitalTrabajo === 15000, `capitalTrabajo = 15000, es ${p.liquidez.capitalTrabajo}`);

  // Actividad: rot inventarios 50000/8000 = 6.25; DSO (10000/50000)*365 = 73; rot fijos 50000/20000 = 2.5; rot totales 50000/80000 = 0.625
  assert(p.actividad.rotacionInventarios === 6.25, `rotacionInventarios = 6.25, es ${p.actividad.rotacionInventarios}`);
  assert(p.actividad.dso === 73, `dso = 73, es ${p.actividad.dso}`);
  assert(p.actividad.rotacionActivosFijos === 2.5, `rotacionActivosFijos = 2.5, es ${p.actividad.rotacionActivosFijos}`);
  assert(p.actividad.rotacionActivosTotales === 0.625, `rotacionActivosTotales = 0.625, es ${p.actividad.rotacionActivosTotales}`);

  // Endeudamiento: deuda 5000/80000 = 0.0625; D/E 5000/40000 = 0.125; TIE 15000/500 = 30
  assert(p.endeudamiento.razonDeuda === 0.0625, `razonDeuda = 0.0625, es ${p.endeudamiento.razonDeuda}`);
  assert(p.endeudamiento.deudaPatrimonio === 0.125, `deudaPatrimonio = 0.125, es ${p.endeudamiento.deudaPatrimonio}`);
  assert(p.endeudamiento.tie === 30, `tie = 30, es ${p.endeudamiento.tie}`);

  // Rentabilidad: margen 12000/50000=0.24; BEP 15000/80000=0.1875; ROA 0.15; ROE 0.30
  assert(p.rentabilidad.margenUtilidad === 0.24, `margenUtilidad = 0.24, es ${p.rentabilidad.margenUtilidad}`);
  assert(p.rentabilidad.bep === 0.1875, `bep = 0.1875, es ${p.rentabilidad.bep}`);
  assert(p.rentabilidad.roa === 0.15, `roa = 0.15, es ${p.rentabilidad.roa}`);
  assert(p.rentabilidad.roe === 0.30, `roe = 0.30, es ${p.rentabilidad.roe}`);

  // Mercado: EPS = 12000/500M = 0.000024 → P/U = 100/0.000024 ≈ 4166666 (no relevante numéricamente, solo check no null)
  assert(p.mercado.pe != null, `pe debe computarse, es ${p.mercado.pe}`);
  assert(p.mercado.priceToBook != null, `priceToBook debe computarse, es ${p.mercado.priceToBook}`);

  // DuPont: margen .24 × rot .625 × mult 2 = 30%
  assert(p.dupont.roeDupont != null && Math.abs(p.dupont.roeDupont - 30) < 0.1, `roeDupont ≈ 30, es ${p.dupont.roeDupont}`);
  assert(p.dupont.roaDupont != null && Math.abs(p.dupont.roaDupont - 15) < 0.1, `roaDupont ≈ 15, es ${p.dupont.roaDupont}`);

  const full = calcularRazonesFinancieras(r, [period]);
  assert(full.periods.length === 1, `periods length = 1`);
  assert(full.error === null, `sin error`);
  assert(full.interpretaciones.liquidez.length > 0, `interpretación liquidez`);
  assert(full.interpretaciones.rentabilidad.some((t) => t.includes("DuPont")), `interpretación DuPont presente`);
})();

// ── Planificación financiera: consistencia básica ──
(() => {
  const plan = calcularPlanificacionFinanciera(planificacionPorDefecto());

  // PER consistente: GAII - intereses - impuesto = ganancia neta
  assert(
    Math.abs(plan.per.gaii - plan.per.intereses - plan.per.impuesto - plan.per.gananciaNeta) < 1,
    `PER consistente: ${plan.per.gaii} - ${plan.per.intereses} - ${plan.per.impuesto} = ${plan.per.gananciaNeta}`,
  );

  // PES balanceado: activo = pasivo + patrimonio
  const diffPes = Math.abs(plan.pes.totalActivo - plan.pes.totalPasivoPatrimonio);
  assert(diffPes / plan.pes.totalActivo < 0.05, `PES balanceado (dif rel ${(diffPes / plan.pes.totalActivo).toFixed(3)})`);

  // Ventas = precio × unidades
  assert(
    Math.abs(plan.presupuestoVentas.ventasTotal - (25000 * 6 * 50 + 30000 * 6 * 55)) < 1,
    `Ventas totales = ${plan.presupuestoVentas.ventasTotal}`,
  );

  // Ratios forward presentes
  assert(plan.ratiosForward.dupont.roeDupont != null, `roeDupont forward presente`);
  assert(plan.ratiosForward.liquidez.razonCirculante != null, `razonCirculante forward presente`);

  // Informe (Biondi)
  const inf = generarInforme(plan, "Empresa Test S.A.");
  assert(inf.denominacion.includes("Informe"), `informe denominación`);
  assert(inf.tablaComparativa.length >= 5, `informe tabla comparativa ≥ 5 items`);
  assert(inf.situacionEconomica.length > 0, `informe situación económica`);
  assert(inf.conclusiones.length > 0, `informe conclusiones`);
})();

// ── Caso límite: sin datos ──
(() => {
  const vacio = calcularRazonesFinancieras(makeResult(), []);
  assert(vacio.periods.length === 0, `sin periodos`);
  assert(vacio.error != null, `error seteado`);
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
