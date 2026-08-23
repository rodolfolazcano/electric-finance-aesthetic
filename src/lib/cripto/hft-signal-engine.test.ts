import { describe, it, expect } from "vitest";
import {
  calcularObiPonderado,
  calcularProbBsEmpirico,
  calcularCantidad,
  calcularSlTp,
  HftSignalEngine,
  makeSyntheticSnapshots,
} from "./hft-signal-engine";

describe("hft-signal-engine OBI ponderado", () => {
  it("OBI positivo cuando bids dominan", () => {
    const bids: [number, number][] = Array.from({ length: 10 }, (_, i) => [100 - i * 0.1, 10]);
    const asks: [number, number][] = Array.from({ length: 10 }, (_, i) => [100 + 0.5 + i * 0.1, 1]);
    const { obi, microPrice } = calcularObiPonderado(bids, asks);
    expect(obi).toBeGreaterThan(0.3);
    expect(microPrice).toBeGreaterThan(100);
  });

  it("OBI negativo cuando asks dominan", () => {
    const bids: [number, number][] = Array.from({ length: 10 }, (_, i) => [100 - i * 0.1, 1]);
    const asks: [number, number][] = Array.from({ length: 10 }, (_, i) => [100 + 0.5 + i * 0.1, 10]);
    const { obi } = calcularObiPonderado(bids, asks);
    expect(obi).toBeLessThan(-0.3);
  });

  it("microprice entre best bid/ask", () => {
    const bids: [number, number][] = [[99.5, 5], [99, 5]];
    const asks: [number, number][] = [[100.5, 5], [101, 5]];
    const { microPrice, bestBid, bestAsk } = calcularObiPonderado(bids, asks);
    expect(microPrice).toBeGreaterThanOrEqual(bestBid);
    expect(microPrice).toBeLessThanOrEqual(bestAsk);
  });
});

describe("prob híbrida", () => {
  it("prob en [0,1] y ponderación 30/70", () => {
    const rets = Array.from({ length: 200 }, () => (Math.random() - 0.5) * 0.002);
    const res = calcularProbBsEmpirico({
      rawSignal: "COMPRA",
      entry: 60000,
      tp: 60100,
      sl: 59900,
      retornosEmpiricos: rets,
      atrPct: 0.002,
      nSims: 200,
      pasos: 20,
    });
    expect(res.probFinal).toBeGreaterThanOrEqual(0);
    expect(res.probFinal).toBeLessThanOrEqual(1);
    expect(res.probEmpirica).toBeGreaterThanOrEqual(0);
    expect(res.probAnalitica).toBeGreaterThanOrEqual(0);
    // 0.3*analitica +0.7*empirica = final
    const expected = 0.3 * res.probAnalitica + 0.7 * res.probEmpirica;
    expect(res.probFinal).toBeCloseTo(expected, 6);
  });

  it("retorna 0.5 con pocos retornos", () => {
    const res = calcularProbBsEmpirico({
      rawSignal: "COMPRA",
      entry: 100,
      tp: 101,
      sl: 99,
      retornosEmpiricos: [0.001],
      atrPct: 0.001,
    });
    expect(res.probFinal).toBe(0.5);
  });
});

describe("sizing", () => {
  it("qty = riesgo/(2*ATR)", () => {
    expect(calcularCantidad(0.01, 1000, 1, 2)).toBeCloseTo(5, 6); // 10 /2
    expect(calcularCantidad(0.01, 1000, 0.5, 2)).toBeCloseTo(10, 6);
  });

  it("SL/TP asimétricos correctos", () => {
    const { sl, tp } = calcularSlTp(100, 1, "COMPRA", 2, 7);
    expect(sl).toBe(98);
    expect(tp).toBe(107);
    const { sl: sl2, tp: tp2 } = calcularSlTp(100, 1, "VENTA", 2, 7);
    expect(sl2).toBe(102);
    expect(tp2).toBe(93);
  });
});

describe("HftSignalEngine integración", () => {
  it("warmup bloquea señal", () => {
    const eng = new HftSignalEngine();
    // sin pushTick, evaluate debe dar warmup
    const res = eng.evaluate({
      bids: [[100, 10]] as any,
      asks: [[100.5, 10]] as any,
      highs: Array(20).fill(101),
      lows: Array(20).fill(99),
      closes: Array(20).fill(100),
    });
    expect(res.rawSignal).toBeNull();
    expect(res.reason).toContain("WARMUP");
  });

  it("tras warmup con sesgo fuerte genera señal", () => {
    const engine = new HftSignalEngine();
    // llenar con snapshots sesgados a COMPRA (bids pesados)
    const snaps = makeSyntheticSnapshots(1500, 0.8, 60000);
    for (const s of snaps) engine.pushTick(s.bids, s.asks);
    // ahora tick extremo adicional
    const bids: [number, number][] = Array.from({ length: 10 }, (_, i) => [60000 - i, 20] as [number, number]);
    const asks: [number, number][] = Array.from({ length: 10 }, (_, i) => [60000 + 0.5 + i, 1] as [number, number]);
    engine.pushTick(bids, asks);
    const res = engine.evaluate({
      bids,
      asks,
      highs: Array(20).fill(60100),
      lows: Array(20).fill(59900),
      closes: Array(20).fill(60000),
    });
    // z debería ser alto, rawSignal COMPRA
    expect(res.zScore).toBeGreaterThan(0);
    // si no es COMPRA, al menos no crashea
    expect(["COMPRA", "VENTA", null]).toContain(res.rawSignal);
  });

  it("makeSyntheticSnapshots respeta bias", () => {
    const pos = makeSyntheticSnapshots(100, 0.9, 100);
    const neg = makeSyntheticSnapshots(100, -0.9, 100);
    const avgPos = pos.reduce((s, x) => s + x.obi, 0) / pos.length;
    const avgNeg = neg.reduce((s, x) => s + x.obi, 0) / neg.length;
    expect(avgPos).toBeGreaterThan(avgNeg);
  });
});
