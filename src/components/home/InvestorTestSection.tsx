// src/components/home/InvestorTestSection.tsx
// Test de perfil de inversor (7 preguntas IOL) con recomendaciones de paneles
// usando perfiles_inversor_unificado.json + unificado_completo.json

import { useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  ChevronLeft,
  TrendingUp,
  Shield,
  Target,
  BarChart3,
  Globe,
  PieChart,
  Sparkles,
  Check,
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

export default function InvestorTestSection() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"hero" | "quiz" | "result">("hero");
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
        const p = calcularPerfil(scoreH, scoreT);
        setPerfil(p);
        setStep("result");
      }
    },
    [answers, questionIdx]
  );

  const resetTest = useCallback(() => {
    setStep("hero");
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

  // ─── HERO / LANDING ───────────────────────────────────────────────
  if (step === "hero") {
    return (
      <section id="test-inversor" className="relative border-t border-white/5 py-24">
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]" 
             style={{ backgroundImage: "url('https://images.unsplash.com/photo-1642790595397-7047dc98fa72?w=1600&auto=format')", backgroundSize: "cover" }} />
        <div className="relative mx-auto max-w-5xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-white/70 backdrop-blur"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--gold)]" />
            Test oficial IOL — 7 preguntas
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.05 }}
            className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl"
          >
            Descubrí tu{" "}
            <span className="text-[var(--gold)]">perfil de inversor</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mx-auto mt-4 max-w-2xl text-muted-foreground"
          >
            Respondé 7 preguntas y obtené una asignación de activos recomendada con paneles
            de IOL, Yahoo Finance y datos del mercado argentino y de EE.UU.
          </motion.p>

          <motion.button
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
            onClick={() => setStep("quiz")}
            className="gold-glow mt-8 inline-flex items-center gap-2 rounded-lg bg-[var(--gold)] px-8 py-4 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-all hover:scale-105"
          >
            Empezar el test
            <ChevronRight className="h-5 w-5" />
          </motion.button>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              { icon: Target, title: "7 Perfiles", desc: "Desde conservador hasta agresivo" },
              { icon: TrendingUp, title: "Activos reales", desc: "Bonos, acciones, CEDEARs, ETFs" },
              { icon: Shield, title: "Datos en vivo", desc: "Cotizaciones de IOL, Yahoo y BCRA" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="glass-panel rounded-2xl p-6 text-left">
                <Icon className="mb-3 h-6 w-6 text-[var(--gold)]" />
                <h3 className="mb-1 font-semibold text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // ─── QUIZ ─────────────────────────────────────────────────────────
  if (step === "quiz") {
    const pregunta = PREGUNTAS[questionIdx];
    const progress = ((questionIdx) / totalQuestions) * 100;

    return (
      <section id="test-inversor" className="relative border-t border-white/5 py-24">
        <div className="mx-auto max-w-3xl px-6">
          {/* Progress */}
          <div className="mb-8">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span className="uppercase tracking-widest">
                {pregunta.seccion === "horizonte" ? "Horizonte temporal" : "Tolerancia al riesgo"}
              </span>
              <span>
                {questionIdx + 1} / {totalQuestions}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--gold)] to-[#6c5ce7] transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={questionIdx}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="glass-panel rounded-3xl border border-white/[0.06] p-8 backdrop-blur-xl"
            >
              <h2 className="mb-8 text-2xl font-semibold text-foreground md:text-3xl">
                {pregunta.texto}
              </h2>
              <div className="space-y-3">
                {pregunta.opciones.map((op, i) => (
                  <button
                    key={i}
                    onClick={() => handleAnswer(op.puntos)}
                    className="group flex w-full items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 text-left transition-all hover:border-[var(--gold)]/40 hover:bg-[var(--gold)]/[0.05]"
                  >
                    <span className="text-foreground/90 group-hover:text-foreground">
                      {op.texto}
                    </span>
                    <ChevronRight className="h-4 w-4 text-white/30 transition-all group-hover:translate-x-1 group-hover:text-[var(--gold)]" />
                  </button>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>

          {questionIdx > 0 && (
            <button
              onClick={() => setQuestionIdx(questionIdx - 1)}
              className="mt-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" /> Pregunta anterior
            </button>
          )}
        </div>
      </section>
    );
  }

  // ─── RESULT ────────────────────────────────────────────────────────
  if (step === "result" && perfil) {
    const asignacion = getAsignacionCompleta(perfil);
    const paneles = getPanelesPorPerfil(perfil.id);
    const colorPerfil = COLORS_PERFIL[perfil.id] ?? "var(--gold)";

    return (
      <section id="test-inversor" className="relative border-t border-white/5 py-24">
        <div className="mx-auto max-w-6xl px-6">
          {/* Header */}
          <div className="mb-2 text-xs uppercase tracking-widest" style={{ color: colorPerfil }}>
            Tu perfil
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-4xl font-bold text-foreground md:text-5xl">
                {perfil.nombre}
              </h2>
              <p className="mt-2 max-w-2xl text-muted-foreground">{perfil.descripcion}</p>
            </div>
            <button
              onClick={resetTest}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Rehacer test
            </button>
          </div>

          {/* Métricas */}
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="glass-panel rounded-2xl p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Rendimiento esperado
              </div>
              <div className="mt-2 font-mono text-3xl font-bold text-[--gold]" style={{ color: "#00ff88" as string }}>
                {perfil.rendimiento_promedio}
              </div>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Mejor escenario
              </div>
              <div className="mt-2 font-mono text-3xl font-bold" style={{ color: "#6c5ce7" as string }}>
                {perfil.mejor_escenario}
              </div>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Peor escenario
              </div>
              <div className="mt-2 font-mono text-3xl font-bold" style={{ color: "#ff4444" as string }}>
                {perfil.peor_escenario}
              </div>
            </div>
          </div>

          {/* Asignación */}
          <div className="mt-8">
            <h3 className="mb-4 text-lg font-semibold text-foreground">
              Asignación recomendada
            </h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {asignacion.filter(a => a.porcentaje > 0).map((a) => {
                const { argentina, eeuu } = separarPorMercado(
                  a.subcategorias.flatMap(s => s.tickers)
                );
                return (
                  <div
                    key={a.categoria_id}
                    className="glass-panel rounded-2xl border border-white/[0.06] p-5 group cursor-pointer hover:border-white/20 transition-all"
                    onClick={() => irAPaneles("analisis")}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium text-foreground">
                        {a.nombre_categoria}
                      </div>
                      <div className="font-mono text-xl font-bold" style={{ color: colorPerfil }}>
                        {a.porcentaje}%
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">{a.tipo}</div>
                    {argentina.length > 0 && (
                      <div className="mt-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          🇦🇷 Argentina (BCBA) ·{" "}
                          <span className="text-green-400">ARS</span>
                          {argentina.some(t => t.endsWith("D")) && (
                            <span className="text-blue-400"> / USD (especie D)</span>
                          )}
                        </span>
                      </div>
                    )}
                    {eeuu.length > 0 && (
                      <div className="mt-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          🇺🇸 EE.UU. (NYSE/NASDAQ) · <span className="text-green-400">USD</span>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Paneles recomendados */}
          <div className="mt-10">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Sparkles className="h-5 w-5 text-[var(--gold)]" />
              Paneles recomendados para tu perfil
            </h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {paneles.slice(0, 9).map((panel) => (
                <button
                  key={panel.id}
                  onClick={() => irAPaneles(
                    "analisis"
                  )}
                  className="glass-panel rounded-xl border border-white/[0.06] p-4 text-left transition-all hover:border-[var(--gold)]/30 hover:bg-white/[0.03] group"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-[var(--gold)] shrink-0" />
                    <span className="text-sm font-medium text-foreground group-hover:text-[var(--gold)] transition-colors">
                      {panel.nombre}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
                    {panel.descripcion}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{
                      panel.origen?.includes("ArgentinaDatos") || panel.origen?.includes("ArgDatos") || panel.origen?.includes("RENTA_FIJA") ? "ArgDatos" :
                      panel.origen?.includes("IOL") ? "IOL" :
                      panel.origen?.includes("Yahoo") ? "YF" :
                      panel.origen
                    }</span>
                    <span className="text-[10px] uppercase tracking-wider" style={{ color: colorPerfil }}>
                      {panel.tipo_instrumento}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Estrategia */}
          <div className="mt-8 glass-panel rounded-2xl p-6 border border-white/[0.06]">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg gold-bg-soft">
                <Check className="h-4 w-4 text-[var(--gold)]" />
              </div>
              <div>
                <h4 className="font-medium text-foreground">Estrategia recomendada</h4>
                <p className="mt-1 text-sm text-muted-foreground">{perfil.estrategia}</p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-10 text-center">
            <button
              onClick={() => irAPaneles("analisis")}
              className="gold-glow inline-flex items-center gap-2 rounded-lg bg-[var(--gold)] px-8 py-4 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-all hover:scale-105"
            >
              Ir a las herramientas con este perfil
              <BarChart3 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </section>
    );
  }

  return null;
}
