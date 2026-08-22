import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LayoutTemplate, Sparkles, FlaskConical, Terminal, Code } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SlideCanvas } from "@/components/studio/SlideCanvas";
import { LabPanel } from "@/components/studio/LabPanel";
import { ScriptsPanel } from "@/components/studio/ScriptsPanel";
import { TerminalPanel } from "@/components/studio/TerminalPanel";
import { ContextExplorer } from "@/components/studio/ContextExplorer";
import { ChatPanel } from "@/components/studio/ChatPanel";
import {
  fileToBase64,
  kindOf,
  MAX_DOC_BYTES,
  MAX_IMG_BYTES,
  parseCsv,
  parseJson,
  parsePdf,
  parseText,
  parseXlsx,
} from "@/lib/parsing";
import type {
  ChatTurn,
  ContextSegment,
  PreviewRef,
  SlideSpec,
  StudioFile,
  StudioSession,
} from "@/lib/types";
import {
  generateSlideBackground,
  readImageFile,
  studioTurn,
  agentTurn,
} from "@/lib/ai/studio.functions";
import {
  saveContextItem,
  setContextItemActive,
  deleteContextItem,
  listContextItems,
  saveSession,
  loadSession,
  listSessions,
} from "@/lib/ai/context.functions";

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [
      { title: "Coronar Inversiones Studio — Contenido y análisis" },
      {
        name: "description",
        content:
          "Estudio de análisis y contenido para asesores financieros: chat con memoria, contexto segmentado y edición visual.",
      },
      { property: "og:title", content: "Coronar Inversiones Studio" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Studio,
});

function uid() {
  return crypto.randomUUID();
}

const WELCOME =
  "Listo. Cargá material en el explorador: en Referencias los formatos, plantillas y estilos a replicar; en Datos la información sobre la que razono. Podés pegar texto o guardar fuentes de la web. Después pedime una lectura, una placa o un informe.";

function newSession(index: number): StudioSession {
  return {
    id: uid(),
    title: `Sesión ${index}`,
    files: [],
    turns: [{ id: uid(), role: "assistant", content: WELCOME }],
    slide: null,
    queue: [],
    busy: false,
    lastProvider: null,
  };
}

