import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ClipboardPaste,
  FileText,
  Globe,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Search,
  Sheet,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ContextSegment, StudioFile } from "@/lib/types";
import { webRead, webSearch } from "@/lib/ai/web.functions";

type WebResult = { title: string; url: string; source: string; snippet: string };

const kindIcon: Record<string, typeof FileText> = {
  pdf: FileText,
  xlsx: Sheet,
  csv: Table2,
  json: Table2,
  image: ImageIcon,
  web: Globe,
  txt: FileText,
};

const SEGMENTS: Array<{ id: ContextSegment; label: string; hint: string }> = [
  {
    id: "reference",
    label: "Referencias",
    hint: "Plantillas, formatos de informe, estilos e imágenes a replicar.",
  },
  {
    id: "data",
    label: "Datos",
    hint: "Información y datos duros sobre los que la IA razona y calcula.",
  },
];

type Props = {
  files: StudioFile[];
  onUpload: (list: FileList | null, segment: ContextSegment) => void;
  onAddText: (input: {
    name: string;
    text: string;
    segment: ContextSegment;
    source: "paste" | "web";
    url?: string;
    kind?: string;
  }) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
};

export function ContextExplorer({ files, onUpload, onAddText, onToggle, onRemove }: Props) {
  const runSearch = useServerFn(webSearch);
  const runRead = useServerFn(webRead);
  const fileInput = useRef<HTMLInputElement>(null);

  const [segment, setSegment] = useState<ContextSegment>("data");
  const [mode, setMode] = useState<"files" | "paste" | "web">("files");
  const [pasteName, setPasteName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<WebResult[]>([]);
  const [savingUrl, setSavingUrl] = useState<string | null>(null);

  const visible = files.filter((file) => file.segment === segment);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await runSearch({ data: { query: query.trim(), limit: 6 } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setResults(res.results);
      if (!res.results.length) toast.message("Sin resultados para esa búsqueda.");
    } finally {
      setSearching(false);
    }
  }, [query, runSearch]);

  const saveSource = useCallback(
    async (result: WebResult) => {
      setSavingUrl(result.url);
      try {
        const res = await runRead({ data: { url: result.url } });
        const text = res.ok ? res.text : `${result.title}\n${result.url}\n${result.snippet}`;
        onAddText({
          name: result.title.slice(0, 90),
          text,
          segment,
          source: "web",
          url: result.url,
          kind: "web",
        });
        toast.success(res.ok ? "Fuente guardada en contexto" : "Guardé el resumen de la fuente");
      } finally {
        setSavingUrl(null);
      }
    },
    [onAddText, runRead, segment],
  );

  return (
    <aside className="glass flex min-h-0 flex-col rounded-xl">
      <div className="flex items-center justify-between px-3 pt-3">
        <span className="kicker">Explorador de contexto</span>
        <span className="num text-[10px] text-muted-foreground">
          {files.filter((f) => f.active).length}/{files.length} activos
        </span>
      </div>

      <div className="flex gap-1 p-3 pb-2">
        {SEGMENTS.map((seg) => (
          <button
            key={seg.id}
            type="button"
            onClick={() => setSegment(seg.id)}
            className={cn(
              "flex-1 rounded-md border px-2 py-1.5 text-[11px] transition-colors",
              segment === seg.id
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {seg.label}
          </button>
        ))}
      </div>
      <p className="px-3 pb-2 text-[10px] leading-relaxed text-muted-foreground">
        {SEGMENTS.find((s) => s.id === segment)?.hint}
      </p>

      <div className="flex gap-1 px-3">
        {(
          [
            { id: "files", label: "Archivos", icon: Paperclip },
            { id: "paste", label: "Pegar", icon: ClipboardPaste },
            { id: "web", label: "Web", icon: Globe },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMode(tab.id)}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors",
              mode === tab.id
                ? "bg-surface-2 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon className="size-3" /> {tab.label}
          </button>
        ))}
      </div>

      <div className="p-3">
        {mode === "files" && (
          <>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <Paperclip className="size-3.5" /> Subir a {segment === "reference" ? "referencias" : "datos"}
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                onUpload(event.target.files, segment);
                event.target.value = "";
              }}
            />
          </>
        )}

        {mode === "paste" && (
          <div className="space-y-2">
            <input
              value={pasteName}
              onChange={(event) => setPasteName(event.target.value)}
              placeholder="Nombre (ej: notas de la reunión)"
              className="w-full rounded-md border border-input bg-surface/60 px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
            <textarea
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              rows={6}
              placeholder="Pegá acá el texto que querés usar como contexto…"
              className="w-full resize-none rounded-md border border-input bg-surface/60 px-2 py-2 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              disabled={!pasteText.trim()}
              onClick={() => {
                onAddText({
                  name: pasteName.trim() || `Texto pegado ${new Date().toLocaleTimeString()}`,
                  text: pasteText,
                  segment,
                  source: "paste",
                });
                setPasteName("");
                setPasteText("");
                toast.success("Texto agregado al contexto");
              }}
              className="w-full rounded-md bg-primary py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
            >
              Agregar al contexto
            </button>
          </div>
        )}

        {mode === "web" && (
          <div className="space-y-2">
            <div className="flex gap-1">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void search();
                }}
                placeholder="Buscar fuentes en la web…"
                className="min-w-0 flex-1 rounded-md border border-input bg-surface/60 px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => void search()}
                disabled={searching}
                className="rounded-md bg-primary px-2 text-primary-foreground disabled:opacity-40"
              >
                {searching ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Search className="size-3.5" />
                )}
              </button>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {results.map((result) => (
                <div key={result.url} className="rounded-md border border-border/60 p-2">
                  <div className="truncate text-[11px] font-medium">{result.title}</div>
                  <div className="num truncate text-[10px] text-muted-foreground">
                    {result.source}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                    {result.snippet}
                  </p>
                  <button
                    type="button"
                    onClick={() => void saveSource(result)}
                    disabled={savingUrl === result.url}
                    className="mt-1 text-[10px] text-primary hover:underline disabled:opacity-50"
                  >
                    {savingUrl === result.url ? "guardando…" : "guardar como contexto"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {visible.length === 0 && (
          <p className="px-1 py-4 text-[11px] leading-relaxed text-muted-foreground">
            Sin material en esta sección todavía.
          </p>
        )}
        {visible.map((file) => {
          const Icon = kindIcon[file.kind] ?? FileText;
          return (
            <div
              key={file.id}
              draggable={file.status === "ready"}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", file.text.slice(0, 50000));
                e.dataTransfer.setData("application/x-file-name", file.name);
                e.dataTransfer.setData("application/x-file-kind", file.kind);
                e.dataTransfer.setData("application/x-file-segment", file.segment ?? "");
                e.dataTransfer.effectAllowed = "copy";
              }}
              className={cn(
                "group flex items-center gap-2 rounded-md border px-2 py-2 text-xs transition-colors",
                file.active && file.status === "ready"
                  ? "border-primary/40 bg-surface/70"
                  : "border-transparent hover:bg-surface/50",
                file.status === "ready" && "cursor-grab active:cursor-grabbing",
              )}
            >
              <input
                type="checkbox"
                checked={file.active}
                onChange={() => onToggle(file.id)}
                className="size-3 accent-[var(--color-primary)]"
                aria-label={`Usar ${file.name} como contexto`}
              />
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span
                className={cn("min-w-0 flex-1 truncate", !file.active && "text-muted-foreground")}
                title={file.name}
              >
                {file.name}
              </span>
              {file.status === "extracting" && (
                <Loader2 className="size-3 animate-spin text-muted-foreground" />
              )}
              {file.status === "error" && <X className="size-3 text-negative" />}
              <button
                type="button"
                onClick={() => onRemove(file.id)}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                aria-label={`Quitar ${file.name}`}
              >
                <Trash2 className="size-3 text-muted-foreground hover:text-negative" />
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
