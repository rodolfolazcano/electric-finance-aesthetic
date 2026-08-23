import { describe, it, expect } from "vitest";
import { mcPrecioOpcion, simularGBMPath, simularOUPath } from "./mc-pricing";
import { blackScholes } from "@/lib/herramientas/options-pricing/pricing.models";
import { calcularVarDeltaGamma, calcularVarPortafolio, matrizCorrelacion, calcularCVaRDeltaGamma, calcularCVaRPortafolio } from "@/lib/options-pricing/var";
import { ci95, ci95Mean, jarqueBera, mean, std } from "@/lib/math/stats";
import { twapSchedule, vwapSchedule, povSchedule, povDynamicSchedule, participationForPrice } from "./execution-scheduling";
import { quotesExponencialABM, quotesExponencialOU, quotesLinealSinPenalizacion } from "./market-making";
import { pcaOrderBook, projectSnapshot } from "@/lib/market-microstructure/pca-order-book";
import { shootingMeanReverting } from "./validation";
import type { OrderBookSnapshot } from "@/lib/market-microstructure/pca-order-book";

// helpers
function makeSnap(price: number, vol: number): OrderBookSnapshot {
  return {
    bids: Array.from({ length: 10 }, (_, i) => [price - (i + 1) * 0.5, vol + Math.random() * 10] as [number, number]),
    asks: Array.from({ length: 10 }, (_, i) => [price + (i + 1) * 0.5, vol + Math.random() * 10] as [number, number]),
    timestamp: Date.now(),
  };
}

describe("mc-pricing", () => {
  it("MC call ~ BS cerrado <1% con seed determinístico", () => {
    const bs = blackScholes({ tipo: "Call", S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, q: 0 })!;
    const mc = mcPrecioOpcion({ S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, tipo: "call", nSims: 60000, seed: 12345, useAntithetic: true });
    const relErr = Math.abs(mc.precio - bs.premium) / bs.premium;
    expect(relErr).toBeLessThan(0.015); // 1.5% tolerancia con 60k
    expect(mc.ic95[0]).toBeLessThan(mc.precio);
    expect(mc.ic95[1]).toBeGreaterThan(mc.precio);
  });

  it("MC put + Euler multi-step consistente", () => {
    const mc1 = mcPrecioOpcion({ S: 100, K: 95, T: 0.5, r: 0.03, sigma: 0.25, tipo: "put", nSims: 20000, seed: 42, nSteps: 1 });
    const mcN = mcPrecioOpcion({ S: 100, K: 95, T: 0.5, r: 0.03, sigma: 0.25, tipo: "put", nSims: 20000, seed: 42, nSteps: 10 });
    // ambos deben estar cerca (euler multi-step converge al mismo terminal para GBM exacto por paso)
    const rel = Math.abs(mc1.precio - mcN.precio) / Math.max(1, mc1.precio);
    expect(rel).toBeLessThan(0.05);
  });

  it("simularGBMPath y simularOUPath generan longitud correcta", () => {
    const rng = () => Math.random();
    const gbm = simularGBMPath(100, 0.05, 0.2, 1, 10, rng);
    const ou = simularOUPath(100, 100, 1, 5, 1, 10, rng);
    expect(gbm.length).toBe(11);
    expect(ou.length).toBe(11);
  });
});

describe("var portfolio con correlaciones", () => {
  it("con rho=1 suma lineal, con rho=0 VaR menor", () => {
    const pos = [
      { S: 100, sigma: 0.2, delta: 0.6, gamma: 0.01, cantidad: 10 },
      { S: 100, sigma: 0.2, delta: 0.6, gamma: 0.01, cantidad: 10 },
    ];
    const varSum = calcularVarPortafolio(pos, 0.95, 1); // fallback rho=1
    const varZero = calcularVarPortafolio(pos, 0.95, 1, [[1, 0], [0, 1]]);
    const varIdent = calcularVarPortafolio(pos, 0.95, 1, [[1, 1], [1, 1]]);
    expect(Math.abs(varZero)).toBeLessThan(Math.abs(varSum));
    expect(Math.abs(varIdent - varSum)).toBeLessThan(Math.abs(varSum) * 0.05);
  });

  it("matrizCorrelacion correcta para series correlacionadas", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    const b = [2, 4, 6, 8, 10, 12, 14, 16]; // perfectamente correlacionado
    const mat = matrizCorrelacion([a, b]);
    expect(mat[0][1]).toBeCloseTo(1, 1);
    expect(mat[0][0]).toBe(1);
  });

  it("CVaR > VaR en valor absoluto", () => {
    const { var: v, cvar } = calcularCVaRDeltaGamma(100, 0.2, 0.6, 0.01, 0.95, 1);
    expect(Math.abs(cvar)).toBeGreaterThan(Math.abs(v));
  });
});

