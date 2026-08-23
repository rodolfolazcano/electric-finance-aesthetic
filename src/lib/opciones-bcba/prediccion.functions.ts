/**
 * Predicción del subyacente — port TS de prediccion_service.py.
 * Metodología Labadie ML (2018) Secc 2-5 + Stat Arb walk-forward.
 * Regresión logística con Newton-Raphson + L2, sin dependencias externas
 * (reemplaza sklearn para correr en Vercel). NN omitida: la señal usa Logistic.
 */

export const FEATURES_PRED = [
  "return_1d",
  "return_5d",
  "return_10d",
  "return_20d",
  "vol_10d",
  "vol_20d",
  "vol_60d",
  "spread_bps",
  "adv_pct",
  "rsi_14",
  "macd",
  "macd_hist",
  "bb_pct_b",
  "factor1",
  "factor2",
] as const;

const HORIZONTE_DEFAULT = 5;
const MIN_FILAS = 100;

export interface Vela {
  fecha: string;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function pctChange(serie: number[], n: number): Array<number | null> {
  return serie.map((v, i) => {
    if (i < n) return null;
    const prev = serie[i - n];
    return prev > 0 ? v / prev - 1 : null;
  });
}

function rollingStd(serie: number[], ventana: number): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < serie.length; i++) {
    if (i < ventana) {
      out.push(null);
      continue;
    }
    const s = serie.slice(i - ventana, i);
    const m = s.reduce((a, b) => a + b, 0) / ventana;
    out.push(Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / (ventana - 1)));
  }
  return out;
}

function ema(serie: number[], span: number): number[] {
  const alpha = 2 / (span + 1);
  const out = [serie[0]];
  for (let i = 1; i < serie.length; i++) out.push(alpha * serie[i] + (1 - alpha) * out[i - 1]);
  return out;
}

export function engineerFeatures(velas: Vela[]): Record<string, Array<number | null>> {
  const close = velas.map((v) => v.close);
  const macdLine = (() => {
    const e12 = ema(close, 12);
    const e26 = ema(close, 26);
    return e12.map((v, i) => v - e26[i]);
  })();
  const signal = ema(macdLine, 9);
  const macdHist = macdLine.map((v, i) => v - signal[i]);

  const bbMavg = (() => {
    const out: Array<number | null> = [];
    for (let i = 0; i < close.length; i++) {
      if (i < 20) {
        out.push(null);
        continue;
      }
      const s = close.slice(i - 20, i);
      out.push(s.reduce((a, b) => a + b, 0) / 20);
    }
    return out;
  })();
  const bbStd = rollingStd(close.slice(), 21); // std sobre los mismos 20 días

  const f: Record<string, Array<number | null>> = {};
  for (const [n, key] of [
    [1, "return_1d"],
    [5, "return_5d"],
    [10, "return_10d"],
    [20, "return_20d"],
  ] as const) {
    f[key] = pctChange(close, n);
  }
  // retornos log alineados al índice original (null en i=0)
  const rets: Array<number | null> = close.map((v, i) => {
    if (i === 0 || close[i - 1] <= 0) return null;
    return Math.log(v / close[i - 1]);
  });
  const stdAlineada = (ventana: number): Array<number | null> =>
    rets.map((_, i) => {
      if (i < ventana + 1) return null;
      const s = rets.slice(i - ventana, i).filter((v): v is number => v != null);
      if (s.length < ventana - 2) return null;
      const m = s.reduce((a, b) => a + b, 0) / s.length;
      return Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / (s.length - 1));
    });
  f.vol_10d = stdAlineada(10);
  f.vol_20d = stdAlineada(20);
  f.vol_60d = stdAlineada(60);
  f.spread_bps = velas.map((v) => (v.close > 0 ? ((v.high - v.low) / v.close) * 10000 : null));

  const volMavg20 = (() => {
    const out: Array<number | null> = [];
    for (let i = 0; i < velas.length; i++) {
      if (i < 20) {
        out.push(null);
        continue;
      }
      const s = velas.slice(i - 20, i).map((v) => v.volume);
      out.push(s.reduce((a, b) => a + b, 0) / 20);
    }
    return out;
  })();
  f.adv_pct = velas.map((v, i) =>
    volMavg20[i] && (volMavg20[i] as number) > 0 ? v.volume / (volMavg20[i] as number) : null,
  );

  // RSI 14
  f.rsi_14 = (() => {
    const out: Array<number | null> = [];
    for (let i = 0; i < velas.length; i++) {
      if (i < 15) {
        out.push(null);
        continue;
      }
      let gain = 0;
      let loss = 0;
      for (let j = i - 14; j <= i; j++) {
        const d = close[j] - close[j - 1];
        if (d > 0) gain += d;
        else loss -= d;
      }
      out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
    }
    return out;
  })();

  f.macd = macdLine;
  f.macd_hist = macdHist;
  f.bb_pct_b = bbMavg.map((mavg, i) =>
    mavg != null && bbStd[i] != null && (bbStd[i] as number) > 0
      ? (close[i] - mavg) / (2 * (bbStd[i] as number))
      : null,
  );
  f.factor1 = f.return_5d.map((v, i) =>
    v != null && f.vol_20d[i] != null && (f.vol_20d[i] as number) > 0
      ? v / (f.vol_20d[i] as number)
      : null,
  );
  f.factor2 = f.adv_pct.map((v, i) =>
    v != null && f.spread_bps[i] != null ? v * (f.spread_bps[i] as number) : null,
  );
  return f;
}

