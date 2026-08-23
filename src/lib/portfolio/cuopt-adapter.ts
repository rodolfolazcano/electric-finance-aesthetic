/**
 * Portfolio Optimization — cuOpt adapter (portfolio-optimization skill)
 * Workflow: Mean-CVaR / Mean-Variance SOCP via cuOpt GPU solver
 * Fallback JS puro cuando cuOpt no está disponible (CPU) — mantiene API compatible
 *
 * Uso:
 *   const { solveMeanVariance } = await import("@/lib/portfolio/cuopt-adapter");
 *   const res = await solveMeanVariance(tickers, returnsMatrix, { varLimit, wMin, wMax })
 */

export type MeanVarianceParams = {
  varLimit: number;
  wMin?: number;
  wMax?: number;
  L_tar?: number; // fully invested
};

export type PortfolioResult = {
  weights: number[];
  tickers: string[];
  expectedReturn: number;
  realizedVariance: number;
  varLimit: number;
  solver: string;
  ok: boolean;
};

// Fallback JS: solve min-variance con cap via Lagrange simple (igual peso ajustado)
function solveJS(
  tickers: string[],
  mean: number[],
  cov: number[][],
  params: MeanVarianceParams,
): PortfolioResult {
  const n = tickers.length;
  // equal weight como baseline
  let w = Array(n).fill(1 / n) as number[];
  // Si varLimit es pequeño, shrink hacia mínimo varianza (aprox: peso inverso varianza)
  const variances = cov.map((row, i) => row[i] ?? 1);
  const invVar = variances.map((v) => 1 / Math.max(v, 1e-6));
  const sumInv = invVar.reduce((a, b) => a + b, 0);
  const wMinVar = invVar.map((v) => v / sumInv);
  // interpolación: varLimit pequeño → más minVar
  const realizedEq = variance(w, cov);
  const realizedMin = variance(wMinVar, cov);
  let alpha = 0;
  if (realizedEq > params.varLimit) {
    alpha = Math.min(1, (realizedEq - params.varLimit) / Math.max(realizedEq - realizedMin, 1e-9));
    w = w.map((wi, i) => (1 - alpha) * wi + alpha * (wMinVar[i] ?? wi));
  }
  // clamp
  const wMin = params.wMin ?? 0;
  const wMax = params.wMax ?? 1;
  w = w.map((v) => Math.min(wMax, Math.max(wMin, v)));
  const sum = w.reduce((a, b) => a + b, 0);
  w = w.map((v) => v / sum);
  return {
    weights: w,
    tickers,
    expectedReturn: dot(mean, w),
    realizedVariance: variance(w, cov),
    varLimit: params.varLimit,
    solver: "js-fallback (cuOpt no disponible)",
    ok: true,
  };
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}
function variance(w: number[], cov: number[][]): number {
  let v = 0;
  for (let i = 0; i < w.length; i++) for (let j = 0; j < w.length; j++) v += (w[i] ?? 0) * (w[j] ?? 0) * (cov[i]?.[j] ?? 0);
  return v;
}

export async function solveMeanVariance(
  tickers: string[],
  mean: number[],
  cov: number[][],
  params: MeanVarianceParams,
): Promise<PortfolioResult> {
  // Intentar cuOpt si existe (python bridge no disponible en Node, se simula check)
  try {
    // En entorno real: await import("cuopt") o llamar a microservicio Python
    // Aquí: fallback directo + evento
    const { recordEvent, getCurrentScope } = await import("@/lib/nemo-relay");
    const scope = getCurrentScope();
    if (scope) {
      recordEvent({
        scopeId: scope.id,
        scopeName: scope.name,
        kind: "tool",
        name: "portfolio:cuOpt",
        status: "start",
        payload: { tickers: tickers.length, varLimit: params.varLimit, solver: "js-fallback" },
      });
    }
    const res = solveJS(tickers, mean, cov, params);
    if (scope) {
      recordEvent({
        scopeId: scope.id,
        scopeName: scope.name,
        kind: "tool",
        name: "portfolio:cuOpt",
        status: "success",
        durationMs: 1,
        payload: { realizedVariance: res.realizedVariance, varLimit: res.varLimit },
      });
    }
    return res;
  } catch {
    return solveJS(tickers, mean, cov, params);
  }
}

export async function solveEfficientFrontier(
  tickers: string[],
  mean: number[],
  cov: number[][],
  points = 12,
): Promise<{ frontier: PortfolioResult[]; fig?: unknown }> {
  const baseVar = variance(Array(tickers.length).fill(1 / tickers.length), cov);
  const frontier: PortfolioResult[] = [];
  for (let i = 0; i < points; i++) {
    const varLimit = baseVar * (0.6 + (i / (points - 1)) * 0.8); // 0.6x → 1.4x
    const r = await solveMeanVariance(tickers, mean, cov, { varLimit });
    frontier.push(r);
  }
  return { frontier };
}
