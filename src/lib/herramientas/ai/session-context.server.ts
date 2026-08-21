// SessionContext — caché server-side que evita re-explorar lo ya visto.
// Se mantiene en memoria volátil del server por sessionId.

import type { ToolCallTrace } from "@/lib/types";

export type CacheEntry = {
  hash: string;
  resumen: string;
  timestamp: number;
};

export class SessionContext {
  private archivos = new Map<string, CacheEntry>();
  private supabase = new Map<string, CacheEntry>();
  private web = new Map<string, CacheEntry>();
  private sandbox = new Map<string, CacheEntry>();
  private ultimaExploracionFS = 0;

  // TTL en ms para datos de mercado (se re-consultan siempre)
  private static MARKET_TTL = 120_000; // 2 min

  // Palabras que identifican datos de mercado (siempre se re-consultan)
  private static MARKET_KEYWORDS = ["precio", "cotizacion", "ticker", "ars", "mep", "usd", "dolar", "valor de mercado"];

  private esMercado(key: string, entry: CacheEntry): boolean {
    const text = `${key} ${entry.resumen}`.toLowerCase();
    return SessionContext.MARKET_KEYWORDS.some(kw => text.includes(kw));
  }

  private entryExpirada(key: string, entry: CacheEntry): boolean {
    if (!this.esMercado(key, entry)) return false;
    return Date.now() - entry.timestamp > SessionContext.MARKET_TTL;
  }

  private limpiarExpirados() {
    const now = Date.now();
    for (const [key, entry] of this.archivos) {
      if (this.entryExpirada(key, entry)) this.archivos.delete(key);
    }
    for (const [key, entry] of this.supabase) {
      if (this.entryExpirada(key, entry)) this.supabase.delete(key);
    }
  }

  // ─── Getters ───────────────────────────────────────────────────────

  getResumen(): string {
    this.limpiarExpirados();
    const parts: string[] = [];
    if (this.archivos.size) parts.push(`Archivos leídos: ${[...this.archivos.keys()].join(", ")}`);
    if (this.supabase.size) parts.push(`Supabase consultado: ${[...this.supabase.keys()].join(", ")}`);
    if (this.web.size) parts.push(`Web buscado: ${[...this.web.keys()].join(", ")}`);
    if (this.sandbox.size) parts.push(`Sandbox: ${[...this.sandbox.keys()].join(", ")}`);
    return parts.join("\n");
  }

  tieneArchivo(path: string): boolean {
    this.limpiarExpirados();
    return this.archivos.has(path);
  }

  // ─── Registro de herramientas ejecutadas ───────────────────────────

  registrarToolCall(tc: ToolCallTrace) {
    const tool = tc.tool;
    const args = tc.args;
    const now = Date.now();

    try {
      const parsed = JSON.parse(args);
      if (tool === "read_file") {
        const path = parsed.path;
        if (path) this.archivos.set(path, { hash: "", resumen: tc.result.slice(0, 200), timestamp: now });
      } else if (tool === "browse_filesystem") {
        this.ultimaExploracionFS = now;
      } else if (tool === "supabase_storage_text") {
        const path = parsed.path;
        if (path) this.supabase.set(path, { hash: "", resumen: tc.result.slice(0, 200), timestamp: now });
      } else if (tool === "search_web") {
        const q = parsed.query;
        if (q) this.web.set(q, { hash: "", resumen: tc.result.slice(0, 200), timestamp: now });
      } else if (tool === "run_sandbox") {
        this.sandbox.set(`sb_${now}`, { hash: "", resumen: tc.result.slice(0, 200), timestamp: now });
      }
    } catch {}
  }

  // ─── Cacheo explícito ──────────────────────────────────────────────

  cacheArchivo(path: string, contenido: string) {
    this.archivos.set(path, {
      hash: simpleHash(contenido),
      resumen: contenido.slice(0, 300),
      timestamp: Date.now(),
    });
  }

  // ─── Filtrado relevante ────────────────────────────────────────────

  filtrarRelevante(query: string): string {
    this.limpiarExpirados();
    const q = query.toLowerCase();
    const tokens = q.split(/\s+/).filter((t) => t.length > 3);

    const matches: string[] = [];

    for (const [path, entry] of this.archivos) {
      if (tokens.some((t) => path.toLowerCase().includes(t) || entry.resumen.toLowerCase().includes(t))) {
        matches.push(`📄 ${path}: ${entry.resumen}`);
      }
    }
    for (const [path, entry] of this.supabase) {
      if (tokens.some((t) => path.toLowerCase().includes(t) || entry.resumen.toLowerCase().includes(t))) {
        matches.push(`📦 ${path}: ${entry.resumen}`);
      }
    }
    for (const [q, entry] of this.web) {
      if (tokens.some((t) => q.toLowerCase().includes(t) || entry.resumen.toLowerCase().includes(t))) {
        matches.push(`🌐 ${q}: ${entry.resumen}`);
      }
    }

    return matches.length ? matches.join("\n\n") : "";
  }

  // ─── Serialización para memoria persistente ───────────────────────

  toJSON() {
    return {
      archivos: [...this.archivos.entries()].map(([k, v]) => [k, v]),
      supabase: [...this.supabase.entries()].map(([k, v]) => [k, v]),
      web: [...this.web.entries()].map(([k, v]) => [k, v]),
      sandbox: [...this.sandbox.entries()].map(([k, v]) => [k, v]),
      ultimaExploracionFS: this.ultimaExploracionFS,
    };
  }

  static fromJSON(data: any): SessionContext {
    const ctx = new SessionContext();
    for (const [k, v] of data?.archivos ?? []) ctx.archivos.set(k, v);
    for (const [k, v] of data?.supabase ?? []) ctx.supabase.set(k, v);
    for (const [k, v] of data?.web ?? []) ctx.web.set(k, v);
    for (const [k, v] of data?.sandbox ?? []) ctx.sandbox.set(k, v);
    ctx.ultimaExploracionFS = data?.ultimaExploracionFS ?? 0;
    return ctx;
  }
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < Math.min(s.length, 1000); i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h.toString(16);
}

// ─── Mapa global de sesiones (volátil, server-side) ──────────────────
const sessions = new Map<string, SessionContext>();

export function getSessionContext(sessionId: string): SessionContext {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new SessionContext());
  }
  return sessions.get(sessionId)!;
}

export function clearSessionContext(sessionId: string) {
  sessions.delete(sessionId);
}
