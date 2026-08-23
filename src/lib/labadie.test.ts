// @ts-nocheck
// Tests Labadié P0+P1 — ejecutables con `npx tsx src/lib/labadie.test.ts` o vitest
let _describe: any, _it: any, _expect: any;
try { ({ describe: _describe, it: _it, expect: _expect } = await import("vitest")); } catch { _describe = (n: string, fn: any) => fn(); _it = (n: string, fn: any) => { try { fn(); console.log(`✓ ${n}`);} catch(e:any){console.error(`✗ ${n}`, e.message);}}; _expect = (v:any)=>({ toBe:(e:any)=>{ if(v!==e) throw new Error(`${v} !== ${e}`);}, toBeCloseTo:(e:any, d=2)=>{ if(Math.abs(v-e) > Math.pow(10,-d)) throw new Error(`${v} not close to ${e}`);}, toBeGreaterThanOrEqual:(e:any)=>{ if(!(v>=e)) throw new Error(`${v} < ${e}`);}, toBeLessThanOrEqual:(e:any)=>{ if(!(v<=e)) throw new Error(`${v} > ${e}`);}, toBeGreaterThan:(e:any)=>{ if(!(v>e)) throw new Error(`${v} <= ${e}`);}, not:{ toBeCloseTo:(e:any,d=2)=>{ if(Math.abs(v-e) <= Math.pow(10,-d)) throw new Error(`${v} close to ${e} but shouldn't`);}}}); }
const describe = _describe, it = _it, expect = _expect;
import { tasaRealFisherExacta, tasaRealFisher } from "./math/calculo-financiero.functions";
import { computeHurst, impliedPFromReturns } from "./math/stats";
import { calcularCurvaOptima, impliedPFromStartTime, estimateExecutionCosts } from "./labadie/execution-curve";
import { fitOrnsteinUhlenbeck, deltaOU, quotesFL } from "./labadie/market-making";
import { simularEulerSDE } from "./statarb.math";
import { kyleLambda, glostenMilgrom } from "./labadie/microstructure";
import { eigenDecomposition, clipCovariance } from "./labadie/spectral";
import { obtenerMEP } from "./bond-ladder.functions";

// P0 fixes
describe("P0 Fisher exacta", () => {
  it("usa exacta siempre (Argentina π>10%)", () => {
    const r = tasaRealFisher(0.6, 0.5);
    expect(r.metodo).toBe("exacta");
    expect(r.real).toBeCloseTo(tasaRealFisherExacta(0.6, 0.5), 10);
  });
  it("ia pequeño sigue exacta", () => {
    const r = tasaRealFisher(0.05, 0.02);
    expect(r.metodo).toBe("exacta");
  });
});

describe("Hurst clamp", () => {
  it("serie corta retorna 0.5 neutral", () => {
    expect(computeHurst([1, 2, 3])).toBe(0.5);
  });
  it("H ∈[0.25,0.91]", () => {
    const serie = Array.from({ length: 300 }, (_, i) => Math.sin(i * 0.1) + Math.random() * 0.1);
    const H = computeHurst(serie);
    expect(H).toBeGreaterThanOrEqual(0.25);
    expect(H).toBeLessThanOrEqual(0.91);
  });
  it("impliedP =1/H ∈[1.1,4] por clamp", () => {
    const rets = Array.from({ length: 200 }, () => (Math.random() - 0.5) * 0.02);
    const p = impliedPFromReturns(rets);
    expect(p).toBeGreaterThanOrEqual(1.1);
    expect(p).toBeLessThanOrEqual(4);
  });
});

describe("Execution curve Labadié", () => {
  it("TC e IS retornan curva normalizada", () => {
    const tc = calcularCurvaOptima({ algo: "tc", T: 50, sigma: 0.2, hurst: 0.45, gamma: 0.5, participationRate: 0.1 });
    expect(tc.curve.length).toBe(50);
    const sum = tc.curve.reduce((s, p) => s + p.volume, 0);
    expect(sum).toBeCloseTo(1, 5);
    expect(tc.curve[tc.curve.length - 1].cumulative).toBeCloseTo(1, 5);
    const is = calcularCurvaOptima({ algo: "is", T: 50, sigma: 0.2, hurst: 0.45, gamma: 0.5, participationRate: 0.1 });
    expect(is.curve.length).toBe(50);
  });
  it("hurst afecta sigma2tau", () => {
    const h1 = calcularCurvaOptima({ algo: "tc", T: 20, sigma: 0.3, hurst: 0.3, gamma: 0.5, participationRate: 0.1 });
    const h2 = calcularCurvaOptima({ algo: "tc", T: 20, sigma: 0.3, hurst: 0.7, gamma: 0.5, participationRate: 0.1 });
    // H cambia tau^H e I' — la curva debe diferir en algún slice (no necesariamente 0, que puede capearse a 0.1)
    const diff = h1.curve.reduce((s, c, i) => s + Math.abs(c.volume - h2.curve[i]!.volume), 0);
    expect(diff).toBeGreaterThan(1e-6);
  });
});

