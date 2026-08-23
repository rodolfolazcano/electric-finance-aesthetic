/**
 * Histórico en disco con merge incremental.
 * Almacena series completas por símbolo en .data/historico/*.json.
 * Estrategia: carga completa desde disco (instantánea) y solo fetchea
 * el delta (últimos días) para actualizar lo que falta.
 * Evita re-descargar todo el histórico en cada request.
 */
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";

type Vela = { t: number; o: number | null; h: number | null; l: number | null; c: number | null; v: number | null };

interface HistoricoArchivo {
  simbolo: string;
  intervalo: string;
  actualizadoEn: number;
  meta?: unknown;
  velas: Vela[];
}

function baseDir(): string {
  // TanStack Start / Vite: cwd es la raíz del proyecto
  return path.join(process.cwd(), ".data", "historico");
}

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
}

function rutaArchivo(simbolo: string, intervalo: string): string {
  return path.join(baseDir(), `${safeName(simbolo.toUpperCase())}__${safeName(intervalo)}.json`);
}

// TTL por intervalo: cuánto puede estar sin refrescar antes de pedir delta
function stalenessMs(intervalo: string): number {
  const iv = intervalo.trim();
  // intradía → 4 min, diario/semanal → 20 min
  if (/^(1m|2m|5m|15m|30m|60m|90m|1h)$/.test(iv)) return 4 * 60 * 1000;
  return 20 * 60 * 1000;
}

// Yahoo chart JSON → velas
function extraerVelas(chartJson: unknown): { velas: Vela[]; meta: unknown } {
  const c = chartJson as Record<string, unknown>;
  const chart = (c["chart"] as Record<string, unknown> | undefined);
  const result = (chart?.["result"] as Array<Record<string, unknown>> | undefined);
  const r = result?.[0] as { timestamp?: number[]; indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }> }; meta?: unknown } | undefined;
  const ts: number[] = r?.timestamp ?? [];
  const q = r?.indicators?.quote?.[0];
  const velas: Vela[] = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]!;
    const c = (q?.close?.[i] ?? null) as number | null;
    // descartar velas totalmente vacías (Yahoo pone nulls en fines de semana)
    if (c == null && q?.open?.[i] == null) continue;
    velas.push({
      t,
      o: (q?.open?.[i] ?? null) as number | null,
      h: (q?.high?.[i] ?? null) as number | null,
      l: (q?.low?.[i] ?? null) as number | null,
      c,
      v: (q?.volume?.[i] ?? null) as number | null,
    });
  }
  // ordenar por timestamp asc
  velas.sort((a, b) => a.t - b.t);
  return { velas, meta: r?.meta ?? null };
}

function jsonDesdeVelas(velas: Vela[], meta: unknown): unknown {
  const ts = velas.map((v) => v.t);
  return {
    chart: {
      result: [
        {
          meta: meta ?? {},
          timestamp: ts,
          indicators: {
            quote: [
              {
                open: velas.map((v) => v.o),
                high: velas.map((v) => v.h),
                low: velas.map((v) => v.l),
                close: velas.map((v) => v.c),
                volume: velas.map((v) => v.v),
              },
            ],
            adjclose: [{ adjclose: velas.map((v) => v.c) }],
          },
        },
      ],
      error: null,
    },
  };
}

function fusionar(previas: Vela[], nuevas: Vela[]): Vela[] {
  const m = new Map<number, Vela>();
  for (const v of previas) m.set(v.t, v);
  for (const v of nuevas) {
    const ex = m.get(v.t);
    // si ya existía, actualizar con lo nuevo (corrige splits/ajustes)
    if (ex) {
      m.set(v.t, { t: v.t, o: v.o ?? ex.o, h: v.h ?? ex.h, l: v.l ?? ex.l, c: v.c ?? ex.c, v: v.v ?? ex.v });
    } else {
      m.set(v.t, v);
    }
  }
  const out = [...m.values()].sort((a, b) => a.t - b.t);
  return out;
}

async function leerArchivo(simbolo: string, intervalo: string): Promise<HistoricoArchivo | null> {
  try {
    const raw = await readFile(rutaArchivo(simbolo, intervalo), "utf-8");
    const j = JSON.parse(raw) as HistoricoArchivo;
    if (!Array.isArray(j.velas)) return null;
    return j;
  } catch {
    return null;
  }
}

async function escribirArchivo(data: HistoricoArchivo): Promise<void> {
  const dir = baseDir();
  await mkdir(dir, { recursive: true });
  const dest = rutaArchivo(data.simbolo, data.intervalo);
  const tmp = `${dest}.tmp.${Date.now()}`;
  await writeFile(tmp, JSON.stringify(data), "utf-8");
  await rename(tmp, dest);
}

