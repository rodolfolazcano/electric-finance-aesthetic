/**
 * Precios de renta fija persistidos (.data/renta-fija/precios.json).
 *
 * Patrón "recalcular a diario con la cotización": cada vez que se obtiene un
 * precio en vivo (chat o cron) se persiste acá; si IOL no responde después,
 * el motor de TIR usa el último cierre conocido informando su fecha.
 * Mismo patrón FS que .data/senales y .norte-memoria.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), ".data", "renta-fija");
const ARCHIVO = path.join(DIR, "precios.json");

export type EntradaPrecio = {
  ticker: string;
  precio: number;
  moneda: string;
  /** Fecha del precio (YYYY-MM-DD): hoy = en vivo; anterior = último cierre. */
  fecha: string;
  timestamp: string;
  fuente: string;
};

let cacheMemoria: Record<string, EntradaPrecio> | null = null;
let cargaIniciada = false;

export function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function leerPrecios(): Promise<Record<string, EntradaPrecio>> {
  if (cacheMemoria) return cacheMemoria;
  if (!cargaIniciada) {
    cargaIniciada = true;
    try {
      const raw = await fs.readFile(ARCHIVO, "utf-8");
      const j = JSON.parse(raw) as Record<string, EntradaPrecio>;
      if (j && typeof j === "object") cacheMemoria = j;
    } catch {
      /* sin archivo previo */
    }
  }
  if (!cacheMemoria) cacheMemoria = {};
  return cacheMemoria;
}

/** Upsert de un precio (memoria + disco). Nunca lanza: el flujo sigue igual. */
export async function guardarPrecio(e: EntradaPrecio): Promise<void> {
  const todos = await leerPrecios();
  todos[e.ticker.toUpperCase()] = e;
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(ARCHIVO, JSON.stringify(todos, null, 1), "utf-8");
  } catch {
    /* sin persistencia: queda en memoria del proceso */
  }
}
