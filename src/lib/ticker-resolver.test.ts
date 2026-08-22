import { resolveDraftTicker } from "./ticker-resolver";

/**
 * Test cases for ticker resolution logic
 * Verify that all ticker types are resolved correctly
 */

const testCases = [
  // CEDEAR ARS cases
  {
    input: { symbol: "AAPL", moneda: "ARS" as const },
    expectedPrice: "AAPL.BA",
    expectedAnalysis: "AAPL",
    tipo: "cedear",
    description: "CEDEAR ARS (Apple)",
  },
  {
    input: { symbol: "CCJ", moneda: "ARS" as const },
    expectedPrice: "CCJ.BA",
    expectedAnalysis: "CCJ",
    tipo: "cedear",
    description: "CEDEAR ARS (Cameco) - was incorrectly treated as US before fix",
  },
  {
    input: { symbol: "MP", moneda: "ARS" as const },
    expectedPrice: "MP.BA",
    expectedAnalysis: "MP",
    tipo: "cedear",
    description: "CEDEAR ARS (MP Materials) - was incorrectly treated as US before fix",
  },
  {
    input: { symbol: "MSFT", moneda: "ARS" as const },
    expectedPrice: "MSFT.BA",
    expectedAnalysis: "MSFT",
    tipo: "cedear",
    description: "CEDEAR ARS (Microsoft)",
  },

  // CEDEAR USD cases
  {
    input: { symbol: "MSFTD", moneda: "USD" as const },
    expectedPrice: "MSFTD.BA",
    expectedAnalysis: "MSFT",
    tipo: "cedear",
    description: "CEDEAR USD (Microsoft) - price from BCBA MSFTD.BA, analysis from US MSFT",
  },
  {
    input: { symbol: "GLOBD", moneda: "USD" as const },
    expectedPrice: "GLOBD.BA",
    expectedAnalysis: "GLOB",
    tipo: "cedear",
    description: "CEDEAR USD (Globant) - price from BCBA GLOBD.BA, analysis from US GLOB",
  },

  // BCBA Acciones ARS cases
  {
    input: { symbol: "GGAL.BA", moneda: "ARS" as const },
    expectedPrice: "GGAL.BA",
    expectedAnalysis: "GGAL.BA",
    tipo: "accion",
    description: "BCBA Stock ARS (Grupo Galicia) - no ADR lookup",
  },
  {
    input: { symbol: "PAMP.BA", moneda: "ARS" as const },
    expectedPrice: "PAMP.BA",
    expectedAnalysis: "PAMP.BA",
    tipo: "accion",
    description: "BCBA Stock ARS (Pampa Energía)",
  },
  {
    input: { symbol: "YPFD.BA", moneda: "ARS" as const },
    expectedPrice: "YPFD.BA",
    expectedAnalysis: "YPFD.BA",
    tipo: "accion",
    description: "BCBA Stock ARS (YPF)",
  },

  // BCBA Acciones USD (ADR lookup)
  {
    input: { symbol: "GGAL", moneda: "USD" as const },
    expectedPrice: "GGAL",
    expectedAnalysis: "GGAL",
    tipo: "accion",
    description: "BCBA Stock analyzed as USD (ADR) - GGAL trades on NASDAQ",
  },
  {
    input: { symbol: "PAMP", moneda: "USD" as const },
    expectedPrice: "PAM",
    expectedAnalysis: "PAM",
    tipo: "accion",
    description: "BCBA Stock analyzed as USD (ADR) - PAMP.BA → PAM NYSE",
  },
  {
    input: { symbol: "YPFD", moneda: "USD" as const },
    expectedPrice: "YPF",
    expectedAnalysis: "YPF",
    tipo: "accion",
    description: "BCBA Stock analyzed as USD (ADR) - YPFD.BA → YPF NYSE",
  },

  // US Stocks USD
  {
    input: { symbol: "AAPL", moneda: "USD" as const },
    expectedPrice: "AAPL",
    expectedAnalysis: "AAPL",
    tipo: null,
    description: "US Stock (Apple) - direct US ticker",
  },
  {
    input: { symbol: "MSFT", moneda: "USD" as const },
    expectedPrice: "MSFT",
    expectedAnalysis: "MSFT",
    tipo: null,
    description: "US Stock (Microsoft) - direct US ticker",
  },
  {
    input: { symbol: "NVDA", moneda: "USD" as const },
    expectedPrice: "NVDA",
    expectedAnalysis: "NVDA",
    tipo: null,
    description: "US Stock (NVIDIA)",
  },
];

console.log("Running ticker resolver tests...\n");

let passed = 0;
let failed = 0;

testCases.forEach((tc) => {
  const result = resolveDraftTicker(tc.input.symbol, tc.input.moneda);
  const priceMatch = result.priceSymbol === tc.expectedPrice;
  const analysisMatch = result.analysisSymbol === tc.expectedAnalysis;
  const tipoMatch = result.tipo === tc.tipo;

  const success = priceMatch && analysisMatch && tipoMatch;

  if (success) {
    passed++;
    console.log(`✓ PASS: ${tc.description}`);
    console.log(
      `  Input: ${tc.input.symbol} (${tc.input.moneda}) → Price: ${result.priceSymbol}, Analysis: ${result.analysisSymbol}\n`,
    );
  } else {
    failed++;
    console.log(`✗ FAIL: ${tc.description}`);
    console.log(`  Input: ${tc.input.symbol} (${tc.input.moneda})`);
    console.log(`  Expected: Price=${tc.expectedPrice}, Analysis=${tc.expectedAnalysis}, Tipo=${tc.tipo}`);
    console.log(
      `  Got:      Price=${result.priceSymbol}, Analysis=${result.analysisSymbol}, Tipo=${result.tipo}\n`,
    );
  }
});

console.log(`\n=== Test Results ===`);
console.log(`Passed: ${passed}/${testCases.length}`);
console.log(`Failed: ${failed}/${testCases.length}`);