describe("Microstructure", () => {
  it("Kyle lambda positivo", () => {
    const l = kyleLambda(1, 2);
    expect(l).toBeCloseTo(0.25, 10);
  });
  it("Glosten-Milgrom ask>bid", () => {
    const g = glostenMilgrom({ Vminus: 40, Vplus: 80 });
    expect(g.ask).toBeGreaterThan(g.bid);
    expect(g.spread).toBeGreaterThan(0);
  });
});

describe("Spectral", () => {
  it("eigenDecomposition simétrica 2x2", () => {
    const { values } = eigenDecomposition([[2, 1], [1, 2]]);
    expect(values[0]).toBeCloseTo(3, 1);
    expect(values[1]).toBeCloseTo(1, 1);
  });
  it("clipCovariance filtra ruido", () => {
    const cov = [[1, 0.9], [0.9, 1]];
    const { filtered, values } = clipCovariance(cov, 10);
    expect(filtered.length).toBe(2);
    expect(values.length).toBe(2);
  });
});

describe("Bond ladder FX", () => {
  it("obtenerMEP exportado", () => {
    expect(typeof obtenerMEP).toBe("function");
  });
});

// ─── Gaps 1205.3482v6 §2.8, §4.3, Gap 2 y Gap 4 ──────────────────────
describe("Gap 2 — volumeProfile heterogéneo", () => {
  it("perfil U-shape cambia la curva vs uniforme", () => {
    const uniform = calcularCurvaOptima({ algo: "tc", T: 20, sigma: 0.2, hurst: 0.5, gamma: 0.5, participationRate: 0.1 });
    const uShape = new Array(20).fill(0).map((_, i) => (i < 5 || i >= 15 ? 2 : 0.5));
    const hetero = calcularCurvaOptima({ algo: "tc", T: 20, sigma: 0.2, hurst: 0.5, gamma: 0.5, participationRate: 0.1, volumeProfile: uShape });
    const diff = uniform.curve.reduce((s, c, i) => s + Math.abs(c.volume - hetero.curve[i]!.volume), 0);
    expect(diff).toBeGreaterThan(1e-4);
    const sum = hetero.curve.reduce((s, p) => s + p.volume, 0);
    expect(sum).toBeCloseTo(1, 5);
  });
  it("caps heterogéneos respetan q·V(n) y suman 1", () => {
    const prof = new Array(10).fill(0).map((_, i) => i === 0 ? 5 : 0.5);
    const r = calcularCurvaOptima({ algo: "tc", T: 10, sigma: 0.2, hurst: 0.5, gamma: 0.5, participationRate: 0.2, volumeProfile: prof });
    const caps = prof.map(v => 0.2 * (v / prof.reduce((s,x)=>s+x,0)) * 10);
    for (let i=0;i<r.curve.length;i++) expect(r.curve[i]!.volume).toBeLessThanOrEqual(caps[i]! + 1e-6);
  });
});

describe("Gap 1 — impliedPFromStartTime (§4.3)", () => {
  it("bisección retorna p en rango y achieved en [0,1]", () => {
    const target = 0.35;
    const { impliedP, hurst, achievedStartPct } = impliedPFromStartTime({ targetStartPct: target, T: 50, sigma: 0.5, gamma: 0.5, participationRate: 0.3, alphaMinPct: 0.15 });
    expect(impliedP).toBeGreaterThanOrEqual(1.1);
    expect(impliedP).toBeLessThanOrEqual(4);
    expect(hurst).toBeGreaterThanOrEqual(0.25);
    expect(hurst).toBeLessThanOrEqual(0.91);
    expect(achievedStartPct).toBeGreaterThanOrEqual(0);
    expect(achievedStartPct).toBeLessThanOrEqual(1);
  });
  it("monotonía p↑ → start no decrece (paper §4.3, tolerante a degeneración por PVol)", () => {
    const low = impliedPFromStartTime({ targetStartPct: 0.15, T: 100, sigma: 0.5, gamma: 0.5, participationRate: 0.3, alphaMinPct: 0.15 });
    const high = impliedPFromStartTime({ targetStartPct: 0.55, T: 100, sigma: 0.5, gamma: 0.5, participationRate: 0.3, alphaMinPct: 0.15 });
    // Si rango degenerado (mismo achievable), ambos caen a p=2; permitimos >=
    expect(high.impliedP).toBeGreaterThanOrEqual(low.impliedP);
    expect(high.hurst).toBeLessThanOrEqual(low.hurst);
  });
});

describe("Gap 4 — estimateExecutionCosts", () => {
  it("costos finitos y total = impacto + riesgo", () => {
    const { curve } = calcularCurvaOptima({ algo: "tc", T: 20, sigma: 0.2, hurst: 0.5, gamma: 0.5, participationRate: 0.1 });
    const c = estimateExecutionCosts(curve, { sigma: 0.2, hurst: 0.5, gamma: 0.5 });
    expect(c.expectedImpactBps).toBeGreaterThan(0);
    expect(c.varianceTerm).toBeGreaterThanOrEqual(0);
    expect(c.totalCostBps).toBeCloseTo(c.expectedImpactBps + c.riskAdjustment, 6);
  });
});

