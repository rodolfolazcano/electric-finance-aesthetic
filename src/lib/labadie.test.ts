// @ts-nocheck
// Tests Labadié P0+P1 — ejecutables con `npx tsx src/lib/labadie.test.ts` o vitest
let _describe: any, _it: any, _expect: any;
try { ({ describe: _describe, it: _it, expect: _expect } = await import("vitest")); } catch { _describe = (n: string, fn: any) => fn(); _it = (n: string, fn: any) => { try { fn(); console.log(`✓ ${n}`);} catch(e:any){console.error(`✗ ${n}`, e.message);}}; _expect = (v:any)=>({ toBe:(e:any)=>{ if(v!==e) throw new Error(`${v} !== ${e}`);}, toBeCloseTo:(e:any, d=2)=>{ if(Math.abs(v-e) > Math.pow(10,-d)) throw new Error(`${v} not close to ${e}`);}, toBeGreaterThanOrEqual:(e:any)=>{ if(!(v>=e)) throw new Error(`${v} < ${e}`);}, toBeLessThanOrEqual:(e:any)=>{ if(!(v<=e)) throw new Error(`${v} > ${e}`);}, toBeGreaterThan:(e:any)=>{ if(!(v>e)) throw new Error(`${v} <= ${e}`);}, not:{ toBeCloseTo:(e:any,d=2)=>{ if(Math.abs(v-e) <= Math.pow(10,-d)) throw new Error(`${v} close to ${e} but shouldn't`);}}}); }
const describe = _describe, it = _it, expect = _expect;
import { tasaRealFisherExacta, tasaRealFisher } from "./math/calculo-financiero.functions";
import { computeHurst, impliedPFromReturns } from "./math/stats";
import { calcularCurvaOptima } from "./labadie/execution-curve";
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
