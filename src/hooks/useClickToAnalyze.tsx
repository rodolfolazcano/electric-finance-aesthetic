import { useCallback, useEffect, useRef, useState } from "react";
import { onClickElement } from "@/lib/ai/dom-context";

type AnalyzeTarget = {
  label: string;
  value: string;
  section: string;
  html: string;
  x: number;
  y: number;
};

export function useClickToAnalyze(onAnalyze?: (text: string) => void) {
  const [target, setTarget] = useState<AnalyzeTarget | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-ai-click]");
      if (!el) {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) setTarget(null);
        return;
      }
      const data = onClickElement(el);
      if (!data) return;
      setTarget({ ...data, x: e.clientX, y: e.clientY });
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const askAi = useCallback(() => {
    if (!target || !onAnalyze) return;
    const msg = `Analizá este elemento de la UI:\nSección: ${target.section}\nEtiqueta: ${target.label}\nValor: ${target.value}\nHTML: ${target.html}`;
    onAnalyze(msg);
    setTarget(null);
  }, [target, onAnalyze]);

  const widget = target ? (
    <div
      ref={menuRef}
      className="fixed z-[9999] flex items-center gap-1.5 rounded-lg border border-indigo-600/40 bg-indigo-950/95 px-3 py-1.5 text-[12px] text-indigo-200 shadow-lg backdrop-blur"
      style={{ left: Math.min(target.x, window.innerWidth - 160), top: target.y - 40 }}
    >
      <span className="truncate max-w-[120px] opacity-70">{target.label || "elemento"}</span>
      <button
        type="button"
        onClick={askAi}
        className="rounded bg-indigo-600/40 px-2 py-0.5 text-indigo-200 transition-colors hover:bg-indigo-500/60"
      >
        Analizar con IA
      </button>
    </div>
  ) : null;

  return { target, widget, clearTarget: () => setTarget(null) };
}