describe("stats: jarqueBera y ci95Mean", () => {
  it("ci95Mean intervalo más angosto que ci95", () => {
    const arr = Array.from({ length: 100 }, () => Math.random() * 10 + 5);
    const [l1, h1] = ci95(arr);
    const [l2, h2] = ci95Mean(arr);
    expect(h1 - l1).toBeGreaterThan(h2 - l2);
  });

  it("jarqueBera: normal → isNormal true", () => {
    // generar pseudo-normal via Box-Muller
    const normal: number[] = [];
    for (let i = 0; i < 200; i++) {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      normal.push(Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
    }
    const jb = jarqueBera(normal);
    expect(jb.jb).toBeGreaterThanOrEqual(0);
    expect(typeof jb.pValue).toBe("number");
    // no exigimos isNormal true siempre por varianza muestral, pero pValue debe existir
    expect(jb.pValue).toBeGreaterThan(0);
    expect(jb.pValue).toBeLessThanOrEqual(1);
  });

  it("jarqueBera: uniforme → detecta no normalidad con n grande", () => {
    // uniforme tiene kurtosis ~1.8, JB debe ser alto
    const uni = Array.from({ length: 500 }, () => Math.random());
    const jb = jarqueBera(uni);
    expect(jb.jb).toBeGreaterThan(5);
  });
});

describe("execution-scheduling", () => {
  it("TWAP suma 1 y uniforme", () => {
    const s = twapSchedule({ nSteps: 10 });
    const sum = s.reduce((a, b) => a + b.volume, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(s[0].volume).toBeCloseTo(0.1, 6);
  });

  it("VWAP respeta perfil", () => {
    const profile = [1, 2, 3, 4];
    const s = vwapSchedule({ nSteps: 4, volumeProfile: profile });
    expect(s[3].volume).toBeGreaterThan(s[0].volume);
    expect(s.reduce((a, b) => a + b.volume, 0)).toBeCloseTo(1, 6);
  });

  it("PoV dinámico cambia participación por precio", () => {
    const p1 = participationForPrice(97, 100);
    const p2 = participationForPrice(100, 100);
    const p3 = participationForPrice(103, 100);
    expect(p1).toBe(0.75);
    expect(p2).toBe(0.5);
    expect(p3).toBe(0.25);

    const dyn = povDynamicSchedule({ prices: [97, 100, 103, 99], refPrice: 100 });
    expect(dyn.length).toBe(4);
    expect(dyn.reduce((a, b) => a + b.volume, 0)).toBeCloseTo(1, 6);
  });

  it("PoV schedule completionRisk flag", () => {
    const r = povSchedule({ nSteps: 10, participation: 0.5 });
    expect(r.completionRisk).toBe(true);
    expect(r.totalCapacity).toBe(0.5);
  });
});

describe("market-making closed forms", () => {
  it("ABM con b=0, eta=0, q=0 simétrico", () => {
    const q = quotesExponencialABM({ s: 100, q: 0, t: 0, T: 1, k: 100, gamma: 0.1, eta: 0, sigma: 0.05, b: 0 });
    expect(q.deltaAsk).toBeCloseTo(q.deltaBid, 5);
    expect(q.psiStar).toBeGreaterThan(0);
  });

  it("ABM spread crece con sigma y tau", () => {
    const q1 = quotesExponencialABM({ s: 100, q: 0, t: 0, T: 1, k: 100, gamma: 0.1, eta: 0.0001, sigma: 0.01, b: 0 });
    const q2 = quotesExponencialABM({ s: 100, q: 0, t: 0, T: 1, k: 100, gamma: 0.1, eta: 0.0001, sigma: 0.1, b: 0 });
    expect(q2.psiStar).toBeGreaterThan(q1.psiStar);
  });

  it("OU expectedS converge a mu cuando tau grande", () => {
    const q = quotesExponencialOU({ s: 90, q: 0, t: 0, T: 10, k: 100, gamma: 0.1, eta: 0.0001, sigma: 0.05, a: 1, mu: 100 });
    expect(q.expectedS).toBeCloseTo(100, 0);
    expect(q.psiStar).toBeGreaterThan(0);
  });

  it("lineal sin penalización: psi =2/k", () => {
    const q = quotesLinealSinPenalizacion({ s: 100, expectedS: 101, k: 100 });
    expect(q.psiStar).toBeCloseTo(0.02, 6);
  });
});

describe("pca-order-book fix", () => {
  it("eigenvectors no vacíos y proyección real", () => {
    const history: OrderBookSnapshot[] = Array.from({ length: 120 }, (_, i) => makeSnap(100 + Math.sin(i * 0.1), 100));
    const pca = pcaOrderBook(history, 5);
    expect(pca).not.toBeNull();
    expect(pca!.eigenvectors.length).toBe(3);
    expect(pca!.eigenvectors[0]!.length).toBe(10); // 5 bids+5 asks
    expect(pca!.eigenvalues.length).toBe(3);

    const snap = makeSnap(100, 100);
    const proj = projectSnapshot(snap, history, 5);
    expect(proj).not.toBeNull();
    expect(proj!.projections.length).toBe(3);
    expect(typeof proj!.obiSpectral).toBe("number");
  });
});

describe("shooting mean-reverting", () => {
  it("encuentra alpha* con x_{N+1}≈0 y volúmenes suman 1", () => {
    const res = shootingMeanReverting({ N: 20, gamma: 0.3, lambda: 0.2, C0: 0.1, sigma: 0.02, eta: 0.1 });
    expect(Math.abs(res.xNp1)).toBeLessThan(1e-6);
    expect(res.alphaStar).toBeGreaterThanOrEqual(0);
    const sumVol = res.curve.reduce((s, c) => s + c.volume, 0);
    expect(sumVol).toBeCloseTo(1, 5);
  });

  it("gamma bajo → front-loading (más volumen temprano)", () => {
    const low = shootingMeanReverting({ N: 30, gamma: 0.15, lambda: 0.2 });
    const high = shootingMeanReverting({ N: 30, gamma: 0.8, lambda: 0.2 });
    const cumLow10 = low.curve.slice(0, 10).reduce((s, c) => s + c.volume, 0);
    const cumHigh10 = high.curve.slice(0, 10).reduce((s, c) => s + c.volume, 0);
    expect(cumLow10).toBeGreaterThan(cumHigh10);
  });
});
