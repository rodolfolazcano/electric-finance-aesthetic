import { useEffect, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Play, Loader2, Terminal, Folder, ChevronRight, ChevronDown, Bookmark } from "lucide-react";
import { runCommand } from "@/lib/ai/studio.functions";
import { cn } from "@/lib/utils";
import type { StudioFile } from "@/lib/types";

type ScriptFile = {
  name: string;
  path: string;
  content: string;
  source: "context" | "filesystem";
};

export function ScriptsPanel({ contextFiles = [], onRunInTerminal }: { contextFiles?: StudioFile[]; onRunInTerminal?: (command: string) => void }) {
  const exec = useServerFn(runCommand);
  const [scripts, setScripts] = useState<ScriptFile[]>([]);
  const [selected, setSelected] = useState<ScriptFile | null>(null);
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [path, setPath] = useState(".");

  const scanScripts = useCallback(async () => {
    // 1. Scripts desde el explorador de contexto (SIEMPRE se muestran)
    const fromContext: ScriptFile[] = (contextFiles || [])
      .filter((f) => f.name?.endsWith(".py"))
      .map((f) => ({ name: f.name, path: f.name, content: f.text || "", source: "context" as const }));

    // 2. Scripts desde el filesystem (solo si hay ruta)
    let fromFs: ScriptFile[] = [];
    if (path && path !== "." && path.trim()) {
      const res = await exec({ data: { command: `Get-ChildItem -Path "${path}" -Recurse -Filter "*.py" -ErrorAction SilentlyContinue | Select-Object FullName, Length | ConvertTo-Json` } });
      if (res.ok && res.output) {
        try {
          const files = JSON.parse(res.output);
          if (Array.isArray(files)) {
            const loaded = await Promise.all(
              files.slice(0, 30).map(async (f: any) => {
                const c = await exec({ data: { command: `Get-Content "${f.FullName}" -Raw -ErrorAction SilentlyContinue` } });
                return { name: f.FullName.split("\\").pop(), path: f.FullName, content: c.ok ? c.output : "", source: "filesystem" as const };
              })
            );
            fromFs = loaded.filter((s: any) => s.content);
          }
        } catch {}
      }
    }
    setScripts([...fromContext, ...fromFs]);
  }, [exec, path, contextFiles]);

  useEffect(() => { scanScripts(); }, [scanScripts]);

  const runScript = useCallback(async (script: ScriptFile) => {
    setBusy(true);
    setOutput("");
    setSelected(script);
    try {
      if (script.source === "context") {
        // Save to project _scripts/ directory for dependency resolution
        const scriptDir = "_scripts";
        const scriptPath = `${scriptDir}/${script.name}`;
        // Create dir and write file
        await exec({ data: { command: `if (-not (Test-Path "${scriptDir}")) { New-Item -ItemType Directory -Path "${scriptDir}" -Force }; Set-Content -Path "${scriptPath}" -Value @\"\n${script.content.replace(/"/g, '`"')}\n\"@ -Encoding UTF8`, timeout: 30 } });
        const res = await exec({ data: { command: `python "${scriptPath}" 2>&1`, timeout: 120 } });
        setOutput(res.ok ? res.output : `ERROR: ${res.output}`);
      } else {
        const res = await exec({ data: { command: `python "${script.path}" 2>&1`, timeout: 120 } });
        setOutput(res.ok ? res.output : `ERROR: ${res.output}`);
      }
    } catch (e: any) {
      setOutput(`ERROR CRÍTICO: ${e.message ?? e}`);
    }
    setBusy(false);
  }, [exec]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          <Folder className="size-3" /> Scripts Python
        </button>
        <input value={path} onChange={(e) => setPath(e.target.value)} className="ml-auto min-w-0 flex-1 rounded border border-border/40 bg-surface/50 px-2 py-0.5 text-[11px] outline-none" placeholder="./src" />
        <button type="button" onClick={scanScripts} className="shrink-0 rounded px-2 py-0.5 text-[10px] bg-primary/10 text-primary hover:bg-primary/20">buscar</button>
      </div>

      {expanded && (
        <div className="flex min-h-0 flex-1 gap-2">
          <div className="w-56 shrink-0 overflow-y-auto rounded border border-border/40 bg-surface/30 p-1">
            {scripts.length === 0 && <div className="p-2 text-[11px] text-muted-foreground">Sin scripts. Cargá archivos .py en el explorador de contexto (izquierda) o escribí una ruta de carpeta arriba.</div>}
            {scripts.map((s) => (
              <button key={s.path + s.source} type="button" onClick={() => setSelected(s)} className={cn("flex w-full items-center gap-1 rounded px-2 py-1 text-left text-[11px] hover:bg-surface-2", selected?.path === s.path && selected?.source === s.source && "bg-primary/10 text-primary")}>
                {s.source === "context" ? <Bookmark className="size-3 shrink-0 text-amber-400" /> : <FileText className="size-3 shrink-0" />}
                <span className="truncate">{s.name}</span>
                {s.source === "context" && <span className="ml-auto text-[9px] text-amber-400/60">ctx</span>}
              </button>
            ))}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {selected && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium">{selected.name}</span>
                  <button type="button" onClick={() => runScript(selected)} disabled={busy} className="ml-auto flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-[10px] text-primary hover:bg-primary/20">
                    {busy ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />} ejecutar
                  </button>
                  <button type="button" onClick={() => {
                    const cmd = selected.source === "context"
                      ? `if (-not (Test-Path "_scripts")) { New-Item -ItemType Directory -Path "_scripts" -Force }; Set-Content -Path "_scripts/${selected.name}" -Value @\"\n${selected.content}\n\"@ -Encoding UTF8; python "_scripts/${selected.name}" 2>&1`
                      : `python "${selected.path}" 2>&1`;
                    onRunInTerminal?.(cmd);
                  }} className="flex items-center gap-1 rounded bg-green-900/20 px-2 py-0.5 text-[10px] text-green-400 hover:bg-green-900/30">
                    <Terminal className="size-3" /> en terminal
                  </button>
                </div>
                <pre className="min-h-0 flex-1 overflow-auto rounded border border-border/40 bg-black/80 p-2 text-[11px] text-green-300">{selected.content}</pre>
                {output && (
                  <div className="max-h-40 overflow-auto rounded border border-border/40 bg-black/90 p-2 text-[11px]">
                    <div className="mb-1 text-[10px] text-muted-foreground">OUTPUT:</div>
                    <pre className="text-green-300">{output.slice(0, 5000)}</pre>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
