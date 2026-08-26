// Puente hacia el scanner Python SCANNER_INTERMARKET/estado_actual.json.
// Lee el snapshot en vivo (fase Pring/Murphy, ratios, crédito, VIX, noticias)
// y permite disparar un scan bajo demanda.
// Ruta configurable vía env SCANNER_STATE_PATH.

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type SenalNivel = "ALERTA" | "WARN" | "INFO";
export type EstadoScanner = {
  vivo: boolean;
  edadMin: number | null;
  timestamp: string | null;
  fase: { num: number | null; name: string | null; conf: string | null; desc: string | null } | null;
  ratios: Array<{ id: string; desc: string; tend: number | null; roc63: number | null; ma: string | null; nuevo_cruce: boolean }>;
  credito: { IG: { pct: number | null; nivel: string | null } | null; HY: { pct: number | null; nivel: string | null } | null } | null;
  vix: { valor: number | null; nivel: string | null } | null;
  noticias: Array<{ cluster: string; neto: number }>;
  eventos: Array<{ ticker: string; fecha: string; faltan_dias: number; eps_est: number | null; beat_rate_8q: string | null }>;
  senales: Array<{ nivel: SenalNivel; tipo: string; id: string; sentido: string; texto: string }>;
  errores: string[];
};

function rutaEstado(): string {
  const custom = process.env.SCANNER_STATE_PATH?.trim();
  if (custom) return resolve(custom);
  // La app vive en electric-finance-aesthetic-main/electric-finance-aesthetic-main/
  // el scanner está en ../../SCANNER_INTERMARKET/estado_actual.json
  return resolve(process.cwd(), "..", "SCANNER_INTERMARKET", "estado_actual.json");
}

export function leerEstado(): EstadoScanner | null {
  const p = rutaEstado();
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    return normalizar(raw);
  } catch {
    return null;
  }
}

function normalizar(raw: any): EstadoScanner {
  const ts: string | null = raw.timestamp_utc ?? raw.timestamp ?? null;
  let edadMin: number | null = null;
  let vivo = false;
  if (ts) {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
      edadMin = Math.round((Date.now() - d.getTime()) / 60_000);
      vivo = edadMin < 45;
    }
  }
  return {
    vivo,
    edadMin,
    timestamp: ts,
    fase: raw.fase
      ? { num: raw.fase.num ?? null, name: raw.fase.name ?? null, conf: raw.fase.conf ?? null, desc: raw.fase.desc ?? null }
      : null,
    ratios: Array.isArray(raw.ratios) ? raw.ratios : [],
    credito: raw.credito
      ? { IG: raw.credito.IG ?? null, HY: raw.credito.HY ?? null }
      : null,
    vix: raw.vix ? { valor: raw.vix.valor ?? null, nivel: raw.vix.nivel ?? null } : null,
    noticias: Array.isArray(raw.noticias) ? raw.noticias : [],
    eventos: Array.isArray(raw.eventos) ? raw.eventos : [],
    senales: Array.isArray(raw.senales_activas) ? raw.senales_activas : [],
    errores: Array.isArray(raw.errores) ? raw.errores : [],
  };
}

export function dispararScan(timeoutMs = 120_000): Promise<EstadoScanner | null> {
  return new Promise((resolveP) => {
    const dir = join(rutaEstado(), "..");
    const py = process.env.PYTHON ?? "python";
    execFile(py, ["scanner.py", "--quiet"], { cwd: dir, timeout: timeoutMs }, () => {
      resolveP(leerEstado());
    });
  });
}

export function formatearEstadoTexto(s: EstadoScanner): string {
  const lineas: string[] = [];
  lineas.push(`SCANNER INTERMARKET — ${s.fase ? `${s.fase.num}. ${s.fase.name} (conf ${s.fase.conf})` : "fase S/D"}${s.vivo ? "" : " [STALE " + (s.edadMin ?? "?") + " min]"}`);
  if (s.fase?.desc) lineas.push(`Perfil: ${s.fase.desc}`);
  for (const r of s.ratios) {
    const flecha = r.tend === 1 ? "↑" : r.tend === -1 ? "↓" : r.tend === 0 ? "→" : "?";
    const cruce = r.nuevo_cruce ? " ◀︎ cruce nuevo" : "";
    lineas.push(`- ${r.id} ${flecha} ${r.desc} ROC63 ${r.roc63 != null ? (r.roc63 >= 0 ? "+" : "") + r.roc63 + "%" : "s/d"} MA ${r.ma ?? "?"}${cruce}`);
  }
  if (s.credito) {
    const ig = s.credito.IG ? `IG ${s.credito.IG.pct ?? "?"}% [${s.credito.IG.nivel ?? "?"}]` : "IG s/d";
    const hy = s.credito.HY ? `HY ${s.credito.HY.pct ?? "?"}% [${s.credito.HY.nivel ?? "?"}]` : "HY s/d";
    lineas.push(`Crédito: ${ig} | ${hy}`);
  }
  if (s.vix) lineas.push(`VIX ${s.vix.valor ?? "?"} [${s.vix.nivel ?? "?"}]`);
  if (s.noticias.length) {
    lineas.push(`Noticias neto: ${s.noticias.reduce((a, n) => a + (n.neto ?? 0), 0)} (${s.noticias.map((n) => `${n.cluster}:${n.neto >= 0 ? "+" : ""}${n.neto}`).join(", ")})`);
  }
  if (s.eventos.length) {
    lineas.push(`Próximos earnings: ${s.eventos.map((e) => `${e.ticker} ${e.fecha} (${e.faltan_dias}d)`).join(", ")}`);
  }
  if (s.senales.length) {
    lineas.push(`Señales activas (${s.senales.length}):`);
    for (const sig of s.senales) {
      const emoji = sig.nivel === "ALERTA" ? "🔴" : sig.nivel === "WARN" ? "🟡" : "⚪";
      lineas.push(` ${emoji} [${sig.nivel}] ${sig.tipo}/${sig.id}: ${sig.texto}`);
    }
  } else {
    lineas.push("Sin señales activas nuevas.");
  }
  if (s.errores.length) lineas.push(`Errores: ${s.errores.join(" | ")}`);
  lineas.push(`Generado: ${s.timestamp ?? "?"}`);
  return lineas.join("\n");
}
