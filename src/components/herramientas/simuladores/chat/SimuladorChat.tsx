import { useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, Trash2, Lightbulb, TrendingUp, PiggyBank } from "lucide-react";
import { parseIntent } from "./intent";
import { getRegistry } from "./registry";

type Msg = { role: "user" | "assistant"; content: string };

function getActiveSubTab(): string {
  // read from URL or fallback; parent will pass explicitly via window event
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get("subTab") ?? "comparador";
  } catch { return "comparador"; }
}

export function SimuladorChat({ subTab }: { subTab: string }) {
  const [messages, setMessages] = useState<Msg[]>(() => {
    const welcomeComparador = "Soy tu asistente de **Simuladores**. Hablame en natural y **ejecuto en la UI** por vos.\n\nProbá: *“compará $5M a 180 días”*, *“usar inflación oficial”*, *“mostrame la tabla”* o *“¿cuál rinde más en reales?”*";
    const welcomePlan = "Soy tu asistente de **Mi plan**. Decime tu objetivo y lo cargo.\n\nProbá: *“quiero juntar 15M en 36 meses con 80k/mes”*, *“cargá un proyecto de -2M y 5 flujos de 500k”* o *“¿qué es el VAN?”*";
    return [{ role: "assistant", content: subTab === "planificador" ? welcomePlan : welcomeComparador }];
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const welcomeComparador = "Soy tu asistente de **Simuladores**. Hablame en natural y **ejecuto en la UI** por vos.\n\nProbá: *“compará $5M a 180 días”*, *“usar inflación oficial”*, *“mostrame la tabla”* o *“¿cuál rinde más en reales?”*";
    const welcomePlan = "Soy tu asistente de **Mi plan**. Decime tu objetivo y lo cargo.\n\nProbá: *“quiero juntar 15M en 36 meses con 80k/mes”*, *“cargá un proyecto de -2M y 5 flujos de 500k”* o *“¿qué es el VAN?”*";
    setMessages([{ role: "assistant", content: subTab === "planificador" ? welcomePlan : welcomeComparador }]);
  }, [subTab]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const suggestions = subTab === "comparador"
    ? ["Compará $2M a 90 días", "Usar inflación oficial", "¿Cuál rinde más en reales?", "Mostrame la tabla"]
    : ["Juntar 10M en 24 meses con 100k/mes", "Proyecto -2M con 300k, 500k, 700k, 900k, 1.2M al 18%", "¿Qué es el VAN?", "Sin cuotas, solo aporte inicial"];

  function executeActions(actions: ReturnType<typeof parseIntent>["actions"]) {
    const reg = getRegistry();
    for (const a of actions) {
      try {
        if (a.tool === "ui.setSubTab") {
          const url = new URL(window.location.href);
          url.searchParams.set("subTab", (a as any).subTab);
          window.history.replaceState({}, "", url.toString());
          window.dispatchEvent(new CustomEvent("simulador:changeSubTab", { detail: { subTab: (a as any).subTab } }));
        } else if (a.tool === "comparador.setCapital") {
          reg.comparador?.setCapital((a as any).capital);
        } else if (a.tool === "comparador.setDias") {
          reg.comparador?.setDias((a as any).dias);
        } else if (a.tool === "comparador.setInflacion") {
          reg.comparador?.setInflacion((a as any).inflacion);
        } else if (a.tool === "comparador.setVista") {
          reg.comparador?.setVista((a as any).vista);
        } else if (a.tool === "comparador.setModoReal") {
          reg.comparador?.setModoReal((a as any).modoReal);
        } else if (a.tool === "comparador.setInstrumento") {
          const { id, ...rest } = a as any;
          if (rest.enabled != null) reg.comparador?.setInstrumentoEnabled(id, rest.enabled);
          if (rest.modo) reg.comparador?.setInstrumentoModo(id, rest.modo, rest.entidadId, rest.manualVal);
        } else if (a.tool === "planificador.setCampos") {
          const p = (a as any).patch;
          if (p.aporteInicial != null) reg.planificador?.setAporteInicial(p.aporteInicial);
          if (p.aporteMensual != null) reg.planificador?.setAporteMensual(p.aporteMensual);
          if (p.tna != null) reg.planificador?.setTna(p.tna);
          if (p.inflacion != null) reg.planificador?.setInflacion(p.inflacion);
          if (p.conCuotas != null) reg.planificador?.setConCuotas(p.conCuotas);
          if (p.anticipada != null) reg.planificador?.setAnticipada(p.anticipada);
          if (p.modo != null) reg.planificador?.setModo(p.modo);
          if (p.vista != null) reg.planificador?.setVista(p.vista);
          if (p.modoMeta != null) reg.planificador?.setModoMeta(p.modoMeta);
          if (p.vfObjetivo != null) reg.planificador?.setVfObjetivo(p.vfObjetivo);
          if (p.mesesMeta != null) reg.planificador?.setMesesMeta(p.mesesMeta);
          if (p.edadActual != null) reg.planificador?.setEdadActual(p.edadActual);
          if (p.edadRetiro != null) reg.planificador?.setEdadRetiro(p.edadRetiro);
          if (p.esperanzaVida != null) reg.planificador?.setEsperanzaVida(p.esperanzaVida);
          if (p.tasaDescuento != null) reg.planificador?.setTasaDescuento(p.tasaDescuento);
        } else if (a.tool === "planificador.setFlujos") {
          reg.planificador?.setFlujos((a as any).flujos);
        } else if (a.tool === "planificador.setExtras") {
          reg.planificador?.setExtras((a as any).extras);
        }
      } catch {}
    }
  }

  function handleSend(text?: string) {
    const raw = (text ?? input).trim();
    if (!raw || busy) return;
    setInput("");
    const userMsg: Msg = { role: "user", content: raw };
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);

    // snapshot for parser
    const reg = getRegistry();
    let snapshot: any = {};
    try {
      if (subTab === "comparador" && reg.comparador) snapshot = reg.comparador.getSnapshot();
      if (subTab === "planificador" && reg.planificador) snapshot = reg.planificador.getSnapshot();
    } catch {}

    const { actions, reply } = parseIntent(raw, subTab, snapshot);

    // slight delay to feel natural + allow UI to update
    setTimeout(() => {
      if (actions.length) executeActions(actions);
      const finalReply = reply || "No entendí — probá con un ejemplo como *“compará $3M a 90 días”* o *“quiero juntar 10M en 24 meses”*.";
      // if we executed comparador actions, append interpretation with winner after a tick
      if (actions.length) {
        setTimeout(() => {
          try {
            const snap2 = subTab === "comparador" ? reg.comparador?.getSnapshot() : reg.planificador?.getSnapshot();
            let extra = "";
            if (subTab === "comparador" && snap2?.ganador) {
              extra = `\n\nAhora gana **${snap2.ganador.label}** (${snap2.ganador.fuenteLabel}) → **$${snap2.ganador.vfNominal?.toLocaleString("es-AR")}** en ${snap2.meses ?? "?"} meses. Mirá la **evolución** y la **tabla**.`;
            }
            if (subTab === "planificador" && snap2?.vanVal != null) {
              extra = `\n\nVAN **$${Math.round(snap2.vanVal).toLocaleString("es-AR")}** ${snap2.vanVal >= 0 ? "✓ viable" : "✗ no viable"} · TIR ${snap2.tirVal != null ? snap2.tirVal.toFixed(2) + "%" : "—"}.`;
            }
            setMessages((prev) => [...prev, { role: "assistant", content: finalReply + extra }]);
          } catch {
            setMessages((prev) => [...prev, { role: "assistant", content: finalReply }]);
          }
          setBusy(false);
        }, 180);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: finalReply }]);
        setBusy(false);
      }
    }, 160);
  }

  return (
    <div className="flex h-[min(72vh,640px)] flex-col rounded-xl border border-border/40 bg-card shadow-sm lg:h-[640px] xl:sticky xl:top-4">
      <div className="flex items-center gap-2 border-b border-border/40 px-3.5 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary"><Sparkles className="h-3.5 w-3.5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-none">Asistente · Simuladores</p>
          <p className="text-[11px] leading-none text-muted-foreground mt-1">{subTab === "comparador" ? "Comparador" : "Mi plan"} · llena campos por vos</p>
        </div>
        <span className={`h-2 w-2 rounded-full ${busy ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} title={busy ? "ejecutando" : "listo"} />
        <button onClick={() => setMessages((m) => m.slice(0, 1))} className="ml-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Limpiar chat"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-border/20 bg-muted/20 px-3 py-2">
        {suggestions.map((s) => (
          <button key={s} onClick={() => handleSend(s)} className="rounded-full border border-border/40 bg-card px-2.5 py-1 text-[11px] leading-none hover:border-primary/30 hover:bg-primary/5">{s}</button>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`${m.role === "user" ? "max-w-[86%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-xs leading-relaxed text-primary-foreground" : "max-w-[92%] rounded-2xl rounded-bl-md border border-border/50 bg-muted/30 px-3 py-2 text-xs leading-relaxed"}`}>
              <span className="whitespace-pre-wrap break-words">{m.content}</span>
            </div>
          </div>
        ))}
        {busy && <div className="flex justify-start"><div className="rounded-2xl border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">Ejecutando en la UI…</div></div>}
      </div>

      <div className="border-t border-border/40 p-2.5">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={subTab === "comparador" ? "Ej: compará 5M a 180 días en reales" : "Ej: quiero juntar 15M en 36 meses con 80k/mes"}
            className="flex-1 rounded-full border border-border/40 bg-background px-3.5 py-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/40"
          />
          <button onClick={() => handleSend()} disabled={!input.trim() || busy} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"><Send className="h-4 w-4" /></button>
        </div>
        <p className="mt-1.5 flex items-center gap-1 text-[11px] leading-none text-muted-foreground"><Lightbulb className="h-3 w-3" />Escribí en natural — lleno los campos y te explico los resultados en la UI.</p>
      </div>
    </div>
  );
}
