import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Play, ShieldCheck, Megaphone, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  auditDocuments,
  buildAnalysisCode,
  buildCampaign,
  explainRun,
  validateGenerated,
} from "@/lib/ai/studio.functions";

export type LabFile = { name: string; kind: string; text: string };

type TabId = "audit" | "code" | "validate" | "campaign";

const TABS: Array<{ id: TabId; label: string; icon: typeof Play }> = [
  { id: "audit", label: "Auditar", icon: ShieldCheck },
  { id: "code", label: "Código", icon: Play },
  { id: "validate", label: "Validar", icon: Search },
  { id: "campaign", label: "Captación", icon: Megaphone },
];

function runInSandbox(
  code: string,
  files: LabFile[],
): Promise<{ logs: string[]; output: string; error?: string }> {
  return new Promise((resolve) => {
    const source = `
      const logs = [];
      const log = (...a) => logs.push(a.map(v => typeof v === "string" ? v : JSON.stringify(v, null, 2)).join(" "));
      const table = (rows) => log(JSON.stringify(rows, null, 2));
      self.onmessage = async (e) => {
        const files = e.data.files;
        try {
          const fn = new Function("files", "log", "table", "return (async () => {" + e.data.code + "\\n})();");
          const out = await fn(files, log, table);
          self.postMessage({ logs, output: out === undefined ? "" : (typeof out === "string" ? out : JSON.stringify(out, null, 2)) });
        } catch (err) {
          self.postMessage({ logs, output: "", error: String(err && err.message ? err.message : err) });
        }
      };
    `;
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const worker = new Worker(url);
    const done = (payload: { logs: string[]; output: string; error?: string }) => {
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(payload);
    };
    const timer = setTimeout(
      () => done({ logs: [], output: "", error: "Timeout: el código superó los 15 s" }),
      15_000,
    );
    worker.onmessage = (event) => {
      clearTimeout(timer);
      done(event.data as { logs: string[]; output: string; error?: string });
    };
    worker.onerror = (event) => {
      clearTimeout(timer);
      done({ logs: [], output: "", error: event.message });
    };
    worker.postMessage({ code, files });
  });
}

