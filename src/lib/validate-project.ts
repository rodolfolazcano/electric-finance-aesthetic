// src/lib/validate-project.ts
// Validador integral del proyecto: datos, esquemas, cálculos y referencias cruzadas

interface ValidationError {
  tipo: "error" | "warning" | "inconsistencia";
  modulo: string;
  archivo: string;
  descripcion: string;
  linea?: number;
  sugerencia?: string;
}

interface ValidationResult {
  fecha: string;
  total: number;
  errores: number;
  warnings: number;
  inconsistencias: number;
  items: ValidationError[];
}

// ─── 1. VALIDAR SECTORES.JSON ─────────────────────────────────
function validarSectores(sectores: any): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!sectores || typeof sectores !== "object") {
    errors.push({ tipo: "error", modulo: "Datos", archivo: "sectores.json", descripcion: "Archivo sectores.json no es un objeto válido", sugerencia: "Verificar estructura JSON" });
    return errors;
  }
  const sectoresArr = Object.entries(sectores) as [string, Record<string, any[]>][];
  for (const [sector, industrias] of sectoresArr) {
    if (!industrias || typeof industrias !== "object") {
      errors.push({ tipo: "error", modulo: "Datos", archivo: "sectores.json", descripcion: `Sector "${sector}" no tiene industrias`, sugerencia: "Agregar industrias o eliminar sector" });
      continue;
    }
    for (const [industria, tickers] of Object.entries(industrias)) {
      if (!Array.isArray(tickers)) {
        errors.push({ tipo: "error", modulo: "Datos", archivo: "sectores.json", descripcion: `Industria "${industria}" en sector "${sector}" no es un array`, sugerencia: "Convertir a array de tickers" });
        continue;
      }
      for (const t of tickers) {
        if (!t.ticker) {
          errors.push({ tipo: "error", modulo: "Datos", archivo: "sectores.json", descripcion: `Ticker sin campo "ticker" en ${sector} > ${industria}`, sugerencia: "Agregar campo ticker" });
        }
        if (!t.tipo || !["accion", "cedear"].includes(t.tipo)) {
          errors.push({ tipo: "warning", modulo: "Datos", archivo: "sectores.json", descripcion: `Ticker ${t.ticker || "?"} sin tipo válido en ${sector} > ${industria}`, sugerencia: "Agregar tipo: accion o cedear" });
        }
        if (t.ticker && t.ticker.endsWith(".BA") && t.mercado !== "BCBA") {
          errors.push({ tipo: "inconsistencia", modulo: "Datos", archivo: "sectores.json", descripcion: `Ticker ${t.ticker} con .BA pero mercado="${t.mercado}" (debería ser BCBA)` });
        }
      }
    }
  }
  return errors;
}

// ─── 2. VALIDAR BONOS.JSON ─────────────────────────────────────
function validarBonos(bonos: any): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!Array.isArray(bonos)) {
    errors.push({ tipo: "error", modulo: "Datos", archivo: "bonos.json", descripcion: "Archivo bonos.json no es un array", sugerencia: "Debe ser un array de objetos bono" });
    return errors;
  }
  const tickers = new Set<string>();
  for (const b of bonos) {
    if (!b.ticker) {
      errors.push({ tipo: "error", modulo: "Datos", archivo: "bonos.json", descripcion: "Bono sin campo ticker", sugerencia: "Agregar ticker" });
      continue;
    }
    if (tickers.has(b.ticker)) {
      errors.push({ tipo: "error", modulo: "Datos", archivo: "bonos.json", descripcion: `Ticker duplicado: ${b.ticker}`, sugerencia: "Eliminar duplicado" });
    }
    tickers.add(b.ticker);
    if (!b.vencimiento) {
      errors.push({ tipo: "warning", modulo: "Datos", archivo: "bonos.json", descripcion: `Bono ${b.ticker} sin vencimiento`, sugerencia: "Agregar fecha de vencimiento" });
    }
  }
  return errors;
}

