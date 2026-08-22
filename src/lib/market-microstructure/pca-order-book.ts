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

/**
 * Aplica PCA a la matriz de covarianza del order book
 * Los autovectores representan los 'modos' de desequilibrio dominantes
 */
export function pcaOrderBook(
  orderBookHistory: OrderBookSnapshot[],
  nLevels: number = 10
): PCAResult | null {
  if (orderBookHistory.length < 100) {
    return null;
  }

  const historySize = Math.min(orderBookHistory.length, 500);
  
  // Construir matriz de features: [bid_vol_1, ..., bid_vol_N, ask_vol_1, ..., ask_vol_N]
  const features: number[][] = [];
  
  for (const snap of orderBookHistory.slice(-historySize)) {
    const bids = Array.from({ length: nLevels }, (_, i) => 
      snap.bids[i]?.[1] || 0
    );
    const asks = Array.from({ length: nLevels }, (_, i) => 
      snap.asks[i]?.[1] || 0
    );
    features.push([...bids, ...asks]);
  }

  const X = features;
  const n = X.length;
  const m = X[0].length;

  // Centrar datos
  const means = Array.from({ length: m }, () => 0);
  for (let j = 0; j < m; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += X[i][j];
    }
    means[j] = sum / n;
  }

  const XCentered = X.map(row => 
    row.map((val, j) => val - means[j])
  );

  // Calcular matriz de covarianza
  const covMatrix: number[][] = Array.from({ length: m }, () => 
    Array.from({ length: m }, () => 0)
  );

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += XCentered[k][i] * XCentered[k][j];
      }
      covMatrix[i][j] = sum / (n - 1);
    }
  }

  // Descomposición espectral (usando método de potencia para autovalores dominantes)
  const eigenvalues = powerIteration(covMatrix, 3);
  const totalVariance = eigenvalues.reduce((a, b) => a + b, 0);
  const explainedVariance = eigenvalues.map(ev => ev / totalVariance);

  // Detectar régimen basado en varianza explicada del primer modo
  const regimenRatio = explainedVariance[0];
  let regimen: PCAResult["regimen"];
  
  if (regimenRatio > 0.65) {
    regimen = "ESTRUCTURADO";
  } else if (regimenRatio > 0.45) {
    regimen = "MIXTO";
  } else {
    regimen = "RUIDOSO";
  }

  return {
    eigenvalues,
    eigenvectors: [], // Simplificado para esta implementación
    explainedVariance,
    regimen,
    regimenRatio
  };
}

/**
 * Método de potencia iterativo para calcular los k autovalores más grandes
 */
function powerIteration(matrix: number[][], k: number): number[] {
  const n = matrix.length;
  const eigenvalues: number[] = [];
  let currentMatrix = matrix.map(row => [...row]);

  for (let iter = 0; iter < k; iter++) {
    let vector = Array.from({ length: n }, () => Math.random());
    
    // Normalizar
    const norm = Math.sqrt(vector.reduce((a, b) => a + b * b, 0));
    vector = vector.map(v => v / norm);

    // Iteración de potencia
    for (let _ = 0; _ < 100; _++) {
      const newVector = Array.from({ length: n }, () => 0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          newVector[i] += currentMatrix[i][j] * vector[j];
        }
      }
      
      const newNorm = Math.sqrt(newVector.reduce((a, b) => a + b * b, 0));
      vector = newVector.map(v => v / newNorm);
    }

    // Calcular autovalor (Rayleigh quotient)
    let eigenvalue = 0;
    for (let i = 0; i < n; i++) {
      let Av_i = 0;
      for (let j = 0; j < n; j++) {
        Av_i += currentMatrix[i][j] * vector[j];
      }
      eigenvalue += vector[i] * Av_i;
    }

    eigenvalues.push(eigenvalue);

    // Deflación para obtener siguiente autovalor
    if (iter < k - 1) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          currentMatrix[i][j] -= eigenvalue * vector[i] * vector[j];
        }
      }
    }
  }

  return eigenvalues;
}

/**
 * Proyecta el estado actual del order book sobre los autovectores dominantes
 * La proyección sobre el primer autovector es el 'OBI estructural'
 */
export function projectSnapshot(
  snapshot: OrderBookSnapshot,
  orderBookHistory: OrderBookSnapshot[],
  nLevels: number = 10
): OBIProjection | null {
  if (orderBookHistory.length < 50) {
    return null;
  }

  const historySize = Math.min(orderBookHistory.length, 500);
  
  // Extraer vector actual
  const bids = Array.from({ length: nLevels }, (_, i) => 
    snapshot.bids[i]?.[1] || 0
  );
  const asks = Array.from({ length: nLevels }, (_, i) => 
    snapshot.asks[i]?.[1] || 0
  );
  const x = [...bids, ...asks];

  // Calcular media histórica
  const features: number[][] = [];
  for (const snap of orderBookHistory.slice(-historySize)) {
    const b = Array.from({ length: nLevels }, (_, i) => 
      snap.bids[i]?.[1] || 0
    );
    const a = Array.from({ length: nLevels }, (_, i) => 
      snap.asks[i]?.[1] || 0
    );
    features.push([...b, ...a]);
  }

  const m = x.length;
  const means = Array.from({ length: m }, () => 0);
  for (let j = 0; j < m; j++) {
    let sum = 0;
    for (let i = 0; i < features.length; i++) {
      sum += features[i][j];
    }
    means[j] = sum / features.length;
  }

  const xCentered = x.map((val, j) => val - means[j]);

  // Simplificación: usar primeras 3 componentes principales como proyecciones
  // En una implementación completa, usaríamos los autovectores reales de PCA
  const projections = [
    xCentered.reduce((a, b) => a + b, 0) / m,
    xCentered.slice(0, Math.floor(m/2)).reduce((a, b) => a + b, 0) / (m/2),
    xCentered.slice(Math.floor(m/2)).reduce((a, b) => a + b, 0) / (m/2)
  ];

  const obiSpectral = projections[0]; // Primera componente como OBI espectral

  return { projections, obiSpectral };
}

/**
 * Calcula OBI espectral ponderado por varianza explicada
 */
export function calculateOBISpectral(
  projections: number[],
  eigenvalues: number[]
): number {
  if (eigenvalues.length < 3 || projections.length < 3) {
    return 0;
  }

  const varianceTotal = eigenvalues.slice(0, 3).reduce((a, b) => a + b, 0);
  if (varianceTotal === 0) return 0;

  const weights = eigenvalues.slice(0, 3).map(ev => ev / varianceTotal);
  const obiSpectral = projections.reduce((sum, proj, i) => 
    sum + proj * (weights[i] || 0), 0
  );

  return obiSpectral;
}
