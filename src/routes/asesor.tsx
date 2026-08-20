import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  Sparkles,
  Send,
  Loader2,
  TrendingUp,
  TrendingDown,
  Scale,
  FileText,
  Database,
  AlertTriangle,
  ListTree,
  CheckCircle2,
} from "lucide-react";
import { analizarValor, type RespuestaValor } from "@/lib/valuation-api";
import type { AnalisisCompleto } from "@/lib/valuation-pipeline";

const WHATSAPP = "https://wa.me/541162355944";

const METODOLOGIAS = [
  { id: "DCF Flujo de Caja Descontado", label: "DCF — Flujo de Caja Descontado" },
  { id: "Valuación empresas emergentes", label: "Valuación de empresas emergentes" },
  { id: "CAPM / beta (costo de capital)", label: "CAPM / beta" },
];

const CHIPS = [
  "¿Cuál es el valor intrínseco de IBM usando DCF?",
  "Analizá el valor intrínseco de GGAL.BA",
  "Valuá Microsoft con metodología DCF",
  "Valuación emergente de YPF.BA",
];

interface Turno {
  pregunta: string;
  tema: string;
  resultado: RespuestaValor | null;
  error: string | null;
  cargando: boolean;
}

const nf0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

function fmtNum(v: number | null | undefined): string {
  return typeof v === "number" ? nf2.format(v) : "s/d";
}

function fmtMiles(v: number | null | undefined): string {
  return typeof v === "number" ? nf0.format(v) : "s/d";
}

function extraerSimbolo(texto: string): string | null {
  const matches = texto.match(/\b([A-Z][A-Z0-9]{0,5}(?:\.[A-Z]{1,3})?)\b/g);
  if (!matches) return null;
  const ruidos = new Set([
    "EL", "LA", "LOS", "LAS", "CON", "DE", "DEL", "AL", "PARA", "ES", "SON", "VALOR",
    "INTRINSECO", "DCF", "IA", "CNV", "USO", "POR", "QUE", "CUANTO", "CUAL", "UNA", "UN",
    "METODOLOGIA", "ANALIZA", "ANALIZAR", "PRECIO", "ACCION", "EMPRESA", "WACC", "CAPM", "BETA",
  ]);
  const candidatos = matches.filter((t) => !ruidos.has(t.toUpperCase()));
  const conSufijo = candidatos.find((c) => c.includes("."));
  const simbolo = conSufijo ?? candidatos[0] ?? matches[0];
  if (!simbolo) return null;
  return simbolo.toUpperCase();
}

function detectarTema(texto: string): string {
  const t = texto.toLowerCase();
  if (/(emergente|riesgo pais|mercado argentino|emergentes)/.test(t)) {
    return "Valuación empresas emergentes";
  }
  if (/(capm|beta|costo de capital)/.test(t)) {
    return "CAPM / beta (costo de capital)";
  }
  if (/(dcf|flujo de caja|valor intrinseco|flujos de caja)/.test(t)) {
    return "DCF Flujo de Caja Descontado";
  }
  return "";
}

