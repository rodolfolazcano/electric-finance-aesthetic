import { Link } from "@tanstack/react-router";
import { User, Briefcase, ArrowRight } from "lucide-react";

interface Audience {
  id: string;
  icon: typeof User | typeof Briefcase;
  title: string;
  lines: string[];
  cta: string;
  to: "/herramientas";
  search: { tab: string; subTab: string | undefined; ticker: string | undefined };
}

const AUDIENCES: Audience[] = [
  {
    id: "particular",
    icon: User,
    title: "Inversor particular",
    lines: [
      "Semáforo técnico y fundamental para acciones y CEDEARs",
      "Optimización de cartera con Markowitz y Monte Carlo",
      "Alertas de oportunidad y arbitraje en tiempo real",
    ],
    cta: "Comenzá a analizar",
    to: "/herramientas",
    search: { tab: "analisis", subTab: undefined, ticker: undefined },
  },
  {
    id: "asesor",
    icon: Briefcase,
    title: "Asesor / Productor",
    lines: [
      "Panel de portafolios de clientes con CAPM y riesgo",
      "Rendimiento real TWR y asignación por moneda",
      "Reportes profesionales y detección de oportunidades",
    ],
    cta: "Analizá carteras",
    to: "/herramientas",
    search: { tab: "cuantitativo", subTab: "optimizador", ticker: undefined },
  },
];

export function AudienceSelector() {
  return (
    <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {AUDIENCES.map((a) => (
          <Link
            key={a.id}
            to={a.to}
            search={a.search}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md transition-all hover:border-primary/30 hover:bg-primary/[0.04]"
          >
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/5 blur-2xl transition-all group-hover:bg-primary/10" />
            <div className="relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <a.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-medium text-foreground">{a.title}</h3>
              <ul className="mt-3 space-y-1.5">
                {a.lines.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-[13px] text-muted-foreground">
                    <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-primary/40" />
                    {line}
                  </li>
                ))}
              </ul>
              <div className="mt-5 inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3.5 py-1.5 text-[12px] font-medium text-primary transition-all group-hover:bg-primary/20">
                {a.cta}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
