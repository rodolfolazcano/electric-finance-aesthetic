/**
 * Estado persistente del bot en .data/bot-unificado/:
 *  - config.json: configuración activa (estrategias on/off, frecuencias, límites)
 *  - historial.json: señales enviadas para dedupe por cooldown
 *  - ciclos.json: últimos ciclos corridos (auditoría)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { ESTRATEGIAS } from "./estrategias";
import type {
  ConfigBotUnificado,
  ConfigEstrategiaBot,
  RegistroCiclo,
  RegistroSenalEnviada,
  ResultadoCiclo,
} from "./tipos";

const DIR = path.join(process.cwd(), ".data", "bot-unificado");
const CONFIG_FILE = path.join(DIR, "config.json");
const HISTORIAL_FILE = path.join(DIR, "historial.json");
const CICLOS_FILE = path.join(DIR, "ciclos.json");
const ULTIMA_FILE = path.join(DIR, "ultima-corrida.json");

function configPorDefecto(): ConfigBotUnificado {
  const estrategias: ConfigEstrategiaBot[] = ESTRATEGIAS.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    descripcion: e.descripcion,
    fuenteAcademica: e.fuenteAcademica,
    activa: true,
    cadaMinutos: e.cadaMinutos,
    desde: e.desde ?? null,
    hasta: e.hasta ?? null,
  }));
  return {
    activo: true,
    telegramEnviar: true,
    maxSenalesPorCiclo: 4,
    cooldownHoras: 20,
    probMinimaEnvio: 0.54,
    estrategias,
    actualizadaEn: new Date().toISOString(),
  };
}

async function leerJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function escribirJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
}

export async function cargarConfig(): Promise<ConfigBotUnificado> {
  const guardada = await leerJson<Partial<ConfigBotUnificado>>(CONFIG_FILE, {});
  const base = configPorDefecto();
  // Merge tolerante: las estrategias nuevas del código aparecen aunque la config sea vieja.
  const estrategias = base.estrategias.map((defecto) => {
    const previa = guardada.estrategias?.find((e) => e.id === defecto.id);
    return previa ? { ...defecto, ...previa } : defecto;
  });
  return {
    ...base,
    ...guardada,
    estrategias,
    actualizadaEn: guardada.actualizadaEn ?? new Date().toISOString(),
  };
}

export async function guardarConfig(config: ConfigBotUnificado): Promise<void> {
  await escribirJson(CONFIG_FILE, { ...config, actualizadaEn: new Date().toISOString() });
}

export async function cargarHistorial(): Promise<RegistroSenalEnviada[]> {
  const h = await leerJson<{ senales: RegistroSenalEnviada[] }>(HISTORIAL_FILE, { senales: [] });
  // Poda: conservar solo últimos 7 días
  const corte = Date.now() - 7 * 24 * 3600 * 1000;
  return (h.senales ?? []).filter((s) => new Date(s.fecha).getTime() > corte);
}

export async function registrarSenales(registros: RegistroSenalEnviada[]): Promise<void> {
  if (!registros.length) return;
  const previas = await cargarHistorial();
  await escribirJson(HISTORIAL_FILE, { senales: [...previas, ...registros].slice(-500) });
}

/** Devuelve true si la señal NO fue enviada dentro del cooldown (y debe enviarse). */
export async function fueraDeCooldown(
  ticker: string,
  direccion: string,
  estrategia: string,
  cooldownHoras: number,
): Promise<boolean> {
  const historial = await cargarHistorial();
  const corte = Date.now() - cooldownHoras * 3600 * 1000;
  return !historial.some(
    (s) => s.ticker === ticker && s.direccion === direccion && s.estrategia === estrategia && new Date(s.fecha).getTime() > corte,
  );
}

export async function registrarCiclo(ciclo: RegistroCiclo): Promise<void> {
  const previos = await leerJson<{ ciclos: RegistroCiclo[] }>(CICLOS_FILE, { ciclos: [] });
  const lista = [ciclo, ...(previos.ciclos ?? [])].slice(0, 60);
  await escribirJson(CICLOS_FILE, { ciclos: lista });
}

export async function cargarCiclos(): Promise<RegistroCiclo[]> {
  const c = await leerJson<{ ciclos: RegistroCiclo[] }>(CICLOS_FILE, { ciclos: [] });
  return c.ciclos ?? [];
}

/** Mapa estrategia → ISO de última corrida (para respetar frecuencias). */
export async function cargarUltimaCorrida(): Promise<Record<string, string>> {
  return leerJson<Record<string, string>>(ULTIMA_FILE, {});
}

export async function guardarUltimaCorrida(map: Record<string, string>): Promise<void> {
  await escribirJson(ULTIMA_FILE, map);
}

export async function registrarResultadoCompleto(resultado: ResultadoCiclo, enviadas: number): Promise<void> {
  await registrarSenales(
    resultado.senales.map((s) => ({
      ticker: s.tickerBCBA,
      direccion: s.senal.startsWith("COMPRA") ? "COMPRA" : s.senal.startsWith("VENTA") || s.senal === "REDUCIR" ? "VENTA" : "NEUTRAL",
      estrategia: s.estrategia,
      prob: s.confianza,
      fecha: new Date().toISOString(),
    })),
  );
  await registrarCiclo({
    fecha: resultado.iniciadoEn,
    disparo: resultado.disparo,
    estrategias: resultado.estrategiasCorridas,
    candidatos: resultado.candidatos,
    enviadas,
    ok: resultado.errores.length === 0,
    error: resultado.errores[0],
  });
}
