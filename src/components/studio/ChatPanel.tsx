import { useEffect, useRef, useState } from "react";
import { BookmarkPlus, ChevronDown, ChevronRight, Copy, Globe, Loader2, Paperclip, Pen, Plus, Send, Terminal, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatTurn, PreviewRef, StudioSession, ToolCallTrace } from "@/lib/types";

type Props = {
  sessions: StudioSession[];
  activeId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onCloseSession: (id: string) => void;
  turns: ChatTurn[];
  queue: string[];
  busy: boolean;
  input: string;
  onInput: (value: string) => void;
  onSubmit: () => void;
  useWeb: boolean;
  onToggleWeb: () => void;
  useAgent: boolean;
  onToggleAgent: () => void;
  previewRef: PreviewRef | null;
  onClearPreviewRef: () => void;
  activeCount: number;
  onSaveAnswer: (turn: ChatTurn) => void;
  onCopyTurn?: (content: string) => void;
  onEditTurn?: (turn: ChatTurn) => void;
  onDeleteTurn?: (id: string) => void;
  onCancelQueue?: (index: number) => void;
  onDropFile?: (name: string, text: string, kind: string, segment?: string) => void;
  onAttachFile?: (file: File) => void;
};

export function ChatPanel({
  sessions,
  activeId,
  onSelectSession,
  onNewSession,
  onCloseSession,
  turns,
  queue,
  busy,
  input,
  onInput,
  onSubmit,
  useWeb,
  onToggleWeb,
  useAgent,
  onToggleAgent,
  previewRef,
  onClearPreviewRef,
  activeCount,
  onSaveAnswer,
  onCopyTurn,
  onEditTurn,
  onDeleteTurn,
  onCancelQueue,
  onDropFile,
  onAttachFile,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, queue, busy]);

  useEffect(() => {
    box.current?.focus();
  }, [activeId, busy]);

  return (
    <section className="glass flex min-h-0 flex-col rounded-xl">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60 p-2">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors",
              session.id === activeId
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <button
              type="button"
              onClick={() => onSelectSession(session.id)}
              className="max-w-32 truncate"
            >
              {session.title}
            </button>
            {session.busy && <Loader2 className="size-3 animate-spin" />}
            {sessions.length > 1 && (
              <button
                type="button"
                onClick={() => onCloseSession(session.id)}
                aria-label="Cerrar sesión"
              >
                <X className="size-3 opacity-60 hover:opacity-100" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={onNewSession}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
          aria-label="Nueva sesión"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {turns.map((turn) => (
          <div key={turn.id} className={cn("group", turn.role === "user" && "flex justify-end")}>
            <div
              className={cn(
                "max-w-[92%] text-sm leading-relaxed whitespace-pre-wrap",
                turn.role === "user"
                  ? "rounded-lg bg-primary/15 px-3 py-2 text-foreground"
                  : "text-foreground/90",
              )}
            >
              {turn.content}
              {turn.checks?.length ? (
                <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
                  {turn.checks.map((check) => (
                    <div key={check.label} className="num text-[11px] text-muted-foreground">
                      <span className={check.ok ? "text-positive" : "text-negative"}>
                        {check.ok ? "✓" : "✕"}
                      </span>{" "}
                      {check.label}: {check.detail}
                    </div>
                  ))}
                </div>
              ) : null}
              {turn.agentTrace?.length ? <AgentTraceView trace={turn.agentTrace} /> : null}
              <div className="mt-1.5 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button type="button" onClick={() => { if (onCopyTurn) { navigator.clipboard.writeText(turn.content); onCopyTurn(turn.content); } }}
                  className="flex items-center gap-1 rounded border border-border/40 px-1.5 py-0.5 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
                  title="Copiar mensaje">
                  <Copy className="size-2.5" /> copiar
                </button>
                {turn.role === "user" && onEditTurn && (
                  <button type="button" onClick={() => onEditTurn(turn)}
                    className="flex items-center gap-1 rounded border border-border/40 px-1.5 py-0.5 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
                    title="Editar mensaje">
                    <Pen className="size-2.5" /> editar
                  </button>
                )}
                {turn.role === "assistant" && (
                  <button type="button" onClick={() => onSaveAnswer(turn)}
                    className="flex items-center gap-1 rounded border border-border/40 px-1.5 py-0.5 text-[9px] text-muted-foreground hover:text-primary transition-colors"
                    title="Guardar como contexto">
                    <BookmarkPlus className="size-2.5" /> contexto
                  </button>
                )}
                {onDeleteTurn && (
                  <button type="button" onClick={() => onDeleteTurn(turn.id)}
                    className="flex items-center gap-1 rounded border border-border/40 px-1.5 py-0.5 text-[9px] text-muted-foreground hover:text-negative transition-colors"
                    title="Eliminar mensaje">
                    <Trash2 className="size-2.5" /> eliminar
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {queue.map((message, index) => (
          <div key={`q-${index}`} className="flex justify-end">
            <div className="max-w-[92%] rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{message}</span>
                <span className="shrink-0 text-[10px] tracking-wide uppercase">en cola</span>
              </div>
              {onCancelQueue && (
                <button type="button" onClick={() => onCancelQueue(index)}
                  className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground hover:text-negative transition-colors">
                  <X className="size-2.5" /> cancelar
                </button>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> pensando…
          </div>
        )}
      </div>

      <form
        className={cn("border-t border-border/60 p-3 transition-colors", dragOver && "bg-primary/5")}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const text = e.dataTransfer.getData("text/plain");
          const name = e.dataTransfer.getData("application/x-file-name");
          const kind = e.dataTransfer.getData("application/x-file-kind");
          const segment = e.dataTransfer.getData("application/x-file-segment");
          if (name && text && onDropFile) {
            onDropFile(name, text, kind || "txt", segment);
          }
        }}
      >
        {dragOver && (
          <div className="mb-2 rounded-md border-2 border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-center text-[11px] text-primary">
            Soltá el archivo para agregarlo al contexto y analizarlo
          </div>
        )}
        {previewRef && (
          <div className="mb-2 flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[11px]">
            <span className="truncate">Editando: {previewRef.label}</span>
            <button type="button" onClick={onClearPreviewRef} aria-label="Quitar selección">
              <X className="size-3" />
            </button>
          </div>
        )}
        <textarea
          ref={box}
          value={input}
          onChange={(event) => onInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          rows={2}
          placeholder={
            previewRef
              ? "Instrucción para el elemento seleccionado…"
              : "Escribí tu pedido. Podés encadenar mensajes sin esperar."
          }
          className="w-full resize-none rounded-md border border-input bg-surface/50 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && onAttachFile) onAttachFile(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-1 transition-colors hover:text-foreground"
              title="Adjuntar imagen (PNG, JPG, WebP)"
            >
              <Paperclip className="size-3" /> adjuntar
            </button>
            <button
              type="button"
              onClick={onToggleWeb}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-1 transition-colors",
                useWeb
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border/60 hover:text-foreground",
              )}
            >
              <Globe className="size-3" /> web
            </button>
            <button
              type="button"
              onClick={onToggleAgent}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-1 transition-colors",
                useAgent
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border/60 hover:text-foreground",
              )}
            >
              <Terminal className="size-3" /> agente
            </button>
            <span className="num">{activeCount} en contexto</span>
          </div>
          <button
            type="submit"
            disabled={!input.trim()}
            className="rounded-md bg-primary p-2 text-primary-foreground disabled:opacity-40"
            aria-label="Enviar"
          >
            <Send className="size-4" />
          </button>
        </div>
      </form>
    </section>
  );
}

/** Muestra la traza de tool_calls del agente: collapsible por grupo. */
function AgentTraceView({ trace }: { trace: ToolCallTrace[] }) {
  const [open, setOpen] = useState(false);
  if (!trace?.length) return null;
  return (
    <div className="mt-2 border-t border-border/60 pt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <Terminal className="size-3" />
        {trace.length} herramienta{trace.length !== 1 ? "s" : ""} usada{trace.length !== 1 ? "s" : ""}
      </button>
      {open && (
        <div className="mt-1 space-y-1.5">
          {trace.map((step, i) => (
            <div key={i} className="rounded border border-border/40 bg-muted/30 p-1.5 text-[11px]">
              <div className="font-medium text-foreground/80">
                #{i + 1} {step.tool}
              </div>
              {argsToText(step.args) && (
                <pre className="mt-0.5 overflow-x-auto text-[10px] text-muted-foreground">
                  {argsToText(step.args)}
                </pre>
              )}
              {step.result && (
                <pre className="mt-0.5 max-h-32 overflow-y-auto rounded bg-surface/50 p-1 text-[10px] text-muted-foreground">
                  {step.result.slice(0, 1500)}
                  {step.result.length > 1500 ? "\n..." : ""}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function argsToText(args: string): string {
  if (!args || args === "{}") return "";
  try {
    const obj = JSON.parse(args);
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "content" && typeof v === "string" && String(v).length > 200) continue;
      if (k === "append") continue;
      filtered[k] = v;
    }
    return JSON.stringify(filtered, null, 1).slice(0, 600);
  } catch {
    return args.slice(0, 600);
  }
}