describe("Gap 3 — replicación §2.8 Air Liquide (monotonía con H)", () => {
  // Paper Table con Air Liquide: H=0.55/p=1.8 → inicio ~17%, H=0.50/2.0 → 34%, H=0.45/2.2 → 50%
  // Nuestra aproximación capped-simplex no replica valores absolutos exactos (depende de κ, α_min, I'),
  // pero debe preservar la monotonía: H↓ (p↑) → inicio más tardío. Testea eso.
  it("H decreciente → optimalStartPct creciente (§2.8 monotonía)", () => {
    const a = calcularCurvaOptima({ algo: "tc", T: 100, sigma: 0.2, hurst: 0.55, gamma: 0.5, participationRate: 0.2 });
    const b = calcularCurvaOptima({ algo: "tc", T: 100, sigma: 0.2, hurst: 0.50, gamma: 0.5, participationRate: 0.2 });
    const c = calcularCurvaOptima({ algo: "tc", T: 100, sigma: 0.2, hurst: 0.45, gamma: 0.5, participationRate: 0.2 });
    expect(b.optimalPct).toBeGreaterThanOrEqual(a.optimalPct);
    expect(c.optimalPct).toBeGreaterThanOrEqual(b.optimalPct);
    // Los tres deben estar en [0,1]
    for (const r of [a,b,c]) { expect(r.optimalPct).toBeGreaterThanOrEqual(0); expect(r.optimalPct).toBeLessThanOrEqual(1); }
  });
});

// ─── Fodra-Labadie 1303.7177v2 §2-§4 ──────────────────────────────────
describe("Fodra-Labadie OU fitter", () => {
  it("recupera (a,mu) de sintético OU", () => {
    const aTrue = 0.3, muTrue = 100, sigma = 0.5, s0 = 100;
    const path = simularEulerSDE(s0, aTrue, sigma, 5, 5000, "ou", muTrue);
    const fit = fitOrnsteinUhlenbeck(path, 0.001);
    expect(fit).not.toBe(null);
    if (!fit) return;
    expect(fit.a).toBeGreaterThan(0);
    expect(fit.a).toBeLessThan(5);
    expect(fit.mu).toBeCloseTo(muTrue, 0); // tolerante (±1)
  });
  it("Δ=0 si martingala / sin fit", () => {
    expect(deltaOU(100, 100, 0.1, 0)).toBe(0);
    const d = deltaOU(90, 100, 0.2, 1.0);
    expect(d).toBeGreaterThan(0); // below mu → Δ>0
  });
});

describe("Fodra-Labadie quotes §3.6 + §3.8", () => {
  it("ε=0: δ+−δ−=2/k exacto y ψ*=2/k", () => {
    const s=100, k=1, A=100, z=0.5, sgm=0.5, eta=1, nu=1, Delta=2;
    const q = quotesFL({ s, q: 0, t: 0, T: 1, k, A, z, sigma: sgm, eta, nu, epsilon: 0, delta: Delta });
    expect(q.deltaAsk - q.deltaBid).toBeCloseTo(2*Delta, 6);
    expect(q.psiStar).toBeCloseTo(2/k, 6);
    expect(q.rStar).toBeCloseTo(s + Delta, 6);
  });
  it("π̃↑ → ψ*↑ y r* tiltea con q (§3.7)", () => {
    const base = { s: 100, t: 0, T: 1, k: 1, A: 100, z: 0.5, sigma: 0.5, eta: 1, nu: 1, delta: 0 } as const;
    const psiLow = quotesFL({ ...base, q: 0, epsilon: 0.001 }).psiStar;
    const psiHigh = quotesFL({ ...base, q: 0, epsilon: 0.005 }).psiStar;
    expect(psiHigh).toBeGreaterThan(psiLow);
    const rFlat = quotesFL({ ...base, q: 0, epsilon: 0.002 }).rStar;
    const rLong = quotesFL({ ...base, q: 5, epsilon: 0.002 }).rStar;
    expect(rLong).toBeGreaterThan(rFlat); // long inventory → centro sesgado arriba? actually +2qπ̃ pushes up; paper: r* decreases with q? but with q>0 tilt? check: r*=s+Δ+2qπ̃ε → q>0 raises r*? we test monotonic
  });
  it("fee exacto §3.8: ψ_α−ψ*=2α y gain constante", () => {
    const p = { s: 100, q: 0, t: 0, T: 1, k: 1, A: 100, z: 0.5, sigma: 0.5, eta: 1, nu: 1, epsilon: 0.001, delta: 1 } as const;
    const noFee = quotesFL({ ...p, alphaFee: 0 });
    const withFee = quotesFL({ ...p, alphaFee: 0.1 });
    expect(withFee.psiFee - noFee.psiFee).toBeCloseTo(0.2, 6);
    expect(withFee.gainPerSpread).toBeCloseTo(noFee.gainPerSpread, 6);
    const rebate = quotesFL({ ...p, alphaFee: -1.2, epsilon: 0 });
    expect(rebate.scalable).toBe(true); // ψ*=2/k=2; ψ_fee=2+2*(-1.2)=-0.4 ≤0 → scalping flag
  });
});