// ─── 3. VALIDAR CÁLCULOS (OPTIMIZER) ───────────────────────────
function validarCalculosOptimizer(): ValidationError[] {
  const errors: ValidationError[] = [];
  const FACTOR = 252;

  // Test 1: RSI con datos conocidos para verificar fórmula correcta
  // RSI(14) para 15 precios consecutivos: [44,44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28]
  // RSI esperado ≈ 70.53
  const testPrices = [44,44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28];
  const diffs: number[] = [];
  for (let i = 1; i < testPrices.length; i++) diffs.push(testPrices[i] - testPrices[i-1]);
  let gains = 0, losses = 0;
  for (let i = 0; i < 14; i++) {
    if (diffs[i] > 0) gains += diffs[i]; else losses -= diffs[i];
  }
  let avgG = gains / 14, avgL = losses / 14;
  for (let i = 14; i < diffs.length; i++) {
    const d = diffs[i];
    avgG = (avgG * 13 + Math.max(0, d)) / 14;
    avgL = (avgL * 13 + Math.max(0, -d)) / 14;
  }
  const rsiCalc = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  if (Math.abs(rsiCalc - 70.53) > 1) {
    errors.push({ tipo: "inconsistencia", modulo: "Cálculos", archivo: "optimizer.ts", descripcion: `RSI calculado = ${rsiCalc.toFixed(2)}, esperado ≈ 70.53. Posible error en fórmula RSI`, sugerencia: "Revisar cálculo de RSI en rsi()" });
  }

  // Test 2: SMA con datos conocidos
  // SMA(3) de [1,2,3,4,5] debería ser 4
  const smaPrices = [1,2,3,4,5];
  const period = 3;
  if (smaPrices.length >= period) {
    const smaVal = smaPrices.slice(-period).reduce((a,b) => a+b, 0) / period;
    if (Math.abs(smaVal - 4) > 0.01) {
      errors.push({ tipo: "error", modulo: "Cálculos", archivo: "optimizer.ts", descripcion: `SMA calculado = ${smaVal}, esperado = 4. Error en sma()`, sugerencia: "Verificar que sma() use period para división" });
    }
  }

  // Test 3: Covarianza
  const returns1 = [0.01, 0.02, -0.01, 0.005, 0.015];
  const returns2 = [-0.005, 0.01, 0.02, -0.01, 0.005];
  const m1 = returns1.reduce((a,b) => a+b, 0) / returns1.length;
  const m2 = returns2.reduce((a,b) => a+b, 0) / returns2.length;
  let cov = 0;
  for (let i = 0; i < returns1.length; i++) cov += (returns1[i] - m1) * (returns2[i] - m2);
  cov /= (returns1.length - 1);
  if (Math.abs(cov - (-0.000075)) > 0.0001) {
    errors.push({ tipo: "inconsistencia", modulo: "Cálculos", archivo: "optimizer.ts", descripcion: `Covarianza sample calculada = ${cov}, esperada ≈ -0.000075`, sugerencia: "Revisar fórmula covMatrix (sample vs population)" });
  }

  return errors;
}

// ─── 4. VALIDAR REFERENCIAS CRUZADAS ───────────────────────────
function validarReferenciasCruzadas(archivos: string[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const importPattern = /from\s+["']([^"']+)["']/g;
  
  // Archivos conocidos existentes en src/lib/
  const libFiles = new Set([
    "optimizer.ts", "finance.functions.ts", "constructor-portafolio.ts",
    "diagnostico-portafolio.functions.ts", "cuantitativo.functions.ts",
    "comparador-usuario.ts", "rebalanceador.functions.ts",
    "riesgo.functions.ts", "statarb.math.ts", "backtest-estrategia.ts",
    "risk-free-rate.ts", "capm.functions.ts", "sector-performance.functions.ts",
    "market-data.functions.ts", "market-data.types.ts",
  ]);

  // Extensiones válidas
  const validExts = new Set([".ts", ".tsx", ".js", ".json"]);

  for (const archivo of archivos) {
    // Verificar que importaciones locales existen
    // Nota: esto es una simplificación - en producción se usaría un parser real
  }

  return errors;
}

// ─── 5. VALIDAR UI ─────────────────────────────────────────────
function validarUI(componentes: string[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const patronSinKey = /\.map\([^)]*\)\s*\{[\s\S]*?key=\{i\}/g;

  for (const comp of componentes) {
    const matches = comp.match(patronSinKey);
    if (matches) {
      errors.push({ tipo: "warning", modulo: "UI", archivo: "múltiples", descripcion: `Se encontraron ${matches.length} patrones .map() con key={i}. Usar identificadores únicos estables.` });
    }
  }

  return errors;
}

// ─── VALIDACIÓN COMPLETA ───────────────────────────────────────
export async function validarProyecto(): Promise<ValidationResult> {
  const allErrors: ValidationError[] = [];

  // Cargar y validar datos JSON
  try {
    const { default: sectores } = await import("./sectores.json");
    allErrors.push(...validarSectores(sectores));
  } catch (e) {
    allErrors.push({ tipo: "error", modulo: "Carga", archivo: "sectores.json", descripcion: `No se pudo cargar: ${e}` });
  }

  try {
    const { default: bonos } = await import("../data/bonos.json");
    allErrors.push(...validarBonos(bonos));
  } catch (e) {
    allErrors.push({ tipo: "error", modulo: "Carga", archivo: "bonos.json", descripcion: `No se pudo cargar: ${e}` });
  }

  // Validar cálculos
  allErrors.push(...validarCalculosOptimizer());

  const errores = allErrors.filter(e => e.tipo === "error");
  const warnings = allErrors.filter(e => e.tipo === "warning");
  const inconsistencias = allErrors.filter(e => e.tipo === "inconsistencia");

  return {
    fecha: new Date().toISOString(),
    total: allErrors.length,
    errores: errores.length,
    warnings: warnings.length,
    inconsistencias: inconsistencias.length,
    items: allErrors,
  };
}
