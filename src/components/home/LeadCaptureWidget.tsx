// src/components/home/LeadCaptureWidget.tsx
// Test de perfil de inversor IOL (7 preguntas) — reemplaza el antiguo formulario de prospección
// Usa perfiles_inversor_unificado.json + unificado_completo.json como fuentes de datos

import { useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  Check,
  Sparkles,
  ChevronRight,
  TrendingUp,
  Shield,
  Target,
  BarChart3,
  Globe,
} from "lucide-react";
import {
  PREGUNTAS,
  calcularPerfil,
  getPanelesPorPerfil,
  getAsignacionCompleta,
  separarPorMercado,
  type PerfilInversor,
} from "@/lib/perfil-inversor";

const COLORS_PERFIL: Record<string, string> = {
  corto_plazo_conservador: "#00ff88",
  corto_plazo_especulativo: "#ff6b35",
  conservador: "#6c5ce7",
  moderadamente_conservador: "#45aaf2",
  moderado: "#f59e0b",
  moderadamente_agresivo: "#fd79a8",
  agresivo: "#ff4444",
};

type Step = "start" | "quiz" | "result";

export function LeadCaptureWidget() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("start");
  const [questionIdx, setQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [perfil, setPerfil] = useState<PerfilInversor | null>(null);

  const totalQuestions = PREGUNTAS.length;

  const handleAnswer = useCallback(
    (puntos: number) => {
      const pregunta = PREGUNTAS[questionIdx];
      const next = { ...answers, [pregunta.id]: puntos };
      setAnswers(next);

      if (questionIdx + 1 < totalQuestions) {
        setQuestionIdx(questionIdx + 1);
      } else {
        // Calcular perfil
        const scoreH = (next.h1 ?? 0) + (next.h2 ?? 0);
        const scoreT =
          (next.t1 ?? 0) + (next.t2 ?? 0) + (next.t3 ?? 0) + (next.t4 ?? 0) + (next.t5 ?? 0);
        setPerfil(calcularPerfil(scoreH, scoreT));
        setStep("result");
      }
    },
    [answers, questionIdx]
  );

  const resetQuiz = useCallback(() => {
    setStep("start");
    setQuestionIdx(0);
    setAnswers({});
    setPerfil(null);
  }, []);

  const irAPaneles = useCallback(
    (tab: string, subTab?: string) => {
      navigate({ to: "/herramientas", search: { tab, subTab, ticker: undefined } as any });
    },
    [navigate]
  );

  // ─── START ────────────────────────────────────────────────────────
  if (step === "start") {
    return (
      <div className="glass-strong relative overflow-hidden rounded-2xl p-6 md:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full blur-3xl"
          style={{ background: "radial-gradient(closest-side, oklch(0.82 0.13 85 / 0.35), transparent)" }}
        />
        <header className="mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg gold-bg-soft ring-1 ring-[var(--gold)]/30">
              <Sparkles className="h-4 w-4 text-[var(--gold)]" />
            </div>
            <div>
              <p className="mono text-[10px] uppercase tracking-[0.3em] text-[var(--gold)]/80">
                Test oficial IOL · 7 preguntas
              </p>
              <h3 className="text-lg text-foreground">Descubrí tu perfil de inversor</h3>
            </div>
          </div>
        </header>

        <p className="mb-6 text-sm text-muted-foreground">
          Respondé 7 preguntas sobre tu horizonte temporal y tolerancia al riesgo. Obtené una
          asignación de activos recomendada con datos de IOL, Yahoo Finance y mercado AR + US.
        </p>

        <button
          onClick={() => setStep("quiz")}
          className="gold-glow inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--gold)] px-5 py-3 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-all"
        >
          Empezar test <ChevronRight className="h-4 w-4" />
        </button>

        <div className="mt-5 grid gap-2">
          {[
            { icon: Target, text: "7 perfiles · Conservador a Agresivo" },
            { icon: TrendingUp, text: "Activos reales · Bonos, Cedears, ETFs" },
            { icon: Shield, text: "Datos IOL · Yahoo · BCRA" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className="h-3.5 w-3.5 text-[var(--gold)]" />
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── QUIZ ─────────────────────────────────────────────────────────
  if (step === "quiz") {
    const pregunta = PREGUNTAS[questionIdx];
    const progress = (questionIdx / totalQuestions) * 100;

    return (
      <div className="glass-strong relative overflow-hidden rounded-2xl p-6 md:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full blur-3xl"
          style={{ background: "radial-gradient(closest-side, oklch(0.65 0.2 250 / 0.35), transparent)" }}
        />
        <header className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg gold-bg-soft ring-1 ring-[var(--gold)]/30">
              <Sparkles className="h-4 w-4 text-[var(--gold)]" />
            </div>
            <div>
              <p className="mono text-[10px] uppercase tracking-[0.3em] text-[var(--gold)]/80">
                {pregunta.seccion === "horizonte" ? "Horizonte temporal" : "Tolerancia al riesgo"}
              </p>
              <h3 className="text-base text-foreground">Pregunta {questionIdx + 1} de {totalQuestions}</h3>
            </div>
          </div>
          <span className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {questionIdx + 1} / {totalQuestions}
          </span>
        </header>

        <div className="mb-5 h-1 w-full overflow-hidden rounded-full bg-white/5">
          <motion.div
            className="h-full rounded-full"
            style={{ background: "var(--gradient-cta, linear-gradient(90deg, #c8a862, #e8c97a))" }}
            animate={{ width: `${progress}%` }}
            transition={{ type: "spring", stiffness: 140, damping: 20 }}
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={questionIdx}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            <p className="mb-4 text-sm text-foreground/90">{pregunta.texto}</p>
            <div className="grid gap-2">
              {pregunta.opciones.map((op, i) => (
                <button
                  key={i}
                  onClick={() => handleAnswer(op.puntos)}
                  className="group flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-foreground/80 transition-all hover:border-[var(--gold)]/40 hover:bg-[var(--gold)]/[0.05] hover:text-foreground"
                >
                  <span>{op.texto}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/30 transition-all group-hover:translate-x-1 group-hover:text-[var(--gold)]" />
                </button>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>

        {questionIdx > 0 && (
          <button
            onClick={() => setQuestionIdx(questionIdx - 1)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Anterior
          </button>
        )}
      </div>
    );
  }

  // ─── RESULT ────────────────────────────────────────────────────────
  if (step === "result" && perfil) {
    const asignacion = getAsignacionCompleta(perfil).filter(a => a.porcentaje > 0);
    const paneles = getPanelesPorPerfil(perfil.id);
    const color = COLORS_PERFIL[perfil.id] ?? "var(--gold)";

    return (
      <div className="glass-strong relative overflow-hidden rounded-2xl p-6 md:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full blur-3xl"
          style={{ background: "radial-gradient(closest-side, oklch(0.82 0.13 85 / 0.35), transparent)" }}
        />
        <header className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg gold-bg-soft ring-1 ring-[var(--gold)]/30">
              <Check className="h-4 w-4 text-[var(--gold)]" />
            </div>
            <div>
              <p className="mono text-[10px] uppercase tracking-[0.3em]" style={{ color }}>
                Tu perfil de inversor
              </p>
              <h3 className="text-lg font-bold text-foreground">{perfil.nombre}</h3>
            </div>
          </div>
        </header>

        <p className="mb-4 text-sm text-muted-foreground">{perfil.descripcion}</p>

        {/* Asignación */}
        <div className="mb-4 space-y-1.5">
          <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Asignación</p>
          {asignacion.map((a) => {
            const mercados = separarPorMercado(a.subcategorias.flatMap(s => s.tickers));
            return (
              <div key={a.categoria_id} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <div>
                  <span className="text-xs text-foreground/90">{a.nombre_categoria}</span>
                  <div className="flex gap-2 text-[10px] text-muted-foreground">
                    {mercados.argentina.length > 0 && <span>🇦🇷 AR</span>}
                    {mercados.eeuu.length > 0 && <span>🇺🇸 US</span>}
                  </div>
                </div>
                <span className="font-mono text-base font-bold" style={{ color }}>{a.porcentaje}%</span>
              </div>
            );
          })}
        </div>

        {/* Paneles */}
        {paneles.length > 0 && (
          <div className="mb-4">
            <p className="mono mb-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Paneles recomendados
            </p>
            <div className="grid gap-1.5">
              {paneles.slice(0, 5).map((panel) => (
                <button
                  key={panel.id}
                  onClick={() => irAPaneles(
                    "analisis"
                  )}
                  className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2 text-left text-xs text-foreground/80 transition-all hover:border-[var(--gold)]/30 hover:bg-white/[0.03]"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="h-3 w-3 text-[var(--gold)]" />
                    <span>{panel.nombre}</span>
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{
                    panel.origen?.includes("ArgentinaDatos") || panel.origen?.includes("ArgDatos") || panel.origen?.includes("RENTA_FIJA") ? "ArgDatos" :
                    panel.origen?.includes("IOL") ? "IOL" :
                    "YF"
                  }</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Estrategia */}
        <div className="mb-5 rounded-xl border border-[var(--gold)]/20 bg-[var(--gold)]/[0.04] px-4 py-3">
          <div className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--gold)]" />
            <p className="text-xs text-muted-foreground leading-relaxed">{perfil.estrategia}</p>
          </div>
        </div>

        {/* CTA */}
        <div className="flex gap-2">
          <button
            onClick={() => irAPaneles("analisis")}
            className="gold-glow inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--gold)] px-4 py-2.5 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-all"
          >
            Ir a herramientas <BarChart3 className="h-4 w-4" />
          </button>
          <button
            onClick={resetQuiz}
            className="rounded-lg border border-white/10 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Rehacer
          </button>
        </div>
      </div>
    );
  }

  return null;
}
