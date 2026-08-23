/**
 * Labadié — Spectral Theory / PCA (spectral_theory-1.pdf)
 * Self-adjoint operators, eigenvalues reales, eigenvectors ortogonales, T=Σ λ P_λ
 * Aplicado a Markowitz: filtrado espectral de Σ = PDPᵀ, clipping eigenvalues ruido
 */

// Jacobi para simétrica N≤20 (suficiente para matriz sectores/portafolio)
function jacobiEigen(A: number[][], maxIter = 200, eps = 1e-10): { values: number[]; vectors: number[][] } {
  const n = A.length;
  const V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const B = A.map((r) => [...r]);
  for (let iter = 0; iter < maxIter; iter++) {
    let p = 0, q = 1, max = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Math.abs(B[i][j]) > max) { max = Math.abs(B[i][j]); p = i; q = j; }
    if (max < eps) break;
    const theta = 0.5 * Math.atan2(2 * B[p][q], B[q][q] - B[p][p]);
    const c = Math.cos(theta), s = Math.sin(theta);
    const Bpp = c * c * B[p][p] - 2 * s * c * B[p][q] + s * s * B[q][q];
    const Bqq = s * s * B[p][p] + 2 * s * c * B[p][q] + c * c * B[q][q];
    const Bpq = 0;
    for (let r = 0; r < n; r++) if (r !== p && r !== q) {
      const Brp = c * B[r][p] - s * B[r][q];
      const Brq = s * B[r][p] + c * B[r][q];
      B[r][p] = B[p][r] = Brp;
      B[r][q] = B[q][r] = Brq;
    }
    B[p][p] = Bpp; B[q][q] = Bqq; B[p][q] = B[q][p] = Bpq;
    for (let r = 0; r < n; r++) {
      const Vrp = c * V[r][p] - s * V[r][q];
      const Vrq = s * V[r][p] + c * V[r][q];
      V[r][p] = Vrp; V[r][q] = Vrq;
    }
  }
  const values = B.map((_, i) => B[i][i]);
  // ordenar descendente por valor absoluto
  const idx = values.map((_, i) => i).sort((a, b) => values[b] - values[a]);
  return { values: idx.map((i) => values[i]), vectors: idx.map((i) => V.map((row) => row[i])) };
}

export function eigenDecomposition(cov: number[][]): { values: number[]; vectors: number[][] } {
  if (cov.length === 0 || cov.length !== cov[0]?.length) return { values: [], vectors: [] };
  return jacobiEigen(cov);
}

// Filtra eigenvalues por Marchenko-Pastur λ+ = σ²(1+√(N/T))²
// T = observaciones, N = activos
export function clipCovariance(cov: number[][], T: number): { filtered: number[][]; values: number[]; clippedValues: number[] } {
  const n = cov.length;
  const { values, vectors } = eigenDecomposition(cov);
  const q = n / Math.max(1, T);
  // estimar sigma² como mediana de values inferiores
  const sigma2 = values.length > 2 ? values[Math.floor(values.length / 2)] : values[0] ?? 1;
  const lambdaPlus = sigma2 * Math.pow(1 + Math.sqrt(q), 2);
  const clipped = values.map((v) => (v < lambdaPlus ? lambdaPlus : v));
  // reconstruir Σ_filt = V · diag(clipped) · Vᵀ
  const filtered: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += vectors[k][i] * clipped[k] * vectors[k][j];
    filtered[i][j] = s;
  }
  return { filtered, values, clippedValues: clipped };
}

// Eigen-portfolios: peso ∝ eigenvector / volatilidad
export function eigenPortfolio(vector: number[], vol?: number[]): number[] {
  const w = vol ? vector.map((v, i) => v / Math.max(0.01, vol[i] ?? 1)) : [...vector];
  const sum = w.reduce((s, v) => s + Math.abs(v), 0) || 1;
  return w.map((v) => v / sum);
}