function BadgeUpside({ upside }: { upside: number | null }) {
  if (upside == null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[12px] font-semibold">
        <Scale className="h-3.5 w-3.5" /> s/d
      </span>
    );
  }
  const positiva = upside >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold ${
        positiva
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          : "border-rose-500/40 bg-rose-500/10 text-rose-400"
      }`}
    >
      {positiva ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {positiva ? "+" : ""}
      {nf1.format(upside)}%
    </span>
  );
}

function CardAnalisis({ analisis }: { analisis: AnalisisCompleto }) {
  const moneda = analisis.moneda === "ARS" ? "ARS" : "USD";
  const simbolo = moneda === "ARS" ? "$" : "USD ";

  const recomendacionColor =
    analisis.upsidePct != null && analisis.upsidePct >= 5
      ? "text-emerald-400"
      : analisis.upsidePct != null && analisis.upsidePct <= -5
        ? "text-rose-400"
        : "text-gold";

  return (
    <article className="surface-card overflow-hidden rounded-2xl">
      <header className="border-b border-border/60 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-display text-[18px] font-semibold leading-tight">
              {analisis.empresa ?? analisis.simboloResuelto}
            </p>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {analisis.simboloResuelto} · datos del {analisis.fechaDatos}
            </p>
          </div>
          <BadgeUpside upside={analisis.upsidePct} />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-px border-b border-border/60 bg-border/40 sm:grid-cols-4">
        <div className="bg-background/60 px-5 py-3.5">
          <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            Valor calculado
          </p>
          <p className="mt-1 text-[17px] font-semibold text-primary">
            {simbolo}
            {fmtNum(analisis.valorPorAccion)}
          </p>
        </div>
        <div className="bg-background/60 px-5 py-3.5">
          <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            Precio actual
          </p>
          <p className="mt-1 text-[17px] font-semibold">
            {simbolo}
            {fmtNum(analisis.precioActual)}
          </p>
        </div>
        <div className="bg-background/60 px-5 py-3.5">
          <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            Consenso analistas
          </p>
          <p className="mt-1 text-[17px] font-semibold">
            {analisis.consensoAnalistas != null ? `${simbolo}${nf2.format(analisis.consensoAnalistas)}` : "s/d"}
            <span className="ml-1 text-[11px] font-normal text-muted-foreground">
              {analisis.upsideAnalistasPct != null
                ? `${analisis.upsideAnalistasPct >= 0 ? "+" : ""}${nf1.format(analisis.upsideAnalistasPct)}%`
                : ""}
            </span>
          </p>
        </div>
        <div className="bg-background/60 px-5 py-3.5">
          <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            Recomendación
          </p>
          <p className={`mt-1 text-[14px] font-semibold ${recomendacionColor}`}>
            {analisis.recomendacion ?? "s/d"}
          </p>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5">
        <section>
          <p className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.16em] text-gold">
            <FileText className="h-3.5 w-3.5" /> Metodología
          </p>
          <p className="mt-1.5 text-[14px] font-medium">
            {analisis.metodologia.nombre || analisis.metodologia.tema}
            {analisis.metodologia.id ? (
              <span className="ml-2 text-[11.5px] font-normal text-muted-foreground">
                Paper: {analisis.metodologia.id}
              </span>
            ) : null}
          </p>
          {analisis.metodologia.resumen && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              {analisis.metodologia.resumen}
            </p>
          )}
        </section>

        <section>
          <p className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.16em] text-gold">
            <ListTree className="h-3.5 w-3.5" /> Suposiciones clave
          </p>
          <ul className="mt-2 space-y-1.5">
            {analisis.supuestos.map((s) => (
              <li key={s.variable} className="rounded-lg bg-background/50 px-3 py-2 text-[13px]">
                <span className="font-semibold">{s.variable}:</span>{" "}
                {typeof s.valor === "number" ? nf2.format(s.valor) : s.valor}
                <span className="ml-1.5 text-[11.5px] text-muted-foreground">({s.fuente})</span>
              </li>
            ))}
          </ul>
        </section>

        {analisis.detalle?.sensibilidad?.length ? (
          <section>
            <p className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.16em] text-gold">
              <Scale className="h-3.5 w-3.5" /> Sensibilidad por tasa de descuento
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {analisis.detalle.sensibilidad.map((x) => (
                <span
                  key={x.tasa}
                  className="rounded-full border border-border bg-background/50 px-3 py-1 text-[12px]"
                >
                  {nf1.format(x.tasa)}% →{" "}
                  <span className="font-semibold text-primary">
                    {x.valor != null ? `${simbolo}${nf2.format(x.valor)}` : "s/d"}
                  </span>
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <p className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.16em] text-gold">
            <Database className="h-3.5 w-3.5" /> Fuentes
          </p>
          <ul className="mt-2 space-y-1 text-[12.5px] text-muted-foreground">
            {analisis.fuentes.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    f.tipo === "paper"
                      ? "bg-primary/15 text-primary"
                      : f.tipo === "mercado"
                        ? "bg-gold/15 text-gold"
                        : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {f.tipo}
                </span>
                <span>{f.descripcion}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <p className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.16em] text-rose-400">
            <AlertTriangle className="h-3.5 w-3.5" /> Limitaciones
          </p>
          <ul className="mt-2 space-y-1 text-[12.5px] leading-relaxed text-muted-foreground">
            {analisis.limitaciones.map((l, i) => (
              <li key={i}>— {l}</li>
            ))}
          </ul>
        </section>

        <details className="group">
          <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground marker:hidden transition-colors hover:text-foreground">
            Trazabilidad del análisis (qué paper, qué datos, qué fórmula)
          </summary>
          <ul className="mt-2 space-y-0.5 border-l border-border/60 pl-3 text-[11.5px] text-muted-foreground">
            {analisis.trazabilidad.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </details>

        <p className="border-t border-border/60 pt-3 text-[11px] leading-snug text-muted-foreground">
          Análisis educativo sobre supuestos. No constituye recomendación de inversión. La decisión
          final se toma junto a tu asesor (Agente Productora CNV).
        </p>
      </div>
    </article>
  );
}

export const Route = createFileRoute("/asesor")({
  component: Asesor,
  head: () => ({
    meta: [
      { title: "Asesor de Inversiones IA · Cintia Boos" },
      {
        name: "description",
        content:
          "Asesor de inversiones con IA: valoración de empresas con papers académicos y datos reales de mercado (Yahoo Finance).",
      },
    ],
  }),
});

function Asesor() {
  const [input, setInput] = useState("");
  const [metodologia, setMetodologia] = useState(METODOLOGIAS[0]!.id);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [procesando, setProcesando] = useState(false);

  async function analizar(pregunta: string, tema: string) {
    const simbolo = extraerSimbolo(pregunta);
    if (!simbolo) {
      setTurnos((prev) => [
        ...prev,
        {
          pregunta,
          tema,
          resultado: null,
          error:
            "No detecté un símbolo claro en tu consulta. Escribí algo como «Analizá el valor intrínseco de IBM» o «¿Cuánto vale GGAL.BA?».",
          cargando: false,
        },
      ]);
      return;
    }
    const temaEfectivo = detectarTema(pregunta) || tema;
    const nuevo: Turno = {
      pregunta,
      tema: temaEfectivo,
      resultado: null,
      error: null,
      cargando: true,
    };
    setTurnos((prev) => [...prev, nuevo]);
    setProcesando(true);
    try {
      const res = await analizarValor({ data: { simbolo, tema: temaEfectivo } });
      setTurnos((prev) => [
        ...prev.slice(0, -1),
        { ...nuevo, resultado: res, cargando: false },
      ]);
    } catch (err) {
      setTurnos((prev) => [
        ...prev.slice(0, -1),
        {
          ...nuevo,
          cargando: false,
          error:
            err instanceof Error && err.message
              ? err.message
              : "No pude completar el análisis ahora mismo. Probá de nuevo en unos segundos.",
        },
      ]);
    } finally {
      setProcesando(false);
      setInput("");
    }
  }

  function enviar(texto: string) {
    if (!texto.trim() || procesando) return;
    void analizar(texto.trim(), metodologia);
  }

  return (
    <div className="min-h-screen">
      <div
        aria-hidden
        className="fixed inset-0 -z-10"
        style={{
          background:
            "linear-gradient(180deg, rgba(3,5,12,0.98) 0%, rgba(3,5,12,0.9) 45%, rgba(3,5,12,0.98) 100%)",
        }}
      />

      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[880px] items-center gap-3 px-5 py-3.5">
          <Link
            to="/"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
            aria-label="Volver al inicio"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-display text-[16px] font-semibold leading-none">
              <Sparkles className="h-4 w-4 text-primary" />
              Asesor de Inversiones IA
            </p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              Papers académicos + datos reales de Yahoo Finance · educativo, sin recomendación
            </p>
          </div>
          <a
            href={WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-2 rounded-full bg-primary px-4 py-2 text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:inline-flex"
          >
            Hablar con tu asesor
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[880px] px-5 pb-28 pt-6">
        {turnos.length === 0 && (
          <div className="mb-6 rounded-2xl border border-border/60 bg-background/40 px-5 py-6">
            <p className="text-[14px] font-medium">¿Cómo funciona?</p>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              Escribí qué empresa querés valorar y con qué metodología. El asesor lee el paper de
              la base de conocimiento (<code className="text-primary">pt/</code>), baja datos
              reales de Yahoo Finance (FCF, deuda, beta, crecimiento, analistas) y aplica la
              fórmula del paper, mostrando supuestos, fuentes y limitaciones.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => void enviar(chip)}
                  disabled={procesando}
                  className="rounded-full border border-primary/30 bg-primary/[0.07] px-3.5 py-1.5 text-[12px] text-primary transition-colors hover:border-primary disabled:opacity-40"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-6">
          {turnos.map((t, i) => (
            <div key={i}>
              <p className="mb-2 flex items-start gap-2 text-[13px] text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-primary" />
                <span>
                  <span className="font-medium text-foreground">Vos:</span> {t.pregunta}
                  <span className="ml-2 text-[11px] uppercase tracking-wide text-gold">
                    {t.tema}
                  </span>
                </span>
              </p>
              {t.cargando && (
                <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/40 px-4 py-3 text-[13px] text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Leyendo paper, consultando Yahoo Finance y calculando…
                </div>
              )}
              {t.resultado && <CardAnalisis analisis={t.resultado.analisis} />}
              {t.error && !t.cargando && (
                <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-400">
                  {t.error}
                </p>
              )}
            </div>
          ))}
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-[880px] px-5 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              enviar(input);
            }}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={metodologia}
                onChange={(e) => setMetodologia(e.target.value)}
                aria-label="Metodología de valoración"
                className="rounded-xl border border-border bg-background px-3 py-2.5 text-[12.5px] text-foreground outline-none focus:border-primary/60 sm:w-[260px]"
              >
                {METODOLOGIAS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 py-1 focus-within:border-primary/60">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder='Ej: "¿Cuál es el valor intrínseco de IBM usando DCF?"'
                  className="flex-1 bg-transparent py-2 text-[13px] outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="submit"
                  disabled={procesando || !input.trim()}
                  aria-label="Analizar"
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                >
                  {procesando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <p className="mt-1.5 text-center text-[10.5px] text-muted-foreground">
              Información general y educativa. No constituye recomendación de inversión ni promesa
              de rentabilidad.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