// ═══════════════════════════════════════════════════════════════════════
// Dataset, split temporal y escalado
// ═══════════════════════════════════════════════════════════════════════

export interface FilaDataset {
  features: number[];
  yClf: 0 | 1;
  yReg: number;
}

/** Arma filas completas (features + target horizonte n) descartando nulls. */
export function construirDataset(velas: Vela[], horizonte = HORIZONTE_DEFAULT): FilaDataset[] {
  const f = engineerFeatures(velas);
  const close = velas.map((v) => v.close);
  const filas: FilaDataset[] = [];
  for (let i = 0; i < velas.length - horizonte; i++) {
    const feats: number[] = [];
    let ok = true;
    for (const key of FEATURES_PRED) {
      const v = f[key][i];
      if (v == null || !Number.isFinite(v)) {
        ok = false;
        break;
      }
      feats.push(v);
    }
    if (!ok) continue;
    const futura = close[i + horizonte];
    if (!Number.isFinite(futura) || close[i] <= 0) continue;
    const retFuturo = futura / close[i] - 1;
    filas.push({ features: feats, yClf: retFuturo > 0 ? 1 : 0, yReg: retFuturo });
  }
  return filas;
}

export function splitTemporal<T>(
  datos: T[],
  trainPct = 0.6,
  cvPct = 0.2,
): { train: T[]; cv: T[]; test: T[] } {
  const n = datos.length;
  const trainEnd = Math.floor(n * trainPct);
  const cvEnd = trainEnd + Math.floor(n * cvPct);
  return {
    train: datos.slice(0, trainEnd),
    cv: datos.slice(trainEnd, cvEnd),
    test: datos.slice(cvEnd),
  };
}

interface Estandarizador {
  media: number[];
  desvio: number[];
}

function fitScaler(filas: FilaDataset[]): Estandarizador | null {
  const d = FEATURES_PRED.length;
  if (filas.length < 2) return null;
  const media = new Array<number>(d).fill(0);
  for (const fila of filas) for (let j = 0; j < d; j++) media[j] += fila.features[j];
  for (let j = 0; j < d; j++) media[j] /= filas.length;
  const desvio = new Array<number>(d).fill(0);
  for (const fila of filas)
    for (let j = 0; j < d; j++) desvio[j] += (fila.features[j] - media[j]) ** 2;
  for (let j = 0; j < d; j++) desvio[j] = Math.sqrt(desvio[j] / (filas.length - 1)) || 1e-8;
  return { media, desvio };
}

function escalar(features: number[], s: Estandarizador): number[] {
  return features.map((v, j) => (v - s.media[j]) / s.desvio[j]);
}

function conIntercepto(x: number[]): number[] {
  return [1, ...x];
}

