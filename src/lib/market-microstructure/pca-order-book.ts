// src/lib/market-microstructure/pca-order-book.ts
// Análisis espectral del Order Book usando PCA (Principal Component Analysis)
// Basado en las metodologías de Labadie para detección de regímenes de mercado

export interface OrderBookSnapshot {
  bids: [number, number][]; // [precio, volumen]
  asks: [number, number][];
  timestamp: number;
}

export interface PCAResult {
  eigenvalues: number[];
  eigenvectors: number[][];
  explainedVariance: number[];
  regimen: "ESTRUCTURADO" | "MIXTO" | "RUIDOSO";
  regimenRatio: number;
}

export interface OBIProjection {
  projections: number[];
  obiSpectral: number;
}

function buildFeatureMatrix(orderBookHistory: OrderBookSnapshot[], nLevels: number, historySize: number): { X: number[][]; means: number[] } {
  const features: number[][] = [];
  for (const snap of orderBookHistory.slice(-historySize)) {
    const bids = Array.from({ length: nLevels }, (_, i) => snap.bids[i]?.[1] || 0);
    const asks = Array.from({ length: nLevels }, (_, i) => snap.asks[i]?.[1] || 0);
    features.push([...bids, ...asks]);
  }
  const X = features;
  const n = X.length;
  const m = X[0]!.length;
  const means = Array.from({ length: m }, () => 0);
  for (let j = 0; j < m; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += X[i]![j]!;
    means[j] = sum / n;
  }
  return { X, means };
}

function covarianceMatrix(XCentered: number[][]): number[][] {
  const n = XCentered.length;
  const m = XCentered[0]!.length;
  const cov: number[][] = Array.from({ length: m }, () => Array.from({ length: m }, () => 0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) sum += XCentered[k]![i]! * XCentered[k]![j]!;
      cov[i]![j] = sum / (n - 1);
    }
  }
  return cov;
}

/**
 * Método de potencia con deflación — retorna eigenvalues y eigenvectors reales.
 */
function powerIterationWithVectors(
  matrix: number[][],
  k: number,
): { eigenvalues: number[]; eigenvectors: number[][] } {
  const n = matrix.length;
  const eigenvalues: number[] = [];
  const eigenvectors: number[][] = [];
  let currentMatrix = matrix.map((row) => [...row]);

  for (let iter = 0; iter < k; iter++) {
    let vector = Array.from({ length: n }, () => Math.random() - 0.5);
    let norm = Math.sqrt(vector.reduce((a, b) => a + b * b, 0)) || 1;
    vector = vector.map((v) => v / norm);

    for (let p = 0; p < 100; p++) {
      const newVector = Array.from({ length: n }, () => 0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) newVector[i]! += currentMatrix[i]![j]! * vector[j]!;
      }
      const newNorm = Math.sqrt(newVector.reduce((a, b) => a + b * b, 0)) || 1;
      vector = newVector.map((v) => v / newNorm);
    }

    let eigenvalue = 0;
    for (let i = 0; i < n; i++) {
      let Av_i = 0;
      for (let j = 0; j < n; j++) Av_i += currentMatrix[i]![j]! * vector[j]!;
      eigenvalue += vector[i]! * Av_i;
    }

    eigenvalues.push(eigenvalue);
    eigenvectors.push([...vector]);

    if (iter < k - 1) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) currentMatrix[i]![j]! -= eigenvalue * vector[i]! * vector[j]!;
      }
    }
  }

  return { eigenvalues, eigenvectors };
}

/**
 * Aplica PCA a la matriz de covarianza del order book
 * Los autovectores representan los 'modos' de desequilibrio dominantes
 */
export function pcaOrderBook(orderBookHistory: OrderBookSnapshot[], nLevels: number = 10): PCAResult | null {
  if (orderBookHistory.length < 100) return null;

  const historySize = Math.min(orderBookHistory.length, 500);
  const { X, means } = buildFeatureMatrix(orderBookHistory, nLevels, historySize);
  const n = X.length;
  const m = X[0]!.length;

  const XCentered = X.map((row) => row.map((val, j) => val - means[j]!));
  const covMatrix = covarianceMatrix(XCentered);

  const { eigenvalues, eigenvectors } = powerIterationWithVectors(covMatrix, 3);
  const totalVariance = eigenvalues.reduce((a, b) => a + b, 0) || 1;
  const explainedVariance = eigenvalues.map((ev) => ev / totalVariance);

  const regimenRatio = explainedVariance[0] ?? 0;
  let regimen: PCAResult["regimen"];
  if (regimenRatio > 0.65) regimen = "ESTRUCTURADO";
  else if (regimenRatio > 0.45) regimen = "MIXTO";
  else regimen = "RUIDOSO";

  return { eigenvalues, eigenvectors, explainedVariance, regimen, regimenRatio };
}

/**
 * Proyecta el estado actual del order book sobre los autovectores dominantes
 * La proyección sobre el primer autovector es el 'OBI estructural' real (no proxy por promedios).
 */
export function projectSnapshot(
  snapshot: OrderBookSnapshot,
  orderBookHistory: OrderBookSnapshot[],
  nLevels: number = 10,
): OBIProjection | null {
  if (orderBookHistory.length < 50) return null;

  const historySize = Math.min(orderBookHistory.length, 500);
  const bids = Array.from({ length: nLevels }, (_, i) => snapshot.bids[i]?.[1] || 0);
  const asks = Array.from({ length: nLevels }, (_, i) => snapshot.asks[i]?.[1] || 0);
  const x = [...bids, ...asks];

  const { X, means } = buildFeatureMatrix(orderBookHistory, nLevels, historySize);
  const XCentered = X.map((row) => row.map((val, j) => val - means[j]!));
  const covMatrix = covarianceMatrix(XCentered);
  const { eigenvectors } = powerIterationWithVectors(covMatrix, 3);

  const xCentered = x.map((val, j) => val - means[j]!);

  // Proyecciones reales: dot(x_centered, eigenvector_k)
  const projections = eigenvectors.map((vec) => vec.reduce((sum, v, j) => sum + v * (xCentered[j] ?? 0), 0));

  // fallback si por alguna razón no hay eigenvectors
  if (projections.length === 0) {
    const m = x.length;
    return {
      projections: [
        xCentered.reduce((a, b) => a + b, 0) / m,
        xCentered.slice(0, Math.floor(m / 2)).reduce((a, b) => a + b, 0) / (m / 2),
        xCentered.slice(Math.floor(m / 2)).reduce((a, b) => a + b, 0) / (m / 2),
      ],
      obiSpectral: xCentered.reduce((a, b) => a + b, 0) / m,
    };
  }

  const obiSpectral = projections[0] ?? 0;
  return { projections, obiSpectral };
}

/**
 * Calcula OBI espectral ponderado por varianza explicada
 */
export function calculateOBISpectral(projections: number[], eigenvalues: number[]): number {
  if (eigenvalues.length < 3 || projections.length < 3) return 0;
  const varianceTotal = eigenvalues.slice(0, 3).reduce((a, b) => a + b, 0);
  if (varianceTotal === 0) return 0;
  const weights = eigenvalues.slice(0, 3).map((ev) => ev / varianceTotal);
  return projections.reduce((sum, proj, i) => sum + proj * (weights[i] || 0), 0);
}
