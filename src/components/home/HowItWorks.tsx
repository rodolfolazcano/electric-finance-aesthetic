import { Search, Layers, BarChart3 } from "lucide-react";

const STEPS = [
  {
    icon: Search,
    title: "Conectá tu cartera o elegí tickers",
    desc: "Vinculá tu cuenta de IOL o seleccioná manualmente acciones, CEDEARs, bonos o ETFs de BCBA, NYSE y NASDAQ.",
  },
  {
    icon: Layers,
    title: "Corremos los 7 módulos de análisis",
    desc: "Semáforo técnico/fundamental, CAPM, VaR, optimización Markowitz, renta fija, arbitraje y contexto de mercado.",
  },
  {
    icon: BarChart3,
    title: "Recibí semáforo, score y recomendación",
    desc: "Cada activo con señal clara, puntaje jerárquico y una interpretación en lenguaje simple. Sin ruido, sin jerga.",
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <div className="text-center">
        <h2 className="text-2xl font-light tracking-tight sm:text-3xl">
          Cómo <span className="italic text-primary">funciona</span>
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Tres pasos para pasar de la incertidumbre a la decisión.
        </p>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <div
            key={s.title}
            className="group relative rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-md transition-all hover:border-primary/20"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <s.icon className="h-5 w-5" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="font-mono text-[11px] font-semibold text-primary/50">0{i + 1}</span>
            </div>
            <h3 className="mt-2 text-sm font-medium text-foreground">{s.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