// ═══════════════════════════════════════════════════════════════════════
// Regresión logística L2 — Newton-Raphson (equivalente lbfgs/C=1)
// ═══════════════════════════════════════════════════════════════════════

function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

function resolverSistema(A: number[][], b: number[]): number[] {
  // Gauss-Jordan con pivoteo parcial (matriz ~16x16)
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const p = M[col][col];
    if (Math.abs(p) < 1e-12) continue;
    for (let c = col; c <= n; c++) M[col][c] /= p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

export interface ModeloLogistico {
  beta: number[];
  lambdaL2: number;
}

export function entrenarLogistica(
  filas: FilaDataset[],
  scaler: Estandarizador,
  lambdaL2 = 1.0,
  iteraciones = 30,
): ModeloLogistico {
  const X = filas.map((f) => conIntercepto(escalar(f.features, scaler)));
  const y = filas.map((f) => f.yClf);
  const m = X.length;
  const d = X[0].length;
  const beta = new Array<number>(d).fill(0);

  for (let it = 0; it < iteraciones; it++) {
    const grad = new Array<number>(d).fill(0);
    const hess = Array.from({ length: d }, () => new Array<number>(d).fill(0));
    for (let i = 0; i < m; i++) {
      let z = 0;
      for (let j = 0; j < d; j++) z += beta[j] * X[i][j];
      const p = sigmoid(z);
      const w = Math.max(p * (1 - p), 1e-10);
      const err = y[i] - p;
      for (let j = 0; j < d; j++) {
        grad[j] += err * X[i][j];
        for (let k = j; k < d; k++) hess[j][k] += w * X[i][j] * X[i][k];
      }
    }
    for (let j = 1; j < d; j++) grad[j] -= lambdaL2 * beta[j]; // sin penalizar intercepto
    for (let j = 1; j < d; j++)
      for (let k = 1; k <= j; k++) {
        hess[k][j] += j === k ? lambdaL2 : 0;
      }
    for (let j = 0; j < d; j++) for (let k = 0; k < j; k++) hess[j][k] = hess[k][j];
    const paso = resolverSistema(hess, grad);
    for (let j = 0; j < d; j++) beta[j] += paso[j];
    if (paso.every((v) => Math.abs(v) < 1e-8)) break;
  }
  return { beta, lambdaL2 };
}

export function predecirProba(modelo: ModeloLogistico, xEscalar: number[]): number {
  const x = conIntercepto(xEscalar);
  let z = 0;
  for (let j = 0; j < x.length; j++) z += modelo.beta[j] * x[j];
  return sigmoid(z);
}

// ═══════════════════════════════════════════════════════════════════════
// Threshold óptimo en CV (F1, fallback Acc+F1 si degenera) — Labadie diag 33
// ═══════════════════════════════════════════════════════════════════════

function f1Score(yReal: number[], yPred: number[]): number {
  let tp = 0,
    fp = 0,
    fn = 0;
  for (let i = 0; i < yReal.length; i++) {
    if (yPred[i] === 1 && yReal[i] === 1) tp++;
    else if (yPred[i] === 1 && yReal[i] === 0) fp++;
    else if (yPred[i] === 0 && yReal[i] === 1) fn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  return precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
}

function accuracy(yReal: number[], yPred: number[]): number {
  let ok = 0;
  for (let i = 0; i < yReal.length; i++) if (yReal[i] === yPred[i]) ok++;
  return yReal.length > 0 ? ok / yReal.length : 0;
}

export function optimizarThreshold(
  modelo: ModeloLogistico,
  cvFilas: FilaDataset[],
  scaler: Estandarizador,
): { threshold: number; f1: number; acc: number } {
  const probs = cvFilas.map((f) => predecirProba(modelo, escalar(f.features, scaler)));
  const y = cvFilas.map((f) => f.yClf);

  let bestThresh = 0.5;
  let bestF1 = 0;
  for (let t = 1; t < 100; t++) {
    const thresh = t / 100;
    const preds = probs.map((p) => (p >= thresh ? 1 : 0));
    const f1 = f1Score(y, preds);
    if (f1 > bestF1) {
      bestF1 = f1;
      bestThresh = thresh;
    }
  }

  const predsBest = probs.map((p) => (p >= bestThresh ? 1 : 0));
  const unicos = new Set(predsBest).size;
  const degenerado = unicos < 2 || bestF1 < 1e-6;
  if (degenerado) {
    let mejorCombo = { t: 0.5, score: -1 };
    for (let t = 1; t < 100; t++) {
      const thresh = t / 100;
      const preds = probs.map((p) => (p >= thresh ? 1 : 0));
      const score = accuracy(y, preds) + f1Score(y, preds);
      if (score > mejorCombo.score) mejorCombo = { t: thresh, score };
    }
    bestThresh = mejorCombo.t;
  }
  const predsFinal = probs.map((p) => (p >= bestThresh ? 1 : 0));
  return { threshold: bestThresh, f1: f1Score(y, predsFinal), acc: accuracy(y, predsFinal) };
}

// ═══════════════════════════════════════════════════════════════════════
// Walk-forward backtest (Stat Arb Stage 3-5)
// ═══════════════════════════════════════════════════════════════════════

export function walkForward(
  datos: FilaDataset[],
  windowTrain = 504,
  windowTest = 63,
): { acc: number | null; f1: number | null; ventanas: number } {
  const n = datos.length;
  let trainW = windowTrain;
  let testW = windowTest;
  if (n < trainW + testW) {
    // adaptativo para historias cortas (~250 días = 1 año)
    trainW = Math.floor(n * 0.6);
    testW = Math.max(Math.floor(n * 0.15), 20);
  }
  if (n < trainW + testW || trainW < 60) return { acc: null, f1: null, ventanas: 0 };

  const preds: number[] = [];
  const reales: number[] = [];
  let start = trainW;
  while (start < n) {
    const end = Math.min(start + testW, n);
    const train = datos.slice(start - trainW, start);
    const test = datos.slice(start, end);
    const scaler = fitScaler(train);
    if (!scaler) break;
    const modelo = entrenarLogistica(train, scaler, 1.0, 20);
    for (const fila of test) {
      preds.push(predecirProba(modelo, escalar(fila.features, scaler)) >= 0.5 ? 1 : 0);
      reales.push(fila.yClf);
    }
    start = end;
  }
  if (reales.length === 0) return { acc: null, f1: null, ventanas: 0 };
  return {
    acc: accuracy(reales, preds),
    f1: f1Score(reales, preds),
    ventanas: Math.floor((n - trainW) / testW),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Señal → opciones y pipeline completo
// ═══════════════════════════════════════════════════════════════════════

export interface DecisionOpciones {
  direccion: "CALL (alcista)" | "PUT (bajista)" | "NEUTRAL (esperar)";
  probabilidad: number;
  confianza: number;
  strikeAtm: number;
  strikeOtm: number;
  estrategia: string;
}

export function senialAOpciones(
  probSubida: number,
  threshold: number,
  spot: number,
  strikes?: number[],
): DecisionOpciones {
  const grid =
    strikes && strikes.length > 0
      ? strikes
      : Array.from({ length: 10 }, (_, i) => spot * (0.85 + (i * 0.3) / 9));

  let direccion: DecisionOpciones["direccion"];
  let strikeOtm: number;
  const strikeAtm = grid.reduce((best, s) =>
    Math.abs(s - spot) < Math.abs(best - spot) ? s : best,
  );
  let confianza = 0;

  if (probSubida > threshold) {
    direccion = "CALL (alcista)";
    strikeOtm = grid.reduce((best, s) =>
      Math.abs(s - spot * 1.03) < Math.abs(best - spot * 1.03) ? s : best,
    );
    confianza = threshold < 1 ? (probSubida - threshold) / (1 - threshold) : 0;
  } else if (probSubida < 1 - threshold) {
    direccion = "PUT (bajista)";
    strikeOtm = grid.reduce((best, s) =>
      Math.abs(s - spot * 0.97) < Math.abs(best - spot * 0.97) ? s : best,
    );
    confianza = threshold > 0 ? (threshold - probSubida) / threshold : 0;
  } else {
    direccion = "NEUTRAL (esperar)";
    strikeOtm = strikeAtm;
  }

  const conf = Math.min(confianza, 1);
  return {
    direccion,
    probabilidad: Number(probSubida.toFixed(4)),
    confianza: Number(conf.toFixed(4)),
    strikeAtm: Math.round(strikeAtm),
    strikeOtm: Math.round(strikeOtm),
    estrategia:
      conf > 0.5
        ? `Comprar ${direccion.split("(")[0].trim()} Strike ${strikeOtm.toFixed(0)}`
        : "Esperar señal más clara",
  };
}

export interface ResultadoPrediccion {
  simbolo?: string;
  spot?: number;
  logThreshold: number;
  logisticCv: { threshold: number; acc: number; f1: number; filasCv: number };
  testAcc: number | null;
  testF1: number | null;
  wfAcc: number | null;
  wfF1: number | null;
  wfVentanas: number;
  reglaOroOk: boolean;
  probActual: number | null;
  decision: DecisionOpciones | null;
  featuresImportancia: Array<[string, number]>;
  filasUtiles: number;
  error?: string;
}

export function ejecutarPrediccion(
  velas: Vela[],
  simbolo: string,
  horizonte = HORIZONTE_DEFAULT,
): ResultadoPrediccion {
  const base: ResultadoPrediccion = {
    simbolo,
    logThreshold: 0.5,
    logisticCv: { threshold: 0.5, acc: 0, f1: 0, filasCv: 0 },
    testAcc: null,
    testF1: null,
    wfAcc: null,
    wfF1: null,
    wfVentanas: 0,
    reglaOroOk: false,
    probActual: null,
    decision: null,
    featuresImportancia: [],
    filasUtiles: 0,
  };

  const datos = construirDataset(velas, horizonte);
  base.filasUtiles = datos.length;
  if (datos.length < MIN_FILAS) {
    base.error = `Datos insuficientes para predicción (${datos.length} filas útiles, mínimo ${MIN_FILAS})`;
    return base;
  }

  const { train, cv, test } = splitTemporal(datos);
  const scaler = fitScaler(train);
  if (!scaler) {
    base.error = "No se pudo ajustar el estandarizador";
    return base;
  }
  base.reglaOroOk = FEATURES_PRED.length <= Math.min(train.length, cv.length) / 10;

  const modelo = entrenarLogistica(train, scaler);
  const cvMetrics = optimizarThreshold(modelo, cv, scaler);
  base.logThreshold = cvMetrics.threshold;
  base.logisticCv = {
    threshold: cvMetrics.threshold,
    acc: Number(cvMetrics.acc.toFixed(4)),
    f1: Number(cvMetrics.f1.toFixed(4)),
    filasCv: cv.length,
  };

  const wf = walkForward(datos);
  base.wfAcc = wf.acc != null ? Number(wf.acc.toFixed(4)) : null;
  base.wfF1 = wf.f1 != null ? Number(wf.f1.toFixed(4)) : null;
  base.wfVentanas = wf.ventanas;

  if (test.length >= 10) {
    const probs = test.map((f) => predecirProba(modelo, escalar(f.features, scaler)));
    const preds = probs.map((p) => (p >= cvMetrics.threshold ? 1 : 0));
    const y = test.map((f) => f.yClf);
    base.testAcc = Number(accuracy(y, preds).toFixed(4));
    base.testF1 = Number(f1Score(y, preds).toFixed(4));
  }

  // Probabilidad de subida con la última vela disponible (features más recientes)
  const fRecientes = engineerFeatures(velas);
  const ultimas: number[] = [];
  let okUltima = true;
  for (const key of FEATURES_PRED) {
    const v = fRecientes[key][velas.length - 1];
    if (v == null || !Number.isFinite(v)) {
      okUltima = false;
      break;
    }
    ultimas.push(v);
  }
  if (okUltima) {
    const prob = predecirProba(modelo, escalar(ultimas, scaler));
    base.probActual = Number(prob.toFixed(4));
    const spot = velas[velas.length - 1].close;
    base.decision = senialAOpciones(prob, cvMetrics.threshold, spot);
  }

  base.featuresImportancia = modelo.beta
    .slice(1)
    .map((b, i) => [FEATURES_PRED[i], Number(b.toFixed(4))] as [string, number])
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5);

  return base;
}