function Studio() {
  const runTurn = useServerFn(studioTurn);
  const runAgent = useServerFn(agentTurn);
  const runBackground = useServerFn(generateSlideBackground);
  const runVision = useServerFn(readImageFile);
  const fnSaveContext = useServerFn(saveContextItem);
  const fnToggleContext = useServerFn(setContextItemActive);
  const fnDeleteContext = useServerFn(deleteContextItem);
  const fnListContext = useServerFn(listContextItems);
  const fnSaveSession = useServerFn(saveSession);
  const fnLoadSession = useServerFn(loadSession);
  const fnListSessions = useServerFn(listSessions);

  const [sessions, setSessions] = useState<StudioSession[]>(() => [newSession(1)]);
  const [activeId, setActiveId] = useState<string>("");
  const [input, setInput] = useState("");
  const [useWeb, setUseWeb] = useState(false);
  const [useAgent, setUseAgent] = useState(true); // agente autónomo por defecto
  const [previewRef, setPreviewRef] = useState<PreviewRef | null>(null);
  const [centerTab, setCenterTab] = useState<"preview" | "lab" | "scripts" | "terminal">("preview");
  const [pendingTerminalCommand, setPendingTerminalCommand] = useState<string | null>(null);

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const patch = useCallback((id: string, updater: (session: StudioSession) => StudioSession) => {
    setSessions((prev) => prev.map((session) => (session.id === id ? updater(session) : session)));
  }, []);
  const patchRef = useRef(patch);
  patchRef.current = patch;

  useEffect(() => {
    if (!activeId && sessions[0]) setActiveId(sessions[0].id);
  }, [activeId, sessions]);

  // Cargar contexto desde Supabase al montar o cambiar de sesion
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    const p = patchRef.current;
    fnListContext({ data: { conversationId: activeId } }).then((res) => {
      if (cancelled || !res.ok || !res.items?.length) return;
      p(activeId, (session) => {
        const existentes = new Set(session.files.map((f) => f.name + f.kind + f.segment));
        const nuevos = res.items
          .filter((item) => !existentes.has(item.name + item.kind + item.segment))
          .map((item) => ({
            id: item.id,
            name: item.name,
            kind: item.kind,
            mimeType: "text/plain" as const,
            sizeBytes: item.text_content.length,
            status: "ready" as const,
            text: item.text_content,
            active: item.active,
            segment: (item.segment === "reference" ? "reference" : "data") as ContextSegment,
            source: item.source as "file" | "paste" | "web" | "answer",
            url: item.url,
          }));
        if (!nuevos.length) return session;
        return { ...session, files: [...session.files, ...nuevos] };
      });
    });
    return () => { cancelled = true; };
  }, [activeId, fnListContext]);

  const active = sessions.find((s) => s.id === activeId) ?? sessions[0];
  const activeFiles = active.files.filter((f) => f.active && f.status === "ready");

  /* ---------------- contexto ---------------- */

  const handleUpload = useCallback(
    async (list: FileList | null, segment: ContextSegment) => {
      if (!list) return;
      const sessionId = activeId;
      for (const file of Array.from(list)) {
        const kind = kindOf(file);
        const limit = kind === "image" ? MAX_IMG_BYTES : MAX_DOC_BYTES;
        if (file.size > limit) {
          toast.error(`${file.name} supera el tamaño máximo permitido.`);
          continue;
        }
        const id = uid();
        patch(sessionId, (session) => ({
          ...session,
          files: [
            ...session.files,
            {
              id,
              name: file.name,
              kind,
              mimeType: file.type,
              sizeBytes: file.size,
              status: "extracting",
              text: "",
              active: true,
              segment,
              source: "file",
            },
          ],
        }));

        try {
          let text = "";
          let structured: StudioFile["structured"] = null;
          if (kind === "pdf") ({ text } = await parsePdf(file));
          else if (kind === "xlsx") ({ text, structured = null } = await parseXlsx(file));
          else if (kind === "csv") ({ text, structured = null } = await parseCsv(file));
          else if (kind === "json") ({ text, structured = null } = await parseJson(file));
          else if (kind === "image") {
            const base64 = await fileToBase64(file);
            const result = await runVision({ data: { base64, mime: file.type || "image/png" } });
            if (!result.ok) throw new Error(result.error);
            text = result.text;
          } else ({ text } = await parseText(file));

          patch(sessionId, (session) => ({
            ...session,
            files: session.files.map((item) =>
              item.id === id ? { ...item, status: "ready", text, structured } : item,
            ),
          }));
          // Persistir a Supabase
          fnSaveContext({ data: {
            conversationId: sessionId,
            segment,
            source: "file",
            name: file.name,
            kind,
            text,
            active: true,
          } });
        } catch (error) {
          patch(sessionId, (session) => ({
            ...session,
            files: session.files.map((item) =>
              item.id === id
                ? {
                    ...item,
                    status: "error",
                    error: error instanceof Error ? error.message : "Error de extracción",
                  }
                : item,
            ),
          }));
          toast.error(`No pude extraer ${file.name}`);
        }
      }
    },
    [activeId, patch, runVision],
  );

  const handleAddText = useCallback(
    (payload: {
      name: string;
      text: string;
      segment: ContextSegment;
      source: "paste" | "web";
      url?: string;
      kind?: string;
    }) => {
      const file: StudioFile = {
        id: uid(),
        name: payload.name,
        kind: payload.kind ?? "txt",
        mimeType: "text/plain",
        sizeBytes: payload.text.length,
        status: "ready",
        text: payload.text,
        active: true,
        segment: payload.segment,
        source: payload.source,
        url: payload.url ?? null,
      };
      patch(activeId, (session) => ({ ...session, files: [...session.files, file] }));
      // Persistir a Supabase
      fnSaveContext({ data: {
        conversationId: activeId,
        segment: payload.segment,
        source: payload.source,
        name: payload.name,
        kind: payload.kind ?? "txt",
        text: payload.text,
        active: true,
        url: payload.url ?? null,
      } });
    },
    [activeId, patch, fnSaveContext],
  );

  const handleToggle = useCallback(
    (id: string) => {
      patch(activeId, (session) => {
        const item = session.files.find((f) => f.id === id);
        if (!item) return session;
        fnToggleContext({ data: { id, active: !item.active } });
        return {
          ...session,
          files: session.files.map((f) =>
            f.id === id ? { ...f, active: !f.active } : f,
          ),
        };
      });
    },
    [activeId, patch, fnToggleContext],
  );

  const handleRemove = useCallback(
    (id: string) => {
      patch(activeId, (session) => ({
        ...session,
        files: session.files.filter((item) => item.id !== id),
      }));
      fnDeleteContext({ data: { id } });
    },
    [activeId, patch, fnDeleteContext],
  );

  const handleSaveAnswer = useCallback(
    (turn: ChatTurn) => {
      handleAddText({
        name: `Respuesta guardada · ${new Date().toLocaleString()}`,
        text: turn.content,
        segment: "data",
        source: "paste",
      });
      toast.success("Guardado en contexto");
    },
    [handleAddText],
  );

  const handleCopyTurn = useCallback((content: string) => {
    navigator.clipboard.writeText(content).then(() => toast.success("Copiado al portapapeles")).catch(() => {});
  }, []);

  const handleEditTurn = useCallback((turn: ChatTurn) => {
    setInput(turn.content);
    // Opcional: eliminar el turno editado de la sesion
    patch(activeId, (session) => ({
      ...session,
      turns: session.turns.filter((t) => t.id !== turn.id),
    }));
  }, [activeId, patch]);

  const handleDeleteTurn = useCallback((id: string) => {
    patch(activeId, (session) => ({
      ...session,
      turns: session.turns.filter((t) => t.id !== id),
    }));
  }, [activeId, patch]);

  const handleCancelQueue = useCallback((index: number) => {
    patch(activeId, (session) => ({
      ...session,
      queue: session.queue.filter((_, i) => i !== index),
    }));
  }, [activeId, patch]);

  /* ---------------- chat con cola ---------------- */

  const runOne = useCallback(
    async (sessionId: string, message: string, elementId: string | null) => {
      const session = sessionsRef.current.find((s) => s.id === sessionId);
      if (!session) return;
      const files = session.files.filter((f) => f.active && f.status === "ready");

      patch(sessionId, (s) => ({
        ...s,
        turns: [...s.turns, { id: uid(), role: "user", content: message }],
      }));

      try {
        const result = useAgent
          ? await runAgent({
              data: {
                conversationId: sessionId,
                message,
                history: session.turns
                  .filter((t) => t.role !== "system")
                  .slice(-6)
                  .map((t) => ({ role: t.role as "user" | "assistant", content: t.content })),
                files: files.map((f) => ({
                  name: f.name,
                  kind: f.kind,
                  text: f.text,
                  segment: f.segment,
                })),
                selectedElementId: elementId,
                currentSlide: session.slide,
                useWeb,
                useAgent: true,
              },
            })
          : await runTurn({
              data: {
                conversationId: sessionId,
                message,
                history: session.turns
                  .filter((t) => t.role !== "system")
                  .slice(-6)
                  .map((t) => ({ role: t.role as "user" | "assistant", content: t.content })),
                files: files.map((f) => ({
                  name: f.name,
                  kind: f.kind,
                  text: f.text,
                  segment: f.segment,
                })),
                selectedElementId: elementId,
                currentSlide: session.slide,
                useWeb,
              },
            });

        const raw: any = result;
        if (!raw.ok) {
          const errMsg = raw.error ?? "Error desconocido";
          patch(sessionId, (s) => ({
            ...s,
            turns: [
              ...s.turns,
              { id: uid(), role: "assistant", content: `No pude completar la respuesta: ${errMsg}` },
            ],
          }));
          toast.error("No pude completar la respuesta");
          return;
        }

        patch(sessionId, (s) => ({
          ...s,
          lastProvider: `${raw.provider} · ${String(raw.model).split("/").pop()}`,
          title:
            s.turns.filter((t) => t.role === "user").length === 0
              ? message.slice(0, 28)
              : s.title,
          turns: [
            ...s.turns,
            {
              id: uid(),
              role: "assistant",
              content: raw.text,
              provider: raw.provider,
              model: raw.model,
              intent: raw.intent ?? "",
              checks: raw.checks,
              agentTrace: raw.agentTrace,
            },
          ],
          slide: raw.slide ?? s.slide,
        }));

        const spec = raw.slide as SlideSpec | null;
        if (spec?.background.prompt && !spec.background.imageUrl) {
          const bg = await runBackground({
            data: { prompt: spec.background.prompt, highQuality: /alta calidad/i.test(message) },
          });
          if (bg.ok) {
            patch(sessionId, (s) => ({
              ...s,
              slide: s.slide
                ? { ...s.slide, background: { ...s.slide.background, imageUrl: bg.url } }
                : s.slide,
            }));
          }
        }
      } catch (error) {
        patch(sessionId, (s) => ({
          ...s,
          turns: [
            ...s.turns,
            {
              id: uid(),
              role: "assistant",
              content: `Error inesperado: ${error instanceof Error ? error.message : "desconocido"}`,
            },
          ],
        }));
      }
    },
    [patch, runBackground, runTurn, runAgent, useWeb, useAgent],
  );

  const drainingRef = useRef(false);

  const drain = useCallback(
    async (sessionId: string) => {
      if (drainingRef.current) return;
      drainingRef.current = true;
      patch(sessionId, (s) => ({ ...s, busy: true }));

      while (true) {
        const session = sessionsRef.current.find((s) => s.id === sessionId);
        const next = session?.queue?.[0];
        if (!next) break;
        patch(sessionId, (s) => ({ ...s, queue: s.queue.slice(1) }));
        await new Promise((resolve) => setTimeout(resolve, 0));
        const [message, elementId] = next.split("\u0000");
        await runOne(sessionId, message, elementId || null);
      }

      drainingRef.current = false;
      patch(sessionId, (s) => ({ ...s, busy: false }));
    },
    [patch, runOne],
  );

  const submit = useCallback(async () => {
    const message = input.trim();
    if (!message) return;
    const elementId = previewRef?.elementId ?? "";
    setInput("");
    setPreviewRef(null);

    if (!drainingRef.current) {
      drainingRef.current = true;
      patch(activeId, (s) => ({ ...s, busy: true }));
      try {
        await runOne(activeId, message, elementId || null);
      } finally {
        drainingRef.current = false;
        patch(activeId, (s) => ({ ...s, busy: false }));
      }
    } else {
      patch(activeId, (s) => ({ ...s, queue: [...s.queue, `${message}\u0000${elementId}`] }));
    }
  }, [activeId, input, patch, previewRef, runOne]);

  return (
    <div className="studio-bg flex h-screen flex-col text-foreground">
      <header className="flex items-center justify-between px-4 py-3">
        <div>
          <div className="text-sm font-semibold tracking-tight">Coronar Inversiones Studio</div>
          <div className="kicker">Agente de contenido · Matrícula 2192</div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {active.lastProvider && (
            <span className="num rounded-full border border-border/60 bg-surface/40 px-2.5 py-1 text-muted-foreground backdrop-blur">
              {active.lastProvider}
            </span>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 p-3 pt-0">
<div className="flex w-[290px] shrink-0 flex-col" style={{ resize: "horizontal", overflow: "auto" }}>
          <ContextExplorer
            files={activeFiles}
            onUpload={(list, segment) => void handleUpload(list, segment)}
            onAddText={handleAddText}
            onToggle={handleToggle}
            onRemove={handleRemove}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="glass flex min-h-0 flex-col rounded-xl h-full">
            <div className="flex items-center gap-1 border-b border-border/60 p-2">
              {(
                [
                  { id: "preview", label: "Vista previa", icon: LayoutTemplate },
                  { id: "lab", label: "Laboratorio", icon: FlaskConical },
                  { id: "scripts", label: "Scripts", icon: Code },
                  { id: "terminal", label: "Terminal", icon: Terminal },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCenterTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors",
                    centerTab === tab.id
                      ? "bg-surface-2 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <tab.icon className="size-3" /> {tab.label}
                </button>
              ))}
              {previewRef && (
                <span className="ml-auto truncate text-[10px] text-muted-foreground">
                  elemento seleccionado → instrucción en el chat
                </span>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {centerTab === "terminal" ? (
                <TerminalPanel pendingCommand={pendingTerminalCommand} />
              ) : centerTab === "scripts" ? (
                <ScriptsPanel
                  contextFiles={activeFiles}
                  onRunInTerminal={(cmd) => { setPendingTerminalCommand(cmd); setCenterTab("terminal"); }}
                />
              ) : centerTab === "lab" ? (
                <LabPanel
                  files={activeFiles.map((f) => ({ name: f.name, kind: f.kind, text: f.text }))}
                />
              ) : active.slide ? (
                <SlideCanvas
                  spec={active.slide}
                  selectedId={previewRef?.elementId ?? null}
                  onSelect={(id) => {
                    if (!id) {
                      setPreviewRef(null);
                      return;
                    }
                    const element = active.slide?.elements.find((el) => el.id === id);
                    setPreviewRef({
                      elementId: id,
                      label:
                        element?.text ?? element?.label ?? element?.value ?? element?.type ?? id,
                    });
                  }}
                />
              ) : (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center">
                  <Sparkles className="size-5 text-muted-foreground" />
                  <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                    Acá aparece la placa, el informe o el gráfico. Hacé click sobre cualquier
                    elemento y se adjunta al chat para pedir el cambio en lenguaje natural.
                  </p>
                </div>
              )}
            </div>
          </main>
        </div>
        <div className="flex w-[340px] shrink-0 flex-col" style={{ resize: "horizontal", overflow: "auto", direction: "rtl" }}>
          <div style={{ direction: "ltr" }}>
            <ChatPanel
              sessions={sessions}
              activeId={active.id}
              onSelectSession={setActiveId}
              onNewSession={() => {
                const session = newSession(sessions.length + 1);
                setSessions((prev) => [...prev, session]);
                setActiveId(session.id);
                setPreviewRef(null);
              }}
              onCloseSession={(id) => {
                setSessions((prev) => {
                  const rest = prev.filter((s) => s.id !== id);
                  if (id === activeId && rest[0]) setActiveId(rest[0].id);
                  return rest.length ? rest : [newSession(1)];
                });
              }}
              turns={active.turns}
              queue={active.queue.map((q) => q.split("\u0000")[0])}
              busy={active.busy}
              input={input}
              onInput={setInput}
              onSubmit={submit}
              useWeb={useWeb}
              onToggleWeb={() => setUseWeb((prev) => !prev)}
              useAgent={useAgent}
              onToggleAgent={() => setUseAgent((prev) => !prev)}
              previewRef={previewRef}
              onClearPreviewRef={() => setPreviewRef(null)}
              activeCount={activeFiles.length}
              onSaveAnswer={handleSaveAnswer}
              onDropFile={(name, text, kind, segment) => {
                handleAddText({ name, text, segment: (segment === "reference" ? "reference" : "data") as ContextSegment, source: "paste", kind });
                setInput(`Analizá este archivo: ${name}. Validá su contenido contra la web y decime si es correcto.`);
                setTimeout(submit, 100);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
