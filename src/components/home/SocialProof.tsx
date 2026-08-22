import { motion } from "framer-motion";
import { Star, Quote, TrendingUp, Users, ShieldCheck, Zap } from "lucide-react";

const stats = [
  { icon: Users, k: "+3.200", v: "Clientes activos" },
  { icon: TrendingUp, k: "USD 480M", v: "Activos monitoreados" },
  { icon: ShieldCheck, k: "CNV", v: "Regulación institucional" },
  { icon: Zap, k: "12 ms", v: "Latencia promedio" },
];

const testimonials = [
  {
    name: "Martín D.",
    role: "Family Office · Buenos Aires",
    text: "El semáforo técnico y el optimizador nos permiten rebalancear la cartera institucional con evidencia. Ahorramos horas de research por semana.",
  },
  {
    name: "Lucía R.",
    role: "PAS Independiente · Rosario",
    text: "Los comparadores de renta fija y el arbitrador CCL son los mejores del mercado argentino. Le muestro los números al cliente y cierra sin dudas.",
  },
  {
    name: "Sebastián V.",
    role: "Tesorería · Fintech",
    text: "Integramos las señales de stat arb y CAPM directamente en nuestros dashboards internos. La confiabilidad de los datos es excepcional.",
  },
];

const brands = ["IOL", "Binance", "BCRA", "ArgentinaDatos", "Docta Capital", "Yahoo Finance"];

export function SocialProof() {
  return (
    <section className="border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <div className="mb-12 flex items-end justify-between gap-8">
          <div>
            <p className="mono text-[11px] uppercase tracking-[0.3em] text-primary/80">
              03 · Confianza institucional
            </p>
            <h2 className="display mt-3 text-4xl text-foreground md:text-5xl">
              Miles de inversores <span className="text-gradient">ya deciden con Coronar Inversiones</span>.
            </h2>
          </div>
        </div>

        <div className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/5 md:grid-cols-4">
          {stats.map((s, i) => (
            <motion.div
              key={s.v}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="glass px-6 py-8 text-center"
            >
              <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
                <s.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="mono display text-2xl text-foreground">{s.k}</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                {s.v}
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-16 grid gap-5 lg:grid-cols-3">
          {testimonials.map((t, i) => (
            <motion.figure
              key={t.name}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="glass hover-lift rounded-2xl p-6"
            >
              <Quote className="h-6 w-6 text-primary/60" />
              <blockquote className="mt-3 text-sm leading-relaxed text-foreground">
                “{t.text}”
              </blockquote>
              <figcaption className="mt-5 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">{t.name}</div>
                  <div className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {t.role}
                  </div>
                </div>
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, k) => (
                    <Star key={k} className="h-3.5 w-3.5 fill-warning text-warning" />
                  ))}
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </div>

        <div className="mt-14">
          <p className="mono mb-4 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Integraciones y fuentes de datos
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {brands.map((b) => (
              <span
                key={b}
                className="glass mono rounded-lg px-4 py-2 text-xs text-muted-foreground"
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