export function LabPanel({ files }: { files: LabFile[] }) {
  const runAudit = useServerFn(auditDocuments);
  const runCode = useServerFn(buildAnalysisCode);
  const runExplain = useServerFn(explainRun);
  const runValidate = useServerFn(validateGenerated);
  const runCampaign = useServerFn(buildCampaign);

  const [tab, setTab] = useState<TabId>("audit");
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [code, setCode] = useState("");
  const [console_, setConsole] = useState<string[]>([]);
  const [output, setOutput] = useState("");
  const [insight, setInsight] = useState("");
  const [report, setReport] = useState<string>("");
  const lastRequest = useRef("");

  const guardFiles = useCallback(() => {
    if (files.length === 0) {
      toast.error("Activá al menos un archivo en el explorador.");
      return false;
    }
    return true;
  }, [files]);

  async function doAudit() {
    if (!guardFiles()) return;
    setBusy(true);
    setReport("");
    const res = await runAudit({ data: { files, focus: prompt || null } });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    setReport(
      `${res.summary}\n\n${
        res.findings.length
          ? res.findings
              .map(
                (f) =>
                  `[${f.severity.toUpperCase()} · ${f.kind}] ${f.where}\n  ${f.detail}\n  → ${f.fix}`,
              )
              .join("\n\n")
          : "Sin hallazgos: los cálculos y los documentos cierran."
      }\n\n— ${res.model}`,
    );
  }

  async function doCode(retryError?: string) {
    const request = prompt || lastRequest.current;
    if (!request.trim()) return void toast.error("Escribí qué querés calcular.");
    lastRequest.current = request;
    setBusy(true);
    setInsight("");
    const gen = await runCode({
      data: {
        request,
        files,
        previousCode: retryError ? code : null,
        previousError: retryError ?? null,
      },
    });
    if (!gen.ok) {
      setBusy(false);
      return void toast.error(gen.error);
    }
    setCode(gen.code);
    const run = await runInSandbox(gen.code, files);
    setConsole(run.logs);
    setOutput(run.output);
    const explained = await runExplain({
      data: {
        request,
        code: gen.code,
        logs: run.logs,
        output: run.output,
        error: run.error ?? null,
      },
    });
    setBusy(false);
    if (explained.ok) setInsight(explained.text);
    if (run.error) toast.error(run.error);
  }

  async function rerun() {
    if (!code) return;
    setBusy(true);
    const run = await runInSandbox(code, files);
    setConsole(run.logs);
    setOutput(run.output);
    setBusy(false);
    if (run.error) toast.error(run.error);
  }

  async function doValidate() {
    const content = prompt.trim() || insight || report;
    if (content.length < 10) return void toast.error("Pegá el contenido a validar.");
    setBusy(true);
    setReport("");
    const res = await runValidate({ data: { content, files } });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    setReport(
      `${res.summary}\n\n${res.claims
        .map((c) => `• [${c.verdict}] ${c.claim}\n  ${c.reason}\n  ${c.sources.join(" | ")}`)
        .join("\n\n")}\n\nFuentes consultadas:\n${res.news.map((n) => `- ${n.title} — ${n.url}`).join("\n")}`,
    );
  }

  async function doCampaign() {
    if (!prompt.trim()) return void toast.error("Describí el brief de captación.");
    setBusy(true);
    setReport("");
    const res = await runCampaign({ data: { brief: prompt, files } });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    setReport(
      `${res.strategy}\n\n${res.pieces
        .map((p) => `━ ${p.channel}\n${p.hook}\n\n${p.body}\n\nCTA: ${p.cta}\n${p.compliance}`)
        .join("\n\n")}`,
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex gap-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-md border px-1.5 py-1.5 text-[11px] transition-colors",
              tab === item.id
                ? "border-primary/40 bg-surface text-foreground"
                : "border-transparent text-muted-foreground hover:bg-surface",
            )}
          >
            <item.icon className="size-3" />
            {item.label}
          </button>
        ))}
      </div>

      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={3}
        placeholder={
          tab === "audit"
            ? "Foco de la auditoría (opcional): ej. revisá la TIR y el cuadro de pagos"
            : tab === "code"
              ? "Ej: calculá la TIR mensual de cada flujo y comparalo contra el prospecto"
              : tab === "validate"
                ? "Pegá el contenido a validar (o dejalo vacío para validar el último resultado)"
                : "Brief: a quién le hablamos y qué producto queremos captar"
        }
        className="w-full rounded-md border border-input bg-surface px-2 py-2 text-xs outline-none focus:ring-1 focus:ring-ring"
      />

      <div className="flex gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (tab === "audit") void doAudit();
            else if (tab === "code") void doCode();
            else if (tab === "validate") void doValidate();
            else void doCampaign();
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-xs font-medium text-primary-foreground disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : null}
          {tab === "audit"
            ? "Auditar material"
            : tab === "code"
              ? "Generar y ejecutar"
              : tab === "validate"
                ? "Validar con la web"
                : "Generar campaña"}
        </button>
        {tab === "code" && code ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void rerun()}
            className="rounded-md border border-border px-2 text-xs text-muted-foreground disabled:opacity-40"
          >
            Re-ejecutar
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {tab === "code" ? (
          <>
            {code && (
              <pre className="num max-h-48 overflow-auto rounded-md border border-border bg-surface p-2 text-[10px] leading-relaxed">
                {code}
              </pre>
            )}
            {console_.length > 0 && (
              <pre className="num max-h-40 overflow-auto rounded-md border border-border bg-surface-2 p-2 text-[10px] whitespace-pre-wrap">
                {console_.join("\n")}
              </pre>
            )}
            {output && (
              <pre className="num max-h-40 overflow-auto rounded-md border border-primary/30 bg-surface p-2 text-[10px] whitespace-pre-wrap">
                {output}
              </pre>
            )}
            {insight && (
              <div className="rounded-md border border-border bg-surface p-2 text-[11px] leading-relaxed whitespace-pre-wrap">
                {insight}
              </div>
            )}
            {code && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void doCode("Revisá el resultado y corregí posibles errores.")}
                className="w-full rounded-md border border-border py-1.5 text-[11px] text-muted-foreground disabled:opacity-40"
              >
                Pedir corrección del script
              </button>
            )}
          </>
        ) : report ? (
          <div className="rounded-md border border-border bg-surface p-2 text-[11px] leading-relaxed whitespace-pre-wrap">
            {report}
          </div>
        ) : (
          <p className="px-1 py-4 text-[11px] leading-relaxed text-muted-foreground">
            {tab === "audit"
              ? "Detecta errores de cálculo, lógica rota e incoherencias entre los documentos activos."
              : tab === "validate"
                ? "Contrasta las afirmaciones del contenido contra noticias y tus propios archivos."
                : "Genera piezas multicanal de captación, con disclaimers y números citados de tus archivos."}
          </p>
        )}
      </div>
    </div>
  );
}
