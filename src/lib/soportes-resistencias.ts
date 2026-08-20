/** Detección de niveles de soporte y resistencia por pivotes y agrupamiento.
 *  Puro (sin red): se usa desde el motor del semáforo técnico. */

export interface SoportesResistencias {
  /** Niveles de soporte (por debajo del precio), ordenados del más cercano al más lejano. */
  soportes: number[];
  /** Niveles de resistencia (por encima del precio), ordenados del más cercano al más lejano. */
  resistencias: number[];
  soporteCercano: number | null;
  resistenciaCercana: number | null;
  precioActual: number | null;
  high52: number | null;
  low52: number | null;
  cantidadPivotes: number;
  metodo: string;
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

function redondear(x: number): number {
  return Math.round(x * 100) / 100;
}

function limpiar(closes: number[]): number[] {
  return closes.filter((c): c is number => typeof c === "number" && isFinite(c) && c > 0);
}

/** Índices donde el precio es máximo/mínimo local dentro de ±window. */
function pivotes(closes: number[], window: number): { altos: number[]; bajos: number[] } {
  const n = closes.length;
  const altos: number[] = [];
  const bajos: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = closes[i];
    if (c == null) continue;
    const desde = Math.max(0, i - window);
    const hasta = Math.min(n - 1, i + window);
    let esMax = true;
    let esMin = true;
    for (let j = desde; j <= hasta; j++) {
      const cj = closes[j];
      if (cj == null) continue;
      if (cj > c) esMax = false;
      if (cj < c) esMin = false;
      if (!esMax && !esMin) break;
    }
    if (esMax) altos.push(i);
    if (esMin) bajos.push(i);
  }
  return { altos, bajos };
}

/** Agrupa niveles dentro de la tolerancia porcentual y devuelve el promedio de cada grupo. */
function agruparNiveles(levels: number[], tolerancia: number): number[] {
  const ordenados = [...new Set(levels.map(redondear))].sort((a, b) => a - b);
  const grupos: number[][] = [];
  for (const v of ordenados) {
    let encajado = false;
    for (const g of grupos) {
      const prom = g.reduce((s, x) => s + x, 0) / g.length;
      if (Math.abs(v - prom) <= tolerancia * prom) {
        g.push(v);
        encajado = true;
        break;
      }
    }
    if (!encajado) grupos.push([v]);
  }
  return grupos.map((g) => redondear(g.reduce((s, x) => s + x, 0) / g.length));
}

/** Analiza soportes y resistencias de una serie de precios de cierre.
 *  - window: vecindad para detectar máximos/mínimos locales (default 5).
 *  - tolerancia: % para agrupar niveles cercanos (default 2%).
 *  - high52 / low52: extremos de 52 semanas (opcionales, para contexto). */
export function analizarSoportesResistencias(
  hist: number[],
  window = 5,
  tolerancia = 0.02,
  high52: number | null = null,
  low52: number | null = null,
): SoportesResistencias {
  const closes = limpiar(hist);
  const n = closes.length;
  const precio = n ? (closes[n - 1] ?? null) : null;
  const base = {
    soportes: [],
    resistencias: [],
    soporteCercano: null,
    resistenciaCercana: null,
    precioActual: precio,
    high52,
    low52,
    cantidadPivotes: 0,
    metodo: "sin datos suficientes",
  };
  if (!precio || n < window * 2 + 2) return base;

  const { altos, bajos } = pivotes(closes, window);
  const nivelesAltos = agruparNiveles(
    altos.map((i) => closes[i] ?? NaN).filter((x) => isFinite(x)),
    tolerancia,
  );
  const nivelesBajos = agruparNiveles(
    bajos.map((i) => closes[i] ?? NaN).filter((x) => isFinite(x)),
    tolerancia,
  );

  // Un nivel pivote sirve de soporte si quedó por debajo del precio, y de
  // resistencia si quedó por encima.
  const candidatosSoporte = [...nivelesBajos, ...nivelesAltos]
    .filter((v) => v < precio * (1 - tolerancia))
    .sort((a, b) => b - a);
  const candidatosResistencia = [...nivelesAltos, ...nivelesBajos]
    .filter((v) => v > precio * (1 + tolerancia))
    .sort((a, b) => a - b);

  const soportes = candidatosSoporte.slice(0, 3);
  const resistencias = candidatosResistencia.slice(0, 3);

  return {
    soportes,
    resistencias,
    soporteCercano: soportes.length ? (soportes[0] ?? null) : null,
    resistenciaCercana: resistencias.length ? (resistencias[0] ?? null) : null,
    precioActual: precio,
    high52,
    low52,
    cantidadPivotes: altos.length + bajos.length,
    metodo: `pivotes (ventana ${window}) agrupados con tolerancia ${Math.round(
      tolerancia * 100,
    )}%`,
  };
}

/** Distancia relativa de un nivel al precio actual (0 si no hay nivel). */
export function distanciaNivel(precio: number | null, nivel: number | null): number | null {
  if (precio == null || nivel == null || precio <= 0) return null;
  return clamp((nivel - precio) / precio, -1, 1);
}
