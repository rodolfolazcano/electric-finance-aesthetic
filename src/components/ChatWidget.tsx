import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  MessageCircle,
  X,
  Send,
  Trash2,
  Search,
  Minus,
  ChevronUp,
  TrendingUp,
  Newspaper,
  Calculator,
  GripVertical,
  BookOpen,
  Square,
  Activity,
  Pencil,
  RotateCw,
  Pause,
  Play,
} from "lucide-react";
import { CHAT_OPEN_EVENT_NAME } from "@/lib/chat-open";
import {
  CATEGORIA_RAPIDEZ_LABEL,
  CATEGORIA_RAZONAMIENTO_LABEL,
  MODELO_POR_DEFECTO,
  obtenerModelo,
  obtenerModelosPorCategoria,
  type AgentModel,
} from "@/lib/model-registry";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const WHATSAPP = "https://wa.me/541162355944";

const SESSION_STORAGE_KEY = "norte-session-id";

function obtenerSessionId(): string {
  try {
    let id = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!id) {
      id = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(SESSION_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function limpiarSessionId(): void {
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* sin storage */
  }
}

const MODELOS_RAPIDEZ = obtenerModelosPorCategoria("rapidez");
const MODELOS_RAZONAMIENTO = obtenerModelosPorCategoria("razonamiento");

type Fuente = { dominio: string; url: string; title?: string };
type Msg = { role: "user" | "assistant"; content: string; sources?: Fuente[] };

const WELCOME: Msg = {
  role: "assistant",
  content:
    "Soy **IA**, asistente del mercado de capitales argentino. Respondo sobre instrumentos, riesgo y cotizaciones con material académico y fuentes oficiales — y te digo siempre de dónde saqué el dato.\n\nPodés arrancar por acá:\n- **¿Qué pasa si la acción cae?**\n- Diferencia entre **acciones y CFDs**\n- **¿Tu bróker está regulado por la CNV?**\n- **¿Cómo arranco a invertir?**\n- ONs que se **operan en pesos y pagan en dólares**\n\nSi el dato es de mercado, lo busco en fuentes reales y te muestro la fuente. Información general. No constituye recomendación de inversión.",
};

const SUGGESTIONS = [
  "¿Qué pasa si la acción cae?",
  "¿Qué diferencia hay entre acciones y CFDs?",
  "¿Cómo sé si mi bróker está regulado por la CNV?",
  "¿Cómo arranco a invertir si recién empiezo?",
  "¿Qué son las obligaciones negociables que se operan en pesos y pagan en dólares?",
  "¿Cuánto está el dólar hoy?",
];

function isWhatsAppLink(url: string): boolean {
  return /wa\.me\/|whatsapp\//i.test(url);
}

function WhatsAppButton({ url, text }: { url: string; text?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escribirle a Cintia por WhatsApp"
      title="Escribirle a Cintia por WhatsApp"
      className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#25D366] text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#128C7E] hover:shadow-lg"
    >
      <MessageCircle className="h-5 w-5" />
      <span className="sr-only">{text || "WhatsApp"}</span>
    </a>
  );
}

function LinkRenderer({
  href,
  children,
}: {
  href?: string | undefined;
  children: React.ReactNode;
}) {
  if (!href) return <span>{children}</span>;

  if (isWhatsAppLink(href)) {
    return <WhatsAppButton url={href} text={String(children)} />;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {children}
    </a>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [isDesktop, setIsDesktop] = useState(
    typeof window === "undefined" ? false : window.matchMedia("(min-width: 640px)").matches,
  );
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState<string>(MODELO_POR_DEFECTO.id);
  const [modelInfo, setModelInfo] = useState<AgentModel>(MODELO_POR_DEFECTO);
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const [searching, setSearching] = useState<string | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [buscandoNoticias, setBuscandoNoticias] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [valorando, setValorando] = useState(false);
  const [analizandoSemaforo, setAnalizandoSemaforo] = useState(false);
  const [agentesActivos, setAgentesActivos] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const queueRef = useRef<string[]>([]);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<Msg[]>(messages);
  const streamTokenRef = useRef(0);
  const pausedRef = useRef(false);
  const resumeRef = useRef<(() => void) | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, searching]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  function startResize(e: React.PointerEvent<HTMLDivElement>, dir: "w" | "h" | "wh") {
    e.preventDefault();
    const startW = isDesktop ? (size?.w ?? 460) : window.innerWidth;
    const startH = size?.h ?? window.innerHeight;
    const startX = e.clientX;
    const startY = e.clientY;
    const onMove = (ev: PointerEvent) => {
      let w = startW;
      let h = startH;
      if (dir === "w" || dir === "wh") {
        w = clamp(window.innerWidth - ev.clientX + 8, 320, window.innerWidth - 16);
      }
      if (dir === "h" || dir === "wh") {
        h = clamp(ev.clientY + 8, 320, window.innerHeight);
      }
      setSize({ w, h });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor =
      dir === "h" ? "ns-resize" : dir === "w" ? "ew-resize" : "nwse-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function updateLast(patch: Partial<Msg>) {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last) next[next.length - 1] = { ...last, ...patch };
      messagesRef.current = next;
      return next;
    });
  }

  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ question?: string }>).detail;
      setOpen(true);
      setMinimized(false);
      if (detail?.question && detail.question.trim()) void sendRef.current(detail.question);
    };
    window.addEventListener(CHAT_OPEN_EVENT_NAME, handler);
    return () => window.removeEventListener(CHAT_OPEN_EVENT_NAME, handler);
  }, []);

  async function send(text: string) {
    const question = text.trim();
    if (!question) return;
    if (busyRef.current) {
      // Una pregunta nueva interrumpe la respuesta en curso y arranca primero,
      // manteniendo el hilo de la conversación.
      queueRef.current = [question, ...queueRef.current];
      setQueue([...queueRef.current]);
      abortRef.current?.abort();
      setInput("");
      return;
    }
    await process(question);
  }

  /** Procesa una pregunta manteniendo el hilo: usa el historial completo acumulado hasta ese turno. */
  async function process(question: string) {
    const q = question.trim();
    if (!q) return;
    setMessages((prev) => {
      const next = [...prev, { role: "user" as const, content: q }];
      messagesRef.current = next;
      return next;
    });
    setInput("");
    await streamTurn();
  }

  /** Ejecuta un turno de streaming usando el historial ya presente en messagesRef. */
  async function streamTurn() {
    const token = ++streamTokenRef.current;
    busyRef.current = true;
    pausedRef.current = false;
    setPaused(false);
    const history = messagesRef.current
      .filter((m) => m !== WELCOME && !(m.role === "assistant" && !m.content.trim()))
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => {
      const next = [...prev, { role: "assistant" as const, content: "" }];
      messagesRef.current = next;
      return next;
    });
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let interrumpido = false;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, model, sessionId: obtenerSessionId() }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        throw new Error(detail || "sin respuesta");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let fuentes: Fuente[] = [];

      const handle = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let evt: { t?: string; v?: unknown; q?: string };
        try {
          evt = JSON.parse(trimmed);
        } catch {
          return;
        }
        if (evt.t === "status") {
          if (evt.v === "cola") {
            setSearching(null);
            setConsultando(false);
            setBuscandoNoticias(false);
            setLeyendo(false);
            setValorando(false);
            setAnalizandoSemaforo(false);
          } else if (evt.v === "searching") {
            setAgentesActivos((prev) => {
              const sin = prev.filter(
                (a) =>
                  a !== "mercado" &&
                  a !== "noticias" &&
                  a !== "base" &&
                  a !== "valoracion" &&
                  a !== "semaforo",
              );
              return prev.length !== sin.length ? sin : prev;
            });
            setSearching(evt.q ?? "");
            setConsultando(false);
            setBuscandoNoticias(false);
            setLeyendo(false);
            setValorando(false);
            setAnalizandoSemaforo(false);
          } else if (evt.v === "mercado") {
            setSearching(null);
            setBuscandoNoticias(false);
            setLeyendo(false);
            setValorando(false);
            setAnalizandoSemaforo(false);
            setConsultando(true);
            setAgentesActivos((prev) => (prev.includes("mercado") ? prev : [...prev, "mercado"]));
          } else if (evt.v === "noticias") {
            setBuscandoNoticias(true);
            setSearching(null);
            setConsultando(false);
            setLeyendo(false);
            setValorando(false);
            setAnalizandoSemaforo(false);
            setAgentesActivos((prev) => (prev.includes("noticias") ? prev : [...prev, "noticias"]));
          } else if (evt.v === "base_conocimiento") {
            setLeyendo(true);
            setSearching(null);
            setConsultando(false);
            setBuscandoNoticias(false);
            setValorando(false);
            setAnalizandoSemaforo(false);
            setAgentesActivos((prev) => (prev.includes("base") ? prev : [...prev, "base"]));
          } else if (evt.v === "valoracion") {
            setValorando(true);
            setSearching(null);
            setConsultando(false);
            setBuscandoNoticias(false);
            setLeyendo(false);
            setAnalizandoSemaforo(false);
            setAgentesActivos((prev) =>
              prev.includes("valoracion") ? prev : [...prev, "valoracion"],
            );
          } else if (evt.v === "semaforo") {
            setAnalizandoSemaforo(true);
            setSearching(null);
            setConsultando(false);
            setBuscandoNoticias(false);
            setLeyendo(false);
            setValorando(false);
            setAgentesActivos((prev) => (prev.includes("semaforo") ? prev : [...prev, "semaforo"]));
          } else if (evt.v === "capm" || evt.v === "portafolio" || evt.v === "riesgo") {
            setSearching(evt.q ?? "");
            setConsultando(false);
            setBuscandoNoticias(false);
            setLeyendo(false);
            setValorando(false);
            setAnalizandoSemaforo(false);
          } else {
            setSearching(null);
            setConsultando(false);
            setBuscandoNoticias(false);
            setLeyendo(false);
            setValorando(false);
            setAnalizandoSemaforo(false);
          }
        } else if (evt.t === "sources") {
          fuentes = [...fuentes, ...((evt.v as Fuente[]) ?? [])];
          updateLast({ sources: fuentes });
        } else if (evt.t === "text") {
          setSearching(null);
          setConsultando(false);
          setBuscandoNoticias(false);
          setLeyendo(false);
          setValorando(false);
          setAgentesActivos([]);
          acc += String(evt.v ?? "");
          updateLast({ content: acc });
        }
      };

      for (;;) {
        if (pausedRef.current) {
          await new Promise<void>((resolve) => {
            resumeRef.current = resolve;
          });
          resumeRef.current = null;
        }
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(handle);
      }
      if (buffer) handle(buffer);
    } catch (err) {
      const esAbort = err instanceof Error && err.name === "AbortError";
      interrumpido = esAbort;
      if (!esAbort) {
        const msg =
          err instanceof Error && err.message ? err.message : "No pude responder ahora mismo.";
        updateLast({
          content: `${msg}\n\nPodés escribirle directo a Cintia por [WhatsApp](${WHATSAPP}).`,
        });
      }
    }

    if (token !== streamTokenRef.current) {
      // Este turno fue superado por otro (editar/regenerar/reenviar): no tocar estado global.
      return;
    }
    abortRef.current = null;
    resumeRef.current = null;
    pausedRef.current = false;
    setPaused(false);
    setSearching(null);
    setConsultando(false);
    setBuscandoNoticias(false);
    setLeyendo(false);
    setValorando(false);
    setAgentesActivos([]);
    busyRef.current = false;
    setLoading(false);
    // Si el turno se interrumpió sin respuesta, quitamos la burbuja vacía
    // para que el hilo continúe limpio con la nueva pregunta.
    if (interrumpido) {
      const sinVacios = messagesRef.current.filter(
        (m) => !(m.role === "assistant" && m.content.trim() === ""),
      );
      messagesRef.current = sinVacios;
      setMessages(sinVacios);
    }
    // Preguntas en cola: se procesan en orden, manteniendo el hilo acumulado.
    if (queueRef.current.length > 0) {
      const [next, ...rest] = queueRef.current;
      queueRef.current = rest;
      setQueue(rest);
      void process(next!);
    }
  }

  /** Interrumpe la respuesta en curso. La siguiente pregunta en cola arranca de inmediato. */
  function cancelCurrent() {
    if (pausedRef.current) {
      pausedRef.current = false;
      setPaused(false);
      resumeRef.current?.();
      resumeRef.current = null;
    }
    abortRef.current?.abort();
  }

  /** Pausa o reanuda la respuesta en curso (el stream sigue en el navegador y se retoma donde iba). */
  function togglePause() {
    if (pausedRef.current) {
      pausedRef.current = false;
      setPaused(false);
      resumeRef.current?.();
      resumeRef.current = null;
    } else {
      pausedRef.current = true;
      setPaused(true);
    }
  }

  function limpiarCola() {
    queueRef.current = [];
    setQueue([]);
  }

  function startEdit(index: number) {
    const m = messagesRef.current[index];
    if (!m || m.role !== "user") return;
    setEditingIdx(index);
    setEditText(m.content);
  }

  function cancelEdit() {
    setEditingIdx(null);
    setEditText("");
  }

  /** Guarda el mensaje editado y regenera la respuesta desde ese punto. */
  function saveEdit() {
    const text = editText.trim();
    const index = editingIdx ?? -1;
    cancelEdit();
    const prev = messagesRef.current;
    const original = prev[index];
    if (!text || !original || original.role !== "user") return;
    if (original.content === text) return;
    if (busyRef.current) {
      abortRef.current?.abort();
      queueRef.current = [];
      setQueue([]);
    }
    const next = prev.slice(0, index);
    next.push({ role: "user", content: text });
    messagesRef.current = next;
    setMessages(next);
    void streamTurn();
  }

  /** Reenvía la misma pregunta como un nuevo turno (mantiene el hilo). */
  function reenviar(index: number) {
    const m = messagesRef.current[index];
    if (!m || m.role !== "user") return;
    void send(m.content);
  }

  /** Regenera la respuesta de un turno: recalcula desde la pregunta original de ese turno. */
  function regenerarDesde(index: number) {
    const prev = messagesRef.current;
    const target = prev[index];
    if (!target || target.role !== "assistant") return;
    let ui = index - 1;
    while (ui >= 0 && prev[ui]?.role !== "user") ui--;
    if (ui < 0) return;
    if (busyRef.current) {
      abortRef.current?.abort();
      queueRef.current = [];
      setQueue([]);
    }
    const next = prev.slice(0, ui + 1);
    messagesRef.current = next;
    setMessages(next);
    void streamTurn();
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => {
            setOpen(true);
            setMinimized(false);
          }}
          aria-label="Abrir asistente virtual"
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-transform hover:scale-105"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm sm:hidden"
        />
      )}

      <aside
        style={
          open && !minimized && size && isDesktop
            ? { width: `${size.w}px`, height: `${size.h}px` }
            : undefined
        }
        className={`fixed right-0 z-40 flex flex-col border-border bg-background/70 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_0_60px_rgba(0,0,0,0.6)] transition-all duration-300 ${
          minimized
            ? "bottom-0 h-16 w-full border-t sm:w-[460px] sm:rounded-t-2xl sm:border-l"
            : "top-0 h-[100dvh] w-full border-l sm:w-[460px]"
        } ${open ? "translate-x-0" : "pointer-events-none translate-x-full"}`}
      >
        {open && !minimized && isDesktop && (
          <div className="pointer-events-none absolute inset-0 z-30">
            <div
              onPointerDown={(e) => startResize(e, "w")}
              role="separator"
              aria-orientation="vertical"
              aria-label="Cambiar ancho del chat"
              className="pointer-events-auto absolute -left-2 top-1/2 h-24 w-4 -translate-y-1/2 cursor-ew-resize"
            >
              <div className="mx-auto flex h-full w-6 items-center justify-center rounded-r-full bg-border/20 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-primary/40 hover:text-primary-foreground">
                <GripVertical className="h-5 w-5" />
              </div>
            </div>
            <div
              onPointerDown={(e) => startResize(e, "h")}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Cambiar alto del chat"
              className="pointer-events-auto absolute -bottom-2 left-0 w-full h-4 cursor-ns-resize"
            >
              <div className="mt-2 h-1 w-full rounded-full bg-border/0 transition-colors hover:bg-primary/40" />
            </div>
            <div
              onPointerDown={(e) => startResize(e, "wh")}
              aria-label="Cambiar tamaño del chat (lateral e inferior)"
              className="pointer-events-auto absolute -bottom-2 -left-2 h-8 w-8 cursor-nwse-resize"
            />
          </div>
        )}
        <header className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-gold/60 bg-gradient-to-br from-[#0a0f1a] to-[#141b2e] font-display text-[15px] font-semibold text-gold shadow-[0_0_18px_rgba(37,99,235,0.4)]">
            IA
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold">
              IA <span className="text-gold">·</span>{" "}
              <span className="text-muted-foreground">
                Asistente del mercado de capitales argentino
              </span>
            </p>
          </div>
          <button
            onClick={() => {
              abortRef.current?.abort();
              queueRef.current = [];
              setQueue([]);
              try {
                void fetch(`/api/chat?sessionId=${encodeURIComponent(obtenerSessionId())}`, {
                  method: "DELETE",
                });
              } catch {
                /* sin backend de memoria */
              }
              limpiarSessionId();
              const reset: Msg[] = [WELCOME];
              messagesRef.current = reset;
              setMessages(reset);
            }}
            aria-label="Reestablecer conversación"
            title="Reestablecer la conversación"
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setMinimized((v) => !v);
            }}
            aria-label={minimized ? "Restaurar asistente" : "Minimizar asistente"}
            title={minimized ? "Restaurar" : "Minimizar"}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {minimized ? <ChevronUp className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              setMinimized(false);
            }}
            aria-label="Cerrar"
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {!minimized && (
          <>
            <div ref={scrollRef} className="chat-cq flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((m, i) => {
                const isStreamingTurn =
                  loading && i === messages.length - 1 && m.role === "assistant" && !m.content;
                const isUser = m.role === "user";
                const wasEditing = editingIdx === i;
                const accBtn =
                  "inline-flex h-6 w-6 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary";
                return (
                  <div key={i} className="group flex w-full min-w-0 flex-col gap-1">
                    <div
                      className={`flex w-full min-w-0 ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={
                          isUser
                            ? "max-w-[min(86%,min(92vw,640px))] min-w-0 rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-[13px] leading-relaxed text-primary-foreground shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                            : `max-w-[min(94%,min(96vw,980px))] min-w-0 rounded-2xl rounded-bl-sm border border-border/70 bg-background/45 px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground backdrop-blur-sm ${
                                isStreamingTurn ? "border-primary/40 bg-primary/[0.05]" : ""
                              }`
                        }
                      >
                        {wasEditing ? (
                          <div className="min-w-0">
                            <textarea
                              autoFocus
                              ref={(el) => el?.focus()}
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  saveEdit();
                                }
                                if (e.key === "Escape") cancelEdit();
                              }}
                              rows={2}
                              placeholder="Editá tu consulta…"
                              className="w-full resize-none rounded-lg border border-border bg-background/80 px-2.5 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
                            />
                            <div className="mt-2 flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={saveEdit}
                                aria-label="Guardar edición"
                                className="rounded-lg bg-primary px-2.5 py-1 text-[11.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                              >
                                Guardar
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                aria-label="Cancelar edición"
                                className="rounded-lg border border-border px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : isUser ? (
                          <span className="whitespace-pre-wrap break-words">{m.content}</span>
                        ) : !m.content ? (
                          <span className="text-muted-foreground">Escribiendo…</span>
                        ) : (
                          <div className="chat-md min-w-0">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                a: ({ href, children }) => (
                                  <LinkRenderer href={href}>{children}</LinkRenderer>
                                ),
                              }}
                            >
                              {m.content}
                            </ReactMarkdown>
                          </div>
                        )}
                        {!wasEditing &&
                          m.role === "assistant" &&
                          m.sources &&
                          m.sources.length > 0 && (
                            <p className="mt-2 border-t border-border pt-2 text-[10.5px] leading-snug text-muted-foreground">
                              Fuentes consultadas:{" "}
                              {m.sources.slice(0, 3).map((s, idx) => (
                                <span key={s.url}>
                                  {idx > 0 && " · "}
                                  <a
                                    href={s.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary underline underline-offset-2"
                                  >
                                    {s.dominio}
                                  </a>
                                </span>
                              ))}
                            </p>
                          )}
                        {isStreamingTurn && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2">
                            <button
                              type="button"
                              onClick={togglePause}
                              aria-label={paused ? "Reanudar respuesta" : "Pausar respuesta"}
                              title={paused ? "Reanudar" : "Pausar"}
                              className={`${accBtn} ${paused ? "text-primary" : ""}`}
                            >
                              {paused ? (
                                <Play className="h-3.5 w-3.5" />
                              ) : (
                                <Pause className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={cancelCurrent}
                              aria-label="Detener respuesta en curso"
                              title="Detener la respuesta actual"
                              className={`${accBtn} hover:text-destructive hover:bg-destructive/10`}
                            >
                              <Square className="h-3 w-3" />
                            </button>
                            {paused && (
                              <span className="text-[10.5px] text-muted-foreground">Pausado</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {isUser && !wasEditing ? (
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => startEdit(i)}
                          aria-label="Editar mensaje"
                          title="Editar mensaje"
                          className={accBtn}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => reenviar(i)}
                          aria-label="Reenviar mensaje"
                          title="Reenviar este mensaje"
                          className={accBtn}
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : !isStreamingTurn && m.role === "assistant" && m.content ? (
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => regenerarDesde(i)}
                          aria-label="Reenviar / regenerar respuesta"
                          title="Reenviar y regenerar esta respuesta"
                          className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        >
                          <RotateCw className="h-3 w-3" />
                          Reenviar
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {searching !== null && (
                <p className="flex items-center gap-2 text-[12px] text-primary">
                  <Search className="h-3.5 w-3.5 animate-pulse" />
                  Consultando fuentes{searching ? `: “${searching}”` : ""}…
                </p>
              )}
              {consultando && (
                <p className="flex items-center gap-2 text-[12px] text-primary">
                  <TrendingUp className="h-3.5 w-3.5 animate-pulse" />
                  Cotizando…
                </p>
              )}
              {buscandoNoticias && (
                <p className="flex items-center gap-2 text-[12px] text-primary">
                  <Newspaper className="h-3.5 w-3.5 animate-pulse" />
                  Buscando noticias…
                </p>
              )}
              {leyendo && (
                <p className="flex items-center gap-2 text-[12px] text-primary">
                  <BookOpen className="h-3.5 w-3.5 animate-pulse" />
                  Leyendo corpus académico…
                </p>
              )}
              {valorando && (
                <p className="flex items-center gap-2 text-[12px] text-primary">
                  <Calculator className="h-3.5 w-3.5 animate-pulse" />
                  Calculando valor intrínseco con datos reales y buscando noticias…
                </p>
              )}
              {analizandoSemaforo && (
                <p className="flex items-center gap-2 text-[12px] text-primary">
                  <Activity className="h-3.5 w-3.5 animate-pulse" />
                  Calculando semáforo técnico y fundamental con datos reales…
                </p>
              )}
              {agentesActivos.length > 1 && (
                <p className="flex items-center gap-1.5 text-[12px] text-gold">
                  <span className="flex h-4 w-4 items-center justify-center">
                    <span className="h-1.5 w-1.5 animate-ping rounded-full bg-gold" />
                  </span>
                  {agentesActivos.length} agentes trabajando en paralelo…
                </p>
              )}
              {messages.length === 1 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="cursor-pointer rounded-full border border-primary/30 bg-primary/[0.07] px-3 py-1.5 text-[11.5px] text-primary transition-colors hover:border-primary hover:bg-primary/15 active:scale-[0.98]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="border-t border-border p-3"
            >
              {queue.length > 0 && (
                <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-border/70 bg-primary/[0.05] px-2.5 py-1.5">
                  <span className="flex-none text-[10.5px] font-semibold uppercase tracking-wide text-primary">
                    En cola ({queue.length})
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    {queue.map((q, i) => (
                      <p key={i} className="truncate text-[10.5px] text-muted-foreground">
                        {i + 1}. {q}
                      </p>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={limpiarCola}
                    aria-label="Vaciar cola de preguntas"
                    className="flex-none rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="mb-2 flex items-center gap-2">
                <Select
                  value={model}
                  onValueChange={(v) => {
                    setModel(v);
                    setModelInfo(obtenerModelo(v));
                  }}
                >
                  <SelectTrigger
                    aria-label="Modelo del asistente"
                    className="h-8 w-auto flex-none rounded-lg border-border/70 px-2.5 text-[11px] shadow-none focus:ring-primary/50"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-w-[300px]">
                    <SelectGroup>
                      <SelectLabel className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
                        {CATEGORIA_RAPIDEZ_LABEL}
                      </SelectLabel>
                      {MODELOS_RAPIDEZ.map((m) => (
                        <SelectItem
                          key={m.id}
                          value={m.id}
                          className="text-[12px] leading-tight"
                          title={m.descripcion}
                        >
                          {m.nombre}
                          <span className="block truncate text-[10.5px] text-muted-foreground">
                            {m.editor} · {m.descripcion.slice(0, 60)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
                        {CATEGORIA_RAZONAMIENTO_LABEL}
                      </SelectLabel>
                      {MODELOS_RAZONAMIENTO.map((m) => (
                        <SelectItem
                          key={m.id}
                          value={m.id}
                          className="text-[12px] leading-tight"
                          title={m.descripcion}
                        >
                          {m.nombre}
                          <span className="block truncate text-[10.5px] text-muted-foreground">
                            {m.editor} · {m.descripcion.slice(0, 60)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <p className="min-w-0 flex-1 truncate text-[10.5px] leading-snug text-muted-foreground">
                  <span className="font-medium text-foreground/70">{modelInfo.nombre}</span>
                  {" · "}
                  {modelInfo.descripcion}
                </p>
              </div>
              <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-primary/60">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  placeholder="Escribí tu consulta…"
                  className="max-h-28 flex-1 resize-none bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="submit"
                  disabled={!input.trim()}
                  aria-label="Enviar"
                  title={loading ? "Interrumpe la respuesta en curso y envía" : "Enviar"}
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
                {loading && (
                  <button
                    type="button"
                    onClick={cancelCurrent}
                    aria-label="Detener respuesta en curso"
                    title="Detener la respuesta actual (la siguiente en cola arranca ya)"
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-destructive/40 bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-2 text-center text-[10.5px] leading-snug text-muted-foreground">
                Información general. No constituye recomendación de inversión.
              </p>
            </form>
          </>
        )}
      </aside>
    </>
  );
}
