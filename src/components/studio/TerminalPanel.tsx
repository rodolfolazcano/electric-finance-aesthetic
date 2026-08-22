import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Terminal, X, Zap, Brain, Send, Play, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { runCommand, generateCommand } from "@/lib/ai/studio.functions";

type HistoryEntry = {
  id: number;
  type: "input" | "output" | "error";
  text: string;
};

type QueuedCommand = {
  id: number;
  request: string;
  command: string;
  status: "pending" | "ready" | "executing" | "done" | "error";
  output?: string;
  mode: "fast" | "powerful";
};

export function TerminalPanel({ pendingCommand }: { pendingCommand?: string | null }) {
  const exec = useServerFn(runCommand);
  const gen = useServerFn(generateCommand);

  const [history, setHistory] = useState<HistoryEntry[]>([
    { id: 0, type: "output", text: "Terminal Coronar Inversiones v1.0 — IA + PowerShell. Escribí un pedido en lenguaje natural." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [modelMode, setModelMode] = useState<"fast" | "powerful">("fast");
  const [queue, setQueue] = useState<QueuedCommand[]>([]);
  const [queueExpanded, setQueueExpanded] = useState(true);

  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);
  const lastPending = useRef<string | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [history]);

  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  useEffect(() => {
    if (pendingCommand && pendingCommand !== lastPending.current && !busy) {
      lastPending.current = pendingCommand;
      handleGenerate(pendingCommand);
    }
  }, [pendingCommand]);

  const handleGenerate = async (text: string) => {
    const cmd = text.trim();
    if (!cmd || busy) return;

    const qid = nextId.current++;
    const entry: QueuedCommand = { id: qid, request: cmd, command: "", status: "pending", mode: modelMode };
    setQueue((q) => [...q, entry]);
    setInput("");

    try {
      const res = await gen({ data: { request: cmd, mode: modelMode } });
      setQueue((q) =>
        q.map((e) => (e.id === qid ? { ...e, command: res.command || "echo comando no generado", status: "ready" } : e)),
      );
    } catch {
      setQueue((q) => q.map((e) => (e.id === qid ? { ...e, command: "", status: "error", output: "Error generando comando" } : e)));
    }
  };

  const handleExecute = async (qid: number) => {
    const item = queue.find((q) => q.id === qid);
    if (!item || item.status === "executing") return;

    setQueue((q) => q.map((e) => (e.id === qid ? { ...e, status: "executing" } : e)));
    setBusy(true);
    setHistory((h) => [...h, { id: nextId.current++, type: "input", text: `PS> ${item.command}` }]);

    try {
      const res = await exec({ data: { command: item.command, timeout: 120 } });
      const output = res.ok ? res.output : `ERROR: ${res.output}`;
      setHistory((h) => [...h, { id: nextId.current++, type: res.ok ? "output" : "error", text: output || "(sin salida)" }]);
      setQueue((q) => q.map((e) => (e.id === qid ? { ...e, status: res.ok ? "done" : "error", output } : e)));
    } catch (err) {
      const msg = `Error de conexión: ${err}`;
      setHistory((h) => [...h, { id: nextId.current++, type: "error", text: msg }]);
      setQueue((q) => q.map((e) => (e.id === qid ? { ...e, status: "error", output: msg } : e)));
    }
    setBusy(false);
  };

  const handleCancel = (qid: number) => {
    setQueue((q) => q.filter((e) => e.id !== qid));
  };

  const handleEdit = (qid: number) => {
    const item = queue.find((q) => q.id === qid);
    if (item) setInput(item.command);
    setQueue((q) => q.filter((e) => e.id !== qid));
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd || busy) return;
    setInput("");
    setHistory((h) => [...h, { id: nextId.current++, type: "input", text: `PS> ${cmd}` }]);
    setBusy(true);
    try {
      const res = await exec({ data: { command: cmd, timeout: 120 } });
      const output = res.ok ? res.output : `ERROR: ${res.output}`;
      setHistory((h) => [...h, { id: nextId.current++, type: res.ok ? "output" : "error", text: output || "(sin salida)" }]);
    } catch (err) {
      setHistory((h) => [...h, { id: nextId.current++, type: "error", text: `Error de conexión: ${err}` }]);
    }
    setBusy(false);
  };

  const clear = () => {
    setHistory([]);
    setQueue([]);
    nextId.current = 1;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGenerate(input);
    }
    if (e.key === "c" && e.ctrlKey && !e.shiftKey) {
      setBusy(false);
      setHistory((h) => [...h, { id: nextId.current++, type: "output", text: "^C" }]);
    }
  };

  return (
    <div className="flex h-full flex-col rounded-lg bg-black font-mono text-[13px] text-green-400">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-green-800/50 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11px] text-green-400/70">
            <Terminal className="size-3" /> terminal
          </span>
          <span className="text-[10px] text-green-600">|</span>
          <button
            type="button"
            onClick={() => setModelMode("fast")}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
              modelMode === "fast"
                ? "bg-green-900/60 text-green-300"
                : "text-green-600 hover:text-green-400"
            }`}
            title="Modelo rápido: captura de intención"
          >
            <Zap className="size-2.5" /> rápido
          </button>
          <button
            type="button"
            onClick={() => setModelMode("powerful")}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
              modelMode === "powerful"
                ? "bg-green-900/60 text-green-300"
                : "text-green-600 hover:text-green-400"
            }`}
            title="Modelo potente: generación de comandos complejos"
          >
            <Brain className="size-2.5" /> potente
          </button>
        </div>
        <button type="button" onClick={clear} className="text-[10px] text-green-400/50 hover:text-green-400" title="Limpiar">
          <X className="size-3" />
        </button>
      </div>

      {/* AI Input */}
      <div className="border-b border-green-800/30 p-2">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={busy}
            rows={2}
            className="w-full resize-none rounded bg-green-950/50 p-2 pr-10 text-[13px] text-green-300 outline-none placeholder:text-green-800 scrollbar-thin"
            placeholder="Ej: listar archivos .tsx, abrir carpeta src, instalar dependencias..."
          />
          <button
            type="button"
            onClick={() => handleGenerate(input)}
            disabled={busy || !input.trim()}
            className="absolute right-2 top-2 rounded p-1 text-green-500 transition-colors hover:bg-green-900/50 hover:text-green-300 disabled:opacity-30"
          >
            <Send className="size-4" />
          </button>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-green-600">
          <span>Enter para generar comando</span>
          <span>·</span>
          <span>Shift+Enter para nueva línea</span>
          <span>·</span>
          <span>Ctrl+C para cancelar</span>
        </div>
      </div>

      {/* Cola de comandos generados */}
      {queue.length > 0 && (
        <div className="border-b border-green-800/30">
          <button
            type="button"
            onClick={() => setQueueExpanded(!queueExpanded)}
            className="flex w-full items-center justify-between px-3 py-1 text-[10px] text-green-500 hover:text-green-300"
          >
            <span>Comandos ({queue.length})</span>
            {queueExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
          {queueExpanded && (
            <div className="max-h-40 space-y-1 overflow-y-auto px-2 pb-2">
              {queue.map((item) => (
                <div
                  key={item.id}
                  className={`rounded border px-2 py-1.5 text-[12px] ${
                    item.status === "executing"
                      ? "border-yellow-700/50 bg-yellow-950/20"
                      : item.status === "error"
                        ? "border-red-800/50 bg-red-950/20"
                        : item.status === "done"
                          ? "border-green-800/30 bg-green-950/20"
                          : "border-green-800/30 bg-green-950/10"
                  }`}
                >
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className="truncate text-green-400/80">{item.request}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      {item.status === "pending" && <Loader2 className="size-3 animate-spin text-yellow-400" />}
                      {item.status === "ready" && (
                        <>
                          <button type="button" onClick={() => handleExecute(item.id)} className="rounded p-0.5 text-green-500 hover:bg-green-900/50" title="Ejecutar">
                            <Play className="size-3" />
                          </button>
                          <button type="button" onClick={() => handleEdit(item.id)} className="rounded p-0.5 text-blue-400 hover:bg-blue-900/50" title="Editar">
                            <Pencil className="size-3" />
                          </button>
                          <button type="button" onClick={() => handleCancel(item.id)} className="rounded p-0.5 text-red-400 hover:bg-red-900/50" title="Cancelar">
                            <Trash2 className="size-3" />
                          </button>
                        </>
                      )}
                      {item.status === "executing" && <Loader2 className="size-3 animate-spin text-yellow-400" />}
                      {item.status === "done" && <span className="text-green-500">✓</span>}
                      {item.status === "error" && <span className="text-red-400">✗</span>}
                    </div>
                  </div>
                  {item.command && (
                    <div className="truncate rounded bg-black/40 px-1.5 py-0.5 text-[11px] text-cyan-300">
                      {item.command}
                    </div>
                  )}
                  {item.output && item.status === "error" && (
                    <div className="mt-0.5 truncate text-[10px] text-red-400">{item.output}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Terminal output */}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto p-2.5" onClick={() => inputRef.current?.focus()}>
        {history.map((entry) => (
          <div key={entry.id} className={`mb-0.5 whitespace-pre-wrap break-all ${
            entry.type === "input" ? "text-cyan-300" :
            entry.type === "error" ? "text-red-400" :
            "text-green-300"
          }`}>
            {entry.text}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-1.5 text-green-400/60">
            <Loader2 className="size-3 animate-spin" /> ejecutando...
          </div>
        )}
      </div>

      {/* Manual input (PS> ) */}
      <form onSubmit={handleManualSubmit} className="flex items-center border-t border-green-800/50 p-1.5">
        <span className="mr-1 shrink-0 text-cyan-300">PS&gt;</span>
        <input
          value={""}
          onChange={() => {}}
          disabled={busy}
          placeholder={busy ? "ejecutando..." : "Get-ChildItem, node, python, git, npm..."}
          className="min-w-0 flex-1 bg-transparent text-green-300 outline-none placeholder:text-green-800"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const target = e.target as HTMLInputElement;
              const cmd = target.value.trim();
              if (!cmd || busy) return;
              target.value = "";
              setHistory((h) => [...h, { id: nextId.current++, type: "input", text: `PS> ${cmd}` }]);
              setBusy(true);
              exec({ data: { command: cmd, timeout: 120 } }).then((res) => {
                setHistory((h) => [...h, { id: nextId.current++, type: res.ok ? "output" : "error", text: (res.ok ? res.output : `ERROR: ${res.output}`) || "(sin salida)" }]);
                setBusy(false);
              }).catch(() => { setBusy(false); });
            }
            if (e.key === "c" && e.ctrlKey && !e.shiftKey) {
              setBusy(false);
              setHistory((h) => [...h, { id: nextId.current++, type: "output", text: "^C" }]);
            }
          }}
        />
      </form>
    </div>
  );
}