/**
 * Rango delta pequeño para traer solo lo reciente y mergear.
 * Para intervalo diario/semanal → 1mo alcanza para ~20 velas nuevas.
 * Intradía → 5d (máx que Yahoo da para 1m/5m).
 */
function rangoDelta(intervalo: string): { range: string; interval: string } {
  const iv = intervalo.trim();
  if (/^(1m|2m|5m|15m|30m)$/.test(iv)) return { range: "5d", interval: iv };
  if (/^(60m|90m|1h)$/.test(iv)) return { range: "5d", interval: iv };
  if (iv === "1wk") return { range: "3mo", interval: "1wk" };
  if (iv === "1mo") return { range: "1y", interval: "1mo" };
  return { range: "1mo", interval: "1d" };
}

/**
 * Lee histórico desde disco si está fresco; si no, fetchea solo el delta,
 * mergea, persiste y devuelve JSON en formato Yahoo chart.
 *
 * yahooFetcher: (range, interval) => Promise<chartJson>
 */
export async function obtenerChartConDisco(
  simbolo: string,
  rangoPedido: string,
  intervaloPedido: string,
  yahooFetcher: (range: string, interval: string) => Promise<unknown>,
): Promise<unknown> {
  const intervalo = intervaloPedido || "1d";
  const rango = rangoPedido || "1y";

  // Casos que siempre requieren fetch completo: 1d/5d o range desconocido muy corto
  const esRangoCorto = /^(1d|5d)$/.test(rango);
  if (esRangoCorto) {
    const fresh = await yahooFetcher(rango, intervalo);
    // también persistir como snapshot si es diario
    try {
      const { velas, meta } = extraerVelas(fresh);
      if (velas.length) await escribirArchivo({ simbolo: simbolo.toUpperCase(), intervalo, actualizadoEn: Date.now(), meta, velas });
    } catch { /* no bloquea */ }
    return fresh;
  }

  const arch = await leerArchivo(simbolo, intervalo);
  const ahora = Date.now();
  const fresco = arch != null && ahora - arch.actualizadoEn < stalenessMs(intervalo);

  // Rango grande pedido pero disco tiene poco: si el más antiguo en disco es más reciente
  // que el inicio del rango pedido, necesitamos full fetch para cubrir el hueco.
  // Heurística simple: si rango es max/5y/2y y disco tiene < 400 velas diarias → full.
  const necesitaFullPorCobertura =
    arch != null &&
    /^(max|5y|2y)$/.test(rango) &&
    arch.velas.length > 0 &&
    arch.velas.length < (rango === "5y" ? 1200 : rango === "2y" ? 500 : 300);

  if (fresco && !necesitaFullPorCobertura && arch!.velas.length > 20) {
    return jsonDesdeVelas(arch!.velas, arch!.meta);
  }

  // Si no hay archivo o necesita cobertura completa → fetch del rango pedido entero
  if (!arch || necesitaFullPorCobertura) {
    try {
      const fresh = await yahooFetcher(rango, intervalo);
      const { velas, meta } = extraerVelas(fresh);
      if (velas.length) await escribirArchivo({ simbolo: simbolo.toUpperCase(), intervalo, actualizadoEn: Date.now(), meta, velas });
      return fresh;
    } catch (e) {
      if (arch?.velas.length) return jsonDesdeVelas(arch.velas, arch.meta);
      throw e;
    }
  }

  // Archivo existe pero está stale → delta merge
  const delta = rangoDelta(intervalo);
  try {
    const freshDelta = await yahooFetcher(delta.range, delta.interval);
    const { velas: velasDelta, meta: metaDelta } = extraerVelas(freshDelta);
    if (!velasDelta.length) return jsonDesdeVelas(arch.velas, arch.meta);
    const merged = fusionar(arch.velas, velasDelta);
    const meta = metaDelta ?? arch.meta;
    await escribirArchivo({ simbolo: simbolo.toUpperCase(), intervalo, actualizadoEn: Date.now(), meta, velas: merged });
    // Si el pedido era un rango acotado menor que el total (ej. 6mo existiendo 5y),
    // recortar a las últimas N velas aproximadas en vez de devolver todo.
    // Por simplicidad devolvemos todo; el llamador (chart) ya recorta por rango visual.
    return jsonDesdeVelas(merged, meta);
  } catch {
    // fallo de red en delta → servir disco
    return jsonDesdeVelas(arch.velas, arch.meta);
  }
}

export function __testOnly__fusionar(a: Vela[], b: Vela[]): Vela[] {
  return fusionar(a, b);
}
