import { useEffect, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, X, Send, Globe, Loader2, Plus, FileText, ClipboardPaste, BookmarkCheck, History, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { agentTurn, runCommand, routeAiTask } from "@/lib/ai/studio.functions";
import type { ToolCallTrace } from "@/lib/types";

type SessionMessage = { role:"user"|"assistant"; content:string; trace?: ToolCallTrace[] };
type ChatSession = { id:string; title:string; messages:SessionMessage[]; files:{name:string;text:string}[]; web:boolean; persisted:boolean };

let sid = 0;
function uid() { return `s${++sid}-${Date.now().toString(36)}`; }

function newSession(): ChatSession {
  return { id: uid(), title: "Nuevo", messages: [{ role:"assistant", content:"Soy el agente de Coronar Inversiones. Puedo ejecutar comandos, buscar en la web, leer archivos del proyecto, consultar datos financieros via Flask, y tengo memoria de sesion. Que necesitas?" }], files: [], web: false, persisted: false };
}

export function AgentChat() {
  // Escuchar eventos de click-to-analyze
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (typeof msg === "string") setInput(msg);
    };
    window.addEventListener("ai:inject", handler);
    return () => window.removeEventListener("ai:inject", handler);
  }, []);
  const runAgent = useServerFn(agentTurn);
  const exec = useServerFn(runCommand);
  const routeTask = useServerFn(routeAiTask);

  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([newSession()]);
  const [activeId, setActiveId] = useState<string>("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [cacheReady, setCacheReady] = useState(false);
  const [cacheStatus, setCacheStatus] = useState("");
  const [dbReady, setDbReady] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<Array<{ id: string; title: string }>>([]);

  const active = sessions.find((s) => s.id === activeId) ?? sessions[0];
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!activeId && sessions[0]) setActiveId(sessions[0].id); }, [activeId, sessions]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [active.messages, busy]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 200); }, [open]);

  // --- Load conversation list from Supabase (for history popover only; no autoload) ---
  useEffect(() => {
    (async () => {
      try {
        const { listConversations } = await import("@/lib/ai/history.functions");
        const convs = await listConversations();
        if (convs.ok) setHistoryItems(convs.items.map((c: any) => ({ id: c.id, title: c.title })));
      } catch {}
      setDbReady(true);
    })();
  }, []);

  // --- Project cache: explore once (UN SOLO shell call, no 4 spawns) ---
  const warmCache = useCallback(async () => {
    if (cacheReady) return;
    setCacheStatus("Explorando proyecto...");
    try {
      const res = await exec({
        data: {
          command:
            "(Get-ChildItem -Path 'src' -Directory -ErrorAction SilentlyContinue|Measure-Object).Count," +
            "(Get-ChildItem -Path 'src/routes' -Name -ErrorAction SilentlyContinue|Measure-Object).Count," +
            "(Get-ChildItem -Path 'src/lib' -Directory -ErrorAction SilentlyContinue|Measure-Object).Count," +
            "(Get-ChildItem -Path 'src/components' -Directory -ErrorAction SilentlyContinue|Measure-Object).Count" +
            " -join ','",
        },
      });
      let dirs = "?", rutas = "?", lib = "?", comp = "?";
      if (res.ok) {
        const parts = res.output.trim().split(",").map((n) => n.trim());
        if (parts.length >= 4) {
          dirs = parts[0]; rutas = parts[1]; lib = parts[2]; comp = parts[3];
        }
      }
      setCacheStatus(`Proyecto: src/ -> ${dirs} dirs, ${rutas} rutas, ${lib} modulos, ${comp} componentes`);
      setCacheReady(true);
    } catch { setCacheStatus("Cache fallo"); setCacheReady(true); }
  }, [exec, cacheReady]);

  useEffect(() => { if (open && !cacheReady) warmCache(); }, [open, cacheReady, warmCache]);


  // --- Session management with Supabase persistence ---
  const saveSessionToDb = useCallback(async (session: ChatSession) => {
    try {
      const { createConversation, appendMessage, renameConversation } = await import("@/lib/ai/history.functions");
      let convId = session.persisted ? session.id : null;
      if (!convId) {
        const created = await createConversation({ data: { title: session.title } });
        if (created.ok && created.conversation) {
          convId = created.conversation.id;
          setSessions(prev => prev.map(s => s.id === session.id ? { ...s, id: convId!, persisted: true } : s));
        }
      }
      if (convId) {
        if (session.title && session.messages.filter(m => m.role === "user").length === 1) {
          await renameConversation({ data: { conversationId: convId, title: session.title } });
        }
      }
    } catch {}
  }, []);

  const switchSession = useCallback((id: string) => { setActiveId(id); setShowHistory(false); }, []);
  const addSession = useCallback(() => { const s = newSession(); setSessions([s]); setActiveId(s.id); }, []);
  const closeSession = useCallback((id: string) => {
    setSessions(prev => {
      if (prev.length === 1) return [newSession()];
      const next = prev.filter(s => s.id !== id);
      return next.length ? next : [newSession()];
    });
    setActiveId("");
  }, []);

  const patch = useCallback((id:string, upd:(s:ChatSession)=>ChatSession) => {
    setSessions(p=>p.map(s=>s.id===id?upd(s):s));
  }, []);

  // --- Save messages to Supabase after each turn ---
  const persistMessage = useCallback(async (sessionId: string, role: string, content: string, provider?: string, model?: string) => {
    try {
      const { appendMessage } = await import("@/lib/ai/history.functions");
      await appendMessage({ data: { conversationId: sessionId, role: role as any, content, provider, model } });
    } catch {}
  }, []);

  // --- File handling ---
  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const newFiles: {name:string;text:string}[] = [];
    let loaded = 0;
    for (const f of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string || "";
        newFiles.push({ name: f.name, text: text.slice(0, 100_000) });
        loaded++;
        if (loaded === files.length) {
          patch(activeId, (s) => ({ ...s, files: [...s.files, ...newFiles] }));
        }
      };
      reader.readAsText(f);
    }
  }, [activeId, patch]);

  const handlePaste = useCallback(() => {
    const text = prompt("Pega el texto para agregar como contexto:");
    if (text?.trim()) {
      patch(activeId, (s) => ({ ...s, files: [...s.files, { name: `pegar_${s.files.length+1}.txt`, text: text.trim() }] }));
    }
  }, [activeId, patch]);

  // --- Map routes to page-specific tools/help ---
  const pageTools: Record<string, { name: string; tools: string }> = {
    "/": { name: "Dashboard", tools: "Ver dashboard diario, intermarket, noticias, contexto macro, tipo de cambio, tasas, ONs" },
    "/studio": { name: "Studio", tools: "Chat con IA, contexto (Referencias/Datos), slides, scripts, terminal, auditar, validar con web, generar campañas de captacion" },
    "/herramientas": { name: "Analisis Tecnico", tools: "Semaforo de mercado (COMPRA/MANTENER/VENTA), RSI, MACD, SMA, soportes/resistencias, backtesting de senales. Tab Analisis Fundamental: Dashboard manual y portafolio IOL" },
  };

  // --- Build UI context string from current browser state ---
  const getUiContext = useCallback((): string => {
    if (typeof window === "undefined") return "";
    const path = window.location.pathname;
    const parts: string[] = [];
    parts.push(`Ruta actual: ${path}`);
    parts.push(`Titulo: ${document.title}`);

    // Pagina actual y herramientas disponibles
    const pagina = Object.entries(pageTools).find(([ruta]) => path.startsWith(ruta));
    if (pagina) {
      parts.push(`Pagina: ${pagina[1].name}`);
      parts.push(`Herramientas disponibles en esta pagina: ${pagina[1].tools}`);
    }

    // Datos estructurados con data-ai-label
    try {
      const labeled = document.querySelectorAll<HTMLElement>("[data-ai-label]");
      if (labeled.length) {
        const datos: string[] = [];
        labeled.forEach((el) => {
          const label = el.getAttribute("data-ai-label") ?? "";
          const value = el.getAttribute("data-ai-value") ?? el.textContent?.trim() ?? "";
          const section = el.closest<HTMLElement>("[data-ai-section]")?.getAttribute("data-ai-section") ?? "";
          if (label && value) datos.push(`  [${section}] ${label}: ${value}`);
        });
        if (datos.length) parts.push(`Datos estructurados:\n${datos.join("\n")}`);
      }
    } catch {}

    // Formularios y botones visibles
    try {
      const inputs = document.querySelectorAll<HTMLElement>("input, select, textarea, button:not([aria-label]), [role=button]");
      const interactivos: string[] = [];
      inputs.forEach((el) => {
        const tag = el.tagName.toLowerCase();
        const name = (el as HTMLInputElement).name || (el as HTMLInputElement).placeholder || (el as HTMLElement).textContent?.trim() || "";
        const type = (el as HTMLInputElement).type || tag;
        if (name && name.length > 1 && !["hidden", "submit"].includes(type)) {
          interactivos.push(`  ${tag}[${type}]: "${name.slice(0, 60)}"`);
        }
      });
      if (interactivos.length) parts.push(`Formularios y acciones disponibles:\n${interactivos.slice(0, 20).join("\n")}`);
    } catch {}

    return parts.join("\n");
  }, []);

  // --- Submit ---
  const submit = useCallback(async () => {
    const msg = input.trim();
    if (!msg || busy) return;
    setInput("");
    const sessionId = activeId;
    patch(sessionId, (s) => ({ ...s, messages: [...s.messages, { role:"user", content:msg }] }));
    setBusy(true);
    try {
      // Build UI context
      const uiCtx = getUiContext();
      const res = await runAgent({
        data: {
          message: msg,
          history: active.messages.slice(-6).map(m=>({role:m.role, content:m.content})),
          files: active.files.map(f=>({ name:f.name, kind:f.name.endsWith(".py")?"py":"txt", text:f.text })),
          useWeb: active.web,
          useAgent: true,
          uiContext: uiCtx || null,
        },
      });
      const r: any = res;
      // agentTurn devuelve { ok: true/false, text, provider, model, agentTrace }
      const text = (r?.text ?? r?.content ?? "").trim();
      if (r?.ok) {
        patch(sessionId, (s) => ({
          ...s,
          messages: [...s.messages, { role:"assistant", content: text, trace: r.agentTrace }],
          title: s.messages.filter(m=>m.role==="user").length === 1 ? msg.slice(0, 24) : s.title,
        }));
        // Persist to Supabase
        await saveSessionToDb(active);
        await persistMessage(sessionId, "user", msg);
        await persistMessage(sessionId, "assistant", text, r.provider, r.model);
      } else {
        const errMsg = text || `Error: ${r?.error ?? r?.message ?? "Respuesta inválida del servidor"}`;
        patch(sessionId, (s) => ({ ...s, messages: [...s.messages, { role:"assistant", content: errMsg }] }));
        await persistMessage(sessionId, "user", msg);
        await persistMessage(sessionId, "assistant", errMsg);
      }
    } catch (e: any) {
      const raw = e?.message ?? e?.name ?? "";
      const errMsg = `Error: ${raw || "Excepción desconocida al conectar con el agente"}`;
      patch(sessionId, (s) => ({ ...s, messages: [...s.messages, { role:"assistant", content: errMsg }] }));
    }
    setBusy(false);
  }, [input, busy, activeId, active, active.messages, active.files, active.web, runAgent, patch, saveSessionToDb, persistMessage, getUiContext]);

  const refreshHistory = useCallback(() => {
    (async () => {
      try {
        const { listConversations } = await import("@/lib/ai/history.functions");
        const convs = await listConversations();
        if (convs.ok) setHistoryItems(convs.items.map((c: any) => ({ id: c.id, title: c.title })));
      } catch {}
    })();
  }, []);

  const openHistory = useCallback(async (c: { id: string; title: string }) => {
    setShowHistory(false);
    const { loadConversation } = await import("@/lib/ai/history.functions");
    const msgs = await loadConversation({ data: { conversationId: c.id } });
    const next = newSession();
    setSessions([{
      ...next,
      id: c.id,
      title: c.title,
      persisted: true,
      messages: (msgs.messages ?? []).map((m: any) => ({ role: m.role, content: m.content })),
    }]);
    setActiveId(c.id);
  }, []);

  const deleteHistory = useCallback(async (c: { id: string; title: string }) => {
    try {
      const { deleteConversation } = await import("@/lib/ai/history.functions");
      await deleteConversation({ data: { conversationId: c.id } });
      setHistoryItems((prev) => prev.filter((h) => h.id !== c.id));
    } catch {}
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="flex h-[560px] w-[420px] flex-col rounded-2xl border border-border/40 bg-background/95 shadow-2xl backdrop-blur-xl">
          {/* Header — sin pestañas; siempre un chat nuevo */}
          <div className="flex items-center justify-between border-b border-border/30 px-3 py-1.5">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span className="shrink-0 text-[11px] font-semibold text-foreground">{active.title.slice(0, 18)}</span>
              {sessions.length > 1 && (
                <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0 text-[10px] text-muted-foreground">
                  {sessions.length} chats
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1">
              {cacheStatus && <span className="truncate text-[8px] text-muted-foreground max-w-20" title={cacheStatus}>📦</span>}
              {dbReady && (
                <button type="button" onClick={() => setShowHistory(!showHistory)}
                  className={cn("p-1", showHistory ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                  title="Historial de sesiones">
                  <History className="size-3.5" />
                </button>
              )}
              <button type="button" onClick={addSession} className="p-1 text-muted-foreground hover:text-foreground" title="Nuevo chat">
                <Plus className="size-3.5" />
              </button>
              <button type="button" onClick={() => closeSession(active.id)} className="p-1 text-muted-foreground hover:text-foreground" title="Cerrar chat">
                <X className="size-3.5" />
              </button>
              <button type="button" onClick={() => setOpen(false)} className="p-1 text-muted-foreground hover:text-foreground" title="Minimizar">
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* History popover — permite ver historial de sesiones */}
          {showHistory && (
            <div className="absolute top-10 right-2 z-20 max-h-56 w-64 overflow-y-auto rounded-lg border border-border/50 bg-surface/95 p-1.5 text-xs shadow-lg">
              <div className="mb-1 font-semibold text-foreground">Conversaciones guardadas</div>
              {historyItems.length === 0 ? (
                <span className="block text-[10px] text-muted-foreground">Sin historial.</span>
              ) : (
                <div className="space-y-0.5">
                  {historyItems.map((h) => (
                    <div key={h.id} className="flex items-center justify-between rounded px-1.5 py-1 hover:bg-muted/50">
                      <button type="button"
                        className="truncate text-left text-muted-foreground hover:text-foreground"
                        onClick={() => openHistory(h)} title={`Abrir: ${h.title}`}>
                        {h.title.slice(0, 28)}
                      </button>
                      <button type="button"
                        onClick={() => deleteHistory(h)}
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                        title="Eliminar">
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Files bar (collapsible) */}
          {active.files.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto border-b border-border/20 px-2 py-1">
              <BookmarkCheck className="size-3 text-primary" />
              {active.files.map((f, i) => (
                <span key={i} className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-[9px] text-muted-foreground">{f.name}</span>
              ))}
            </div>
          )}

          {/* Messages */}
          <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {active.messages.map((m, i) => (
              <div key={i} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
                <div className={cn("max-w-[90%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                  m.role === "user" ? "bg-primary/15 text-foreground" : "bg-muted/60 text-foreground/90")}>
                  {m.content}
                  {m.trace?.length ? (
                    <details className="mt-1.5 border-t border-border/40 pt-1">
                      <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                        {m.trace.length} herramienta(s)
                      </summary>
                      <div className="mt-1 space-y-1">
                        {m.trace.map((t, j) => (
                          <div key={j} className="rounded border border-border/30 bg-surface/50 p-1.5 text-[10px]">
                            <span className="font-medium">#{j+1} {t.tool}</span>
                            {t.result && <pre className="mt-0.5 max-h-16 overflow-y-auto text-[9px] text-muted-foreground">{t.result.slice(0,600)}</pre>}
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 pl-1 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> pensando...
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border/30 p-2.5">
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => patch(activeId, (s)=>({...s, web:!s.web}))} className={cn("shrink-0 rounded-full border px-2 py-1 text-[10px] transition-colors", active.web ? "border-primary/50 bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground")}>
                <Globe className="inline size-3" /> web
              </button>
              <button type="button" onClick={handlePaste} title="Pegar texto como contexto" className="shrink-0 rounded-full border border-border/60 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground">
                <ClipboardPaste className="inline size-3" />
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()} title="Subir archivo" className="shrink-0 rounded-full border border-border/60 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground">
                <FileText className="inline size-3" />
              </button>
              <input ref={fileInputRef} type="file" multiple accept=".py,.js,.ts,.txt,.csv,.json,.md,.html" onChange={(e) => handleFiles(e.target.files)} className="hidden" />
              <textarea ref={inputRef as any} value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                placeholder="Escribí..."
                disabled={busy}
                rows={1}
                className="min-w-0 flex-1 resize-none rounded-lg border border-input bg-surface/50 px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              />
              <button type="button" onClick={submit} disabled={!input.trim() || busy}
                className="shrink-0 rounded-lg bg-primary p-1.5 text-primary-foreground disabled:opacity-40">
                <Send className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating button — siempre abre un chat nuevo */}
      {!open && (
        <button type="button"
          onClick={() => { setSessions([newSession()]); setActiveId(""); setShowHistory(false); setOpen(true); }}
          className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-transform hover:scale-105">
          <MessageCircle className="size-5" />
        </button>
      )}
    </div>
  );
}
