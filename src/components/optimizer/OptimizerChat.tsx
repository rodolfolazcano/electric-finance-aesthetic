// @ts-nocheck
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  detectarTickersPortafolio,
  type PortfolioHolding,
  type PortafolioDetectado,
} from "@/lib/optimizer-ai.functions";
import { agentTurn } from "@/lib/ai/studio.functions";
import { cn } from "@/lib/utils";
import {
  ClipboardPaste,
  Loader2,
  Send,
  Sparkles,
  Copy,
  Check,
  Wand2,
  X,
  ChevronDown,
  ChevronRight,
  History,
  Plus,
  Trash2,
  Minus,
  ChevronUp,
} from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

type SessionData = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  msgs: Msg[];
  raw: string;
  holdings: PortfolioHolding[];
  unknown: string[];
  especie: "ARS" | "USD";
};

const STORAGE_KEY = "optimizer-chat-sessions-v1";
const MIN_KEY = "optimizer-chat-minimized";
const CLOSED_KEY = "optimizer-chat-closed";
const MAX_SESSIONS = 25;

const WELCOME: Msg = {
  role: "assistant",
  content:
    "Soy el asistente del Optimizador de Portafolios. Pegame el resumen de tu portafolio IOL (o una lista de tickers) y te paso los tickers en especie D o .BA para cargarlos acá.",
};

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function makeSession(title: string): SessionData {
  const now = new Date().toISOString();
  return {
    id: uid(),
    title,
    createdAt: now,
    updatedAt: now,
    msgs: [WELCOME],
    raw: "",
    holdings: [],
    unknown: [],
    especie: "USD",
  };
}

function readSessions(): SessionData[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is SessionData => !!s && typeof (s as SessionData).id === "string")
      .map((s) => ({
        ...makeSession("Sesión"),
        ...s,
        msgs: Array.isArray(s.msgs) ? s.msgs : [WELCOME],
        holdings: Array.isArray(s.holdings) ? s.holdings : [],
        unknown: Array.isArray(s.unknown) ? s.unknown : [],
        especie: s.especie === "ARS" ? "ARS" : "USD",
      }));
  } catch {
    return [];
  }
}

function writeSessions(sessions: SessionData[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // almacenamiento lleno/indisponible: ignorar
  }
}

interface OptimizerChatProps {
  onApplyTickers: (tickers: string[], especie: "ARS" | "USD") => void;
  currentTickers: string[];
}

function buildList(holdings: PortfolioHolding[], especie: "ARS" | "USD"): string {
  return holdings
    .map((h) =>
      especie === "USD" ? (h.dTicker ?? h.baTicker ?? h.code) : (h.baTicker ?? h.dTicker ?? h.code),
    )
    .join(", ");
}

export function OptimizerChat({ onApplyTickers, currentTickers }: OptimizerChatProps) {
  const detectar = useServerFn(detectarTickersPortafolio);
  const runAgent = useServerFn(agentTurn);

  const [sessions, setSessions] = useState<SessionData[]>(() => [makeSession("Sesión 1")]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [closed, setClosed] = useState(false);

  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showPaste, setShowPaste] = useState(false);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const active = sessions.find((s) => s.id === activeId) ?? sessions[0] ?? null;
  const msgs = useMemo(() => active?.msgs ?? [], [active]);
  const raw = active?.raw ?? "";
  const holdings = useMemo(() => active?.holdings ?? [], [active]);
  const unknown = active?.unknown ?? [];
  const especie = active?.especie ?? "USD";

  useEffect(() => {
    const stored = readSessions();
    if (stored.length) setSessions(stored);
    try {
      setMinimized(window.localStorage.getItem(MIN_KEY) === "1");
      setClosed(window.localStorage.getItem(CLOSED_KEY) === "1");
    } catch {
      // ignorar
    }
  }, []);

  useEffect(() => {
    writeSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  const patchActive = useCallback(
    (updater: (s: SessionData) => SessionData) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeId ? { ...updater(s), updatedAt: new Date().toISOString() } : s,
        ),
      );
    },
    [activeId],
  );

  const openSession = useCallback((id: string) => {
    setActiveId(id);
    setShowSessions(false);
    setCopied(false);
    setError("");
  }, []);

  const createSession = useCallback(() => {
    const n = sessions.length + 1;
    setSessions((prev) => {
      const next = [makeSession(`Sesión ${n}`), ...prev];
      return next.slice(0, MAX_SESSIONS);
    });
    setShowSessions(false);
    setError("");
  }, [sessions.length]);

  const deleteSession = useCallback(
    (id: string) => {
      if (!window.confirm("¿Eliminar esta sesión de chat?")) return;
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (id === activeId) {
          const fallback = next[0];
          setActiveId(fallback?.id ?? null);
          if (!fallback) {
            const fresh = makeSession("Sesión 1");
            setSessions([fresh]);
            setActiveId(fresh.id);
            return [fresh];
          }
        }
        return next;
      });
      setShowSessions(false);
    },
    [activeId],
  );

  const toggleMinimized = useCallback(() => {
    setMinimized((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(MIN_KEY, next ? "1" : "0");
      } catch {
        // ignorar
      }
      return next;
    });
  }, []);

  const closeChat = useCallback(() => {
    setClosed(true);
    setMinimized(false);
    try {
      window.localStorage.setItem(CLOSED_KEY, "1");
      window.localStorage.setItem(MIN_KEY, "0");
    } catch {
      // ignorar
    }
  }, []);

  const reopenChat = useCallback(() => {
    setClosed(false);
    try {
      window.localStorage.setItem(CLOSED_KEY, "0");
    } catch {
      // ignorar
    }
  }, []);

  const detect = useCallback(async () => {
    if (!raw.trim()) return;
    setDetecting(true);
    setError("");
    let res: PortafolioDetectado | null = null;
    try {
      res = await detectar({ data: { raw } });
      patchActive((s) => ({ ...s, holdings: res?.holdings ?? [], unknown: res?.unknown ?? [] }));
      if ((res?.holdings ?? []).length === 0) {
        setError(
          "No detecté tickers en el texto. Pegá el resumen de tenencias de IOL o una lista como: NU, MELI, AAPL, MSFT...",
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al detectar tickers");
    } finally {
      setDetecting(false);
    }
  }, [raw, detectar, patchActive]);

  const lista = buildList(holdings, especie);
  const sinD = holdings.filter((h) => !h.dTicker).length;

  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(lista);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // portapapeles no disponible (p. ej. sin foco/permanente)
    }
  };

  const localFallback = useCallback(
    async (msg: string, llmErr: string): Promise<string> => {
      let reply = llmErr;
      try {
        const d = await detectar({ data: { raw: msg } });
        const h = d.holdings ?? [];
        if (h.length) {
          patchActive((s) => ({ ...s, holdings: h, unknown: d.unknown ?? [] }));
          const listD = buildList(h, "USD");
          const listBA = buildList(h, "ARS");
          reply =
            "La API de IA no respondió, te respondo con el detector local de tickers:\n\n" +
            `Detecté ${h.length} tickers: ${h.map((x) => x.code).join(", ")}\n` +
            `Especie D (USD): ${listD}\n` +
            `Especie .BA (ARS): ${listBA}\n\n` +
            'Usá el panel "Pegar portafolio IOL" para cargarlos con "Usar en el optimizador".';
        } else {
          reply =
            "La API de IA no respondió (verificá NVIDIA_API_KEY en el .env) y el texto no contiene tickers que pueda resolver de forma local.";
        }
      } catch {
        // mantener el mensaje de error original de la API
      }
      return reply;
    },
    [detectar, patchActive],
  );

  const submit = useCallback(async () => {
    const msg = input.trim();
    if (!msg || busy) return;
    setInput("");
    const base = msgs;
    const userMsg: Msg = { role: "user", content: msg };
    const isFirstUser = !base.some((m) => m.role === "user");
    setBusy(true);

    const ctx = [
      "Estás en el tab Optimizador de Portafolios (Markowitz, mínima varianza, máximo Sharpe sobre datos diarios).",
      `Tickers ya cargados en el optimizador: ${currentTickers.join(", ") || "ninguno"}.`,
      holdings.length
        ? `Tickers detectados del texto pegado (con diccionario de la app / tab Sectores): ${holdings
            .map((h) => h.code + (h.qty ? ` (${h.qty})` : ""))
            .join(", ")}.`
        : "",
      "Regla de conversión: CEDEAR especie USD en BCBA = TICKER + 'D' (ej: AMZN → AMZND). Acción/CEDEAR ARS en BCBA = TICKER + '.BA' (ej: AMZN.BA, PAMP.BA). Solo usá '.BA'/'D' si existen (no inventes tickers).",
      "Si te piden 'la lista de tickers en especie D', devolvé SOLO la lista separada por comas con esos símbolos, sin puntos adicionales.",
      "Respondé en español, conciso y accionable.",
    ]
      .filter(Boolean)
      .join("\n");

    let reply: string;
    let failed = false;

    try {
      const call = await runAgent({
        data: {
          message: msg + "\n\n--- CONTEXTO ---\n" + ctx,
          history: base.slice(-4).map((m) => ({ role: m.role, content: m.content })),
          files: [],
          useWeb: false,
          useAgent: false,
          uiContext: ctx,
        },
      });
      const res = call as unknown as { ok?: boolean; text?: string; content?: string };
      const text = (res?.text ?? res?.content ?? "").trim();
      failed = res?.ok === false || /^\[API no disponible\]/.test(text);
      reply = failed
        ? await localFallback(msg, text || "Sin respuesta.")
        : text || "Sin respuesta.";
    } catch (e: unknown) {
      failed = true;
      reply = `Error: ${e instanceof Error ? e.message : "no se pudo conectar"}`;
    }

    patchActive((s) => ({
      ...s,
      title: isFirstUser ? msg.slice(0, 42) : s.title,
      msgs: [...base, userMsg, { role: "assistant", content: reply }],
    }));
    setBusy(false);
  }, [input, busy, msgs, holdings, currentTickers, runAgent, localFallback, patchActive]);

  const clearPaste = useCallback(() => {
    patchActive((s) => ({ ...s, raw: "", holdings: [], unknown: [] }));
    setError("");
    setCopied(false);
  }, [patchActive]);

  const applyList = useCallback(() => {
    if (!holdings.length) return;
    onApplyTickers(lista.split(/[\s,]+/).filter(Boolean), especie);
    patchActive((s) => ({
      ...s,
      msgs: [
        ...s.msgs,
        { role: "assistant", content: `Lista cargada en el optimizador (${especie}):\n${lista}` },
      ],
    }));
  }, [holdings, lista, especie, onApplyTickers, patchActive]);

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const totalMessages = (s: SessionData) => s.msgs.filter((m) => m.role === "user").length;

  return (
    <div className="glass overflow-hidden rounded-xl border border-border/50 flex flex-col">
      {closed ? (
        <div className="px-3 py-2">
          <button
            type="button"
            onClick={reopenChat}
            className="flex w-full items-center gap-1.5 text-left text-[14px] font-semibold text-foreground transition-colors hover:text-primary"
            title="Reabrir chat"
          >
            <Sparkles className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">Reabrir Asistente IA · Optimizador</span>
            <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
          <div className="mt-0.5 text-[13px] text-muted-foreground">
            {sessions.length} sesión(es) guardadas
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
            <button
              type="button"
              onClick={toggleMinimized}
              className="flex min-w-0 items-center gap-1.5 text-[14px] font-semibold text-foreground"
              title={minimized ? "Expandir chat" : "Minimizar chat"}
            >
              <Sparkles className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">Asistente IA · Optimizador</span>
              {minimized ? (
                <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <Minus className="size-3.5 shrink-0 text-muted-foreground" />
              )}
            </button>
            <div className="relative flex items-center gap-1">
              <span className="mono text-[13px] text-muted-foreground">
                {sessions.length} sesión(es)
              </span>
              <button
                type="button"
                onClick={createSession}
                title="Nueva sesión"
                className="rounded-md border border-border/50 p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <Plus className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowSessions((v) => !v)}
                title="Historial de sesiones"
                className={cn(
                  "rounded-md border p-1 transition-colors",
                  showSessions
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/50 text-muted-foreground hover:text-foreground",
                )}
              >
                <History className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={closeChat}
                title="Ocultar chat (queda guardado)"
                className="rounded-md border border-border/50 p-1 text-muted-foreground transition-colors hover:text-danger"
              >
                <X className="size-3.5" />
              </button>

              {showSessions && (
                <div className="absolute right-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-lg border border-border/60 bg-background shadow-xl">
                  <div className="max-h-64 overflow-y-auto p-1.5">
                    {sessions.length === 0 && (
                      <p className="px-2 py-3 text-center text-[14px] text-muted-foreground">
                        Sin sesiones guardadas
                      </p>
                    )}
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className={cn(
                          "group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors",
                          s.id === activeId ? "bg-primary/10" : "hover:bg-muted/50",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => openSession(s.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate text-[14px] font-medium text-foreground">
                            {s.title}
                          </span>
                          <span className="block text-[13px] text-muted-foreground">
                            {fmtDate(s.updatedAt)} · {totalMessages(s)} msgs
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSession(s.id)}
                          title="Eliminar sesión"
                          className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-border/40 p-1.5">
                    <button
                      type="button"
                      onClick={createSession}
                      className="flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5 text-[14px] font-medium text-primary transition-colors hover:bg-primary/20"
                    >
                      <Plus className="size-3.5" />
                      Nueva sesión
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {minimized ? (
            <div className="px-3 py-1.5 text-[13px] text-muted-foreground">
              Chat minimizado. Las sesiones quedan guardadas.
            </div>
          ) : (
            <>
              {/* Chat messages */}
              <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
                {msgs.map((m, i) => (
                  <div
                    key={i}
                    className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[92%] rounded-xl px-2.5 py-1.5 text-xs leading-relaxed whitespace-pre-wrap",
                        m.role === "user"
                          ? "bg-primary/15 text-foreground"
                          : "bg-muted/50 text-foreground/90",
                      )}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {busy && (
                  <div className="flex items-center gap-1.5 pl-1 text-[14px] text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> pensando...
                  </div>
                )}
              </div>

              {/* Quick actions */}
              <div className="flex flex-wrap gap-1 border-t border-border/30 px-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPaste((v) => !v)}
                  className={cn(
                    "flex items-center gap-1 rounded-md border px-2 py-1 text-[13px] font-mono transition-colors",
                    showPaste
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border/50 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <ClipboardPaste className="size-3" />
                  {showPaste ? "Ocultar pegada" : "Pegar portafolio IOL"}
                </button>
                {holdings.length > 0 && (
                  <>
                    <span className="rounded-md border border-border/50 px-2 py-1 text-[13px] font-mono text-muted-foreground">
                      {holdings.length} tickers
                    </span>
                    {sinD > 0 && (
                      <span
                        className="rounded-md border border-warning/30 bg-warning/5 px-2 py-1 text-[13px] font-mono text-warning"
                        title="No tienen variante especie D"
                      >
                        {sinD} sin D
                      </span>
                    )}
                  </>
                )}
              </div>

              {/* Paste panel */}
              {showPaste && (
                <div className="space-y-2 border-t border-border/30 p-2.5">
                  <textarea
                    value={raw}
                    onChange={(e) => patchActive((s) => ({ ...s, raw: e.target.value }))}
                    rows={7}
                    placeholder={
                      "Pegá acá el resumen de tenencias de IOL (ticker, cantidad, etc.) o una lista simple:\nNU, MELI, AAPL, MSFT, SPY..."
                    }
                    className="w-full resize-none rounded-md border border-border/50 bg-background/40 px-2.5 py-2 text-[14px] font-mono text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary"
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={detect}
                      disabled={detecting || !raw.trim()}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5 text-[14px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
                    >
                      {detecting ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="size-3.5" />
                      )}
                      Detectar tickers
                    </button>
                    <button
                      type="button"
                      onClick={clearPaste}
                      className="rounded-md border border-border/50 px-2 py-1.5 text-[14px] text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>

                  {error && <p className="text-[14px] text-danger">{error}</p>}

                  {holdings.length > 0 && (
                    <div className="overflow-hidden rounded-md border border-border/40 bg-background/30">
                      <div className="grid w-full grid-cols-[auto_auto_1fr] gap-x-2 border-b border-border/40 px-2 py-1 text-[13px] uppercase tracking-wider text-muted-foreground">
                        <span>Código</span>
                        <span>Cant.</span>
                        <span>Nombre</span>
                      </div>
                      <div className="max-h-40 overflow-y-auto">
                        {holdings.map((h) => (
                          <div
                            key={h.code}
                            className="grid w-full grid-cols-[auto_auto_1fr] items-baseline gap-x-2 border-b border-border/20 px-2 py-1 last:border-0"
                          >
                            <span className="font-mono text-[14px] text-foreground">
                              {h.code}
                              {h.esCedear && (
                                <span className="ml-1 align-middle text-[12px] text-primary">
                                  CED
                                </span>
                              )}
                            </span>
                            <span className="font-mono text-[13px] text-muted-foreground">
                              {h.qty ?? "—"}
                            </span>
                            <span
                              className="truncate text-[13px] text-muted-foreground"
                              title={h.nombre}
                            >
                              {h.nombre}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {unknown.length > 0 && (
                    <p className="text-[13px] text-muted-foreground">
                      Sin resolver en el diccionario: {unknown.join(", ")}
                    </p>
                  )}

                  {holdings.length > 0 && (
                    <>
                      {/* Especie selector */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-mono uppercase text-muted-foreground">
                          Especie
                        </span>
                        <button
                          type="button"
                          onClick={() => patchActive((s) => ({ ...s, especie: "USD" }))}
                          className={cn(
                            "rounded border px-2 py-1 text-[13px] font-mono transition-colors",
                            especie === "USD"
                              ? "border-primary/60 bg-primary/10 text-foreground"
                              : "border-border/50 text-muted-foreground hover:text-foreground",
                          )}
                          title="CEDEAR en dólares en BCBA (sufijo D)"
                        >
                          D (USD)
                        </button>
                        <button
                          type="button"
                          onClick={() => patchActive((s) => ({ ...s, especie: "ARS" }))}
                          className={cn(
                            "rounded border px-2 py-1 text-[13px] font-mono transition-colors",
                            especie === "ARS"
                              ? "border-primary/60 bg-primary/10 text-foreground"
                              : "border-border/50 text-muted-foreground hover:text-foreground",
                          )}
                          title="CEDEAR/acción en pesos en BCBA (sufijo .BA)"
                        >
                          .BA (ARS)
                        </button>
                      </div>

                      {/* Generated list */}
                      <div className="rounded-md border border-border/40 bg-background/30 p-2">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[13px] font-mono uppercase tracking-wider text-muted-foreground">
                            Lista generada
                          </span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={copyList}
                              className="flex items-center gap-1 rounded border border-border/50 px-1.5 py-0.5 text-[13px] text-muted-foreground hover:text-foreground"
                            >
                              {copied ? (
                                <Check className="size-3 text-success" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                              {copied ? "Copiada" : "Copiar"}
                            </button>
                            <button
                              type="button"
                              onClick={applyList}
                              className="flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-[13px] font-medium text-primary hover:bg-primary/25"
                            >
                              <Sparkles className="size-3" />
                              Usar en el optimizador
                            </button>
                          </div>
                        </div>
                        <p className="break-all font-mono text-[13px] leading-relaxed text-foreground/90">
                          {lista}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Chat input */}
              <div className="border-t border-border/30 p-2.5">
                <div className="flex items-center gap-1.5">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submit();
                      }
                    }}
                    placeholder="Ej: pasáme la lista en especie D, ¿qué conviene mantener?"
                    disabled={busy}
                    className="min-w-0 flex-1 rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5 text-[14px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!input.trim() || busy}
                    className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-40"
                  >
                    <Send className="size-3.5" />
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  {holdings.length === 0 ? (
                    <span className="flex items-center gap-1 text-[13px] text-muted-foreground/70">
                      <ChevronRight className="size-3" />
                      Pegá tu portafolio y detectá tickers para convertirlos a especie D.
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[13px] text-muted-foreground/70">
                      <ChevronDown className="size-3" />
                      {lista}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
