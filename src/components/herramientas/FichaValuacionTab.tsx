/**
 * CANONICAL: Ficha de Valuación Buffett/Pascale (ex AnalisisTab.tsx Clara)
 * Triangulación VI DCF/Múltiplos/Libro + WACC Hamada + MOS + cualitativo 5 dims gate ≥5.0
 * Mantener AnalisisTab.tsx como re-export para compatibilidad.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  FileSearch,
  Newspaper,
  Search,
  ShieldAlert,
  Target,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fichaDecisionFn,
  semaforoTickerFn,
  noticiasTickerFn,
} from "@/lib/herramientas/clara.functions";
import type { ResultadoFicha } from "@/lib/clarity-analysis";
import { cn } from "@/lib/utils";
import { getFlatTickerList, type TickerInfo } from "@/lib/universos";

const EJEMPLOS = ["AAPL", "MSFT", "GGAL.BA", "YPFD.SA", "KO"].map((t) =>
  t === "YPFD.SA" ? "YPFD.BA" : t,
);

// Universo completo mapeado desde unificado_completo.json (BCBA acciones +
// CEDEARs ARS/USD + NYSE/NASDAQ + Brasil). Se aplana una sola vez.
const UNIVERSO: TickerInfo[] = getFlatTickerList();

function sinAcentos(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Busca en el universo: prioriza ticker que empieza con la query, luego
 *  coincidencias parciales en ticker o nombre. Máx 10 resultados. */
function buscarUniverso(q: string): TickerInfo[] {
  const query = sinAcentos(q.trim().toUpperCase());
  if (!query) return [];
  const empiezan: TickerInfo[] = [];
  const contienen: TickerInfo[] = [];
  for (const t of UNIVERSO) {
    const tick = t.ticker.toUpperCase();
    if (tick.startsWith(query)) empiezan.push(t);
    else if (tick.includes(query) || sinAcentos(t.nombre.toUpperCase()).includes(query))
      contienen.push(t);
    if (empiezan.length >= 6 && contienen.length >= 4) break;
  }
  return [...empiezan.slice(0, 6), ...contienen.slice(0, 4)];
}

function fmtUSD(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "s/d";
  return `$${v.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}
function fmtPctS(v: number | null | undefined, dec = 1): string {
  if (v == null || !isFinite(v)) return "s/d";
  return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%`;
}

function decisionColor(decision: string): string {
  if (decision.startsWith("COMPRAR"))
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
  if (decision.includes("MANTENER") || decision.includes("ESPERAR"))
    return "border-amber-500/40 bg-amber-500/10 text-amber-400";
  if (decision.includes("NO ") || decision.startsWith("VENDER"))
    return "border-red-500/40 bg-red-500/10 text-red-400";
  return "border-border bg-accent text-muted-foreground";
}

/** Métricas fundamentales efectivamente disponibles para el ticker consultado */
function coberturaFundamental(d: ResultadoFicha): { total: number; lista: string[] } {
  const m = d.cuantitativo?.metricas ?? {};
  const items: [string, boolean][] = [
    ["precio actual", d.precio_actual != null],
    ["DCF", !!d.valuacion?.vi_dcf],
    ["múltiplos", !!d.valuacion?.vi_multi],
    ["valor libro", !!d.valuacion?.vi_libro],
    ["WACC", d.wacc?.wacc_usd != null],
    ["ROE", m.M12_roe != null],
    ["margen neto", m.M6_margen_neto != null],
    ["Deuda/EBITDA", m.M14_deuda_ebitda != null],
    ["P/E", m.M15_pe != null],
    ["EV/EBITDA", m.ev_ebitda != null],
    ["upside analistas", d.margen_seguridad?.upside_pct != null],
  ];
  const ok = items.filter(([, v]) => v);
  return { total: ok.length, lista: ok.map(([k]) => k) };
}

/**
 * Sección fundamental guiada por datos reales:
 *  - sin datos → no se despliega nada;
 *  - datos parciales → se muestran únicamente las métricas disponibles.
 */
function SeccionFundamental({ ticker }: { ticker: string }) {
  const fn = useServerFn(fichaDecisionFn);
  const q = useQuery({
    queryKey: ["clara-ficha", ticker],
    queryFn: () => fn({ data: { ticker } }),
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  if (q.isPending)
    return (
      <section className="space-y-3">
        <EncabezadoFundamental />
        <div className="grid w-full gap-4 md:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </section>
    );
  // Sin respuesta utilizable → la sección no se despliega
  if (q.isError || !q.data) return null;

  const d = q.data;
  const cob = coberturaFundamental(d);
  // Ticker sin ningún dato fundamental → sección oculta por completo
  if (cob.total === 0 || (!d.precio_actual && !d.valuacion?.vi_central)) return null;

  const ms = d.margen_seguridad;
  const datosParciales = d.decision_final === "DATOS INSUFICIENTES";

  // Filas disponibles por bloque
  const filasValuacion = [
    !!d.valuacion.vi_dcf && { k: "DCF (FCFF 5 años)", v: fmtUSD(d.valuacion.vi_dcf) },
    !!d.valuacion.vi_multi && { k: "Múltiplos sectoriales", v: fmtUSD(d.valuacion.vi_multi) },
    !!d.valuacion.vi_libro && { k: "Valor libro / APV", v: fmtUSD(d.valuacion.vi_libro) },
    !!d.valuacion.rango && {
      k: "Rango final",
      v: `${fmtUSD((d.valuacion.rango as { min?: number }).min)} – ${fmtUSD(
        (d.valuacion.rango as { max?: number }).max,
      )}`,
    },
  ].filter(Boolean) as { k: string; v: string }[];

  const metricasCuant = (
    [
      ["ROE", pct(d.cuantitativo.metricas.M12_roe)],
      ["Margen neto", pct(d.cuantitativo.metricas.M6_margen_neto)],
      ["Deuda / EBITDA", x(d.cuantitativo.metricas.M14_deuda_ebitda)],
      ["P/E", x(d.cuantitativo.metricas.M15_pe)],
      ["EV/EBITDA", x(d.cuantitativo.metricas.ev_ebitda)],
    ] as [string, string][]
  ).filter(([, v]) => v !== "s/d");

  const rojas = d.cuantitativo.alertas.rojas;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[13px] font-semibold tracking-widest text-primary uppercase">
          Análisis fundamental &amp; valuación
        </h3>
        <span className="text-[11px] text-muted-foreground">
          estados contables · DCF · múltiplos
          {!datosParciales && " · decisión"}
          {" · "}
          {cob.total} métricas disponibles
        </span>
      </div>

      <div className="space-y-4">
        {/* Resumen de decisión — solo con datos suficientes */}
        {!datosParciales ? (
          <Card className={cn("border", decisionColor(d.decision_final))}>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <div className="text-xs tracking-wide text-muted-foreground uppercase">
                  Ficha de decisión · {d.empresa}
                </div>
                <div className="mt-1 font-mono text-2xl font-bold">{d.decision_final}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Precio {fmtUSD(d.precio_actual)} · Valor central {fmtUSD(d.valuacion.vi_central)}{" "}
                  · Upside {fmtPctS(ms.upside_pct)}
                </div>
              </div>
              <div className="grid w-full grid-cols-3 gap-4 text-center">
                <Mini label="Score cuali" value={`${d.cualitativo.score_total.toFixed(1)}/10`} />
                <Mini
                  label="WACC"
                  value={d.wacc.wacc_usd != null ? `${d.wacc.wacc_usd.toFixed(1)}%` : "s/d"}
                />
                <Mini label="MOS" value={`${ms.mos_aplicado_pct.toFixed(0)}%`} />
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/40 bg-background/40">
            <CardContent className="p-4 text-[13px] leading-relaxed text-muted-foreground">
              Datos parciales para <span className="font-mono text-foreground">{ticker}</span>: se
              muestran solo las {cob.total} métricas disponibles ({cob.lista.join(", ")}). DCF,
              decisión y MOS requieren estados contables completos.
            </CardContent>
          </Card>
        )}

        {d.bloqueado_por_cualitativo && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="flex items-start gap-2 p-4 text-sm">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              Score cualitativo insuficiente (&lt;5.0): el análisis cuantitativo queda bloqueado —
              no comprar lo que no se entiende.
            </CardContent>
          </Card>
        )}

        <div className="grid w-full gap-4 lg:grid-cols-3">
          {/* Valuación — solo si hay al menos un método con valor */}
          {(filasValuacion.length > 0 || ms.precio_max_entrada > 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Target className="h-4 w-4 text-primary" /> Triangulación de valor
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {filasValuacion.map((f) => (
                  <Fila key={f.k} k={f.k} v={f.v} />
                ))}
                {ms.precio_max_entrada > 0 && (
                  <Fila k="Precio máx. entrada" v={fmtUSD(ms.precio_max_entrada)} destacado />
                )}
              </CardContent>
            </Card>
          )}

          {/* Cualitativo — solo si Yahoo identifica empresa/sector */}
          {!!d.cualitativo.sector && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FileSearch className="h-4 w-4 text-primary" /> Cualitativo (Buffett)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {Object.entries(d.cualitativo.dimensiones).map(([k, dim]) => (
                  <Fila
                    key={k}
                    k={k.replace(/_/g, " ")}
                    v={`${dim.score.toFixed(1)} · ${(dim.peso * 100).toFixed(0)}%`}
                  />
                ))}
                <div className="pt-1">
                  <Badge
                    variant="outline"
                    className={cn(d.cualitativo.continuar ? "text-emerald-400" : "text-amber-400")}
                  >
                    {d.cualitativo.continuar
                      ? "Círculo de competencia: habilitado"
                      : "Fuera del círculo"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cuantitativo — solo métricas presentes */}
          {(metricasCuant.length > 0 || rojas.length > 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Cuantitativo clave
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {metricasCuant.map(([k, v]) => (
                  <Fila key={k} k={k} v={v} />
                ))}
                {rojas.length > 0 && (
                  <ul className="space-y-1 pt-1 text-xs text-red-400">
                    {rojas.map((a, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <XCircle className="mt-0.5 h-3 w-3 shrink-0" /> {a}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {d.notas_consistencia.length > 0 && !datosParciales && (
          <Card>
            <CardContent className="p-4">
              <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Notas de consistencia
              </div>
              <ul className="grid w-full gap-1 text-xs text-muted-foreground md:grid-cols-2">
                {d.notas_consistencia.map((n, i) => (
                  <li key={i}>• {n}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}

function EncabezadoFundamental() {
  return (
    <div className="flex items-baseline gap-2">
      <h3 className="text-[13px] font-semibold tracking-widest text-primary uppercase">
        Análisis fundamental &amp; valuación
      </h3>
      <span className="text-[11px] text-muted-foreground">estados contables · DCF · múltiplos</span>
    </div>
  );
}

function pct(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "s/d";
  return `${(v * 100).toFixed(1)}%`;
}
function x(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "s/d";
  return `${v.toFixed(2)}x`;
}
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[13px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}
function Fila({ k, v, destacado }: { k: string; v: string; destacado?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground capitalize">{k}</span>
      <span className={cn("font-mono text-xs", destacado && "text-base font-bold text-primary")}>
        {v}
      </span>
    </div>
  );
}

const LUZ_CLASE: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-muted-foreground",
};
const luzClase = (luz: string) => LUZ_CLASE[luz] ?? "bg-muted-foreground";

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className="font-mono">{valor}</span>
    </div>
  );
}

function SemaforoPanel({ ticker }: { ticker: string }) {
  const fn = useServerFn(semaforoTickerFn);
  const q = useQuery({
    queryKey: ["clara-semaforo", ticker],
    queryFn: () => fn({ data: { ticker } }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  if (q.isError || !q.data)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Semáforo no disponible.
        </CardContent>
      </Card>
    );

  const d = q.data;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span>Semáforo técnico + fundamental</span>
          <span className="flex items-center gap-2">
            <span className={cn("h-3 w-3 rounded-full", luzClase(d.light))} />
            <span className="font-mono">{d.recommendation}</span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid w-full grid-cols-3 gap-3 text-center">
          <Mini label="Técnico" value={d.techScore != null ? d.techScore.toFixed(2) : "s/d"} />
          <Mini label="Fundamental" value={d.fundScore != null ? d.fundScore.toFixed(2) : "s/d"} />
          <Mini label="Total" value={d.totalScore != null ? d.totalScore.toFixed(2) : "s/d"} />
        </div>
        {d.history.rsi != null && (
          <div className="grid w-full grid-cols-2 gap-x-6 gap-y-1.5 text-xs md:grid-cols-4">
            <Dato etiqueta="RSI(14)" valor={d.history.rsi?.toFixed(1) ?? "s/d"} />
            <Dato etiqueta="MACD" valor={d.history.macd?.toFixed(3) ?? "s/d"} />
            <Dato etiqueta="SMA50" valor={d.history.sma50?.toFixed(2) ?? "s/d"} />
            <Dato etiqueta="SMA200" valor={d.history.sma200?.toFixed(2) ?? "s/d"} />
            <Dato etiqueta="Máx. 52s" valor={d.history.high52?.toFixed(2) ?? "s/d"} />
            <Dato etiqueta="Mín. 52s" valor={d.history.low52?.toFixed(2) ?? "s/d"} />
            <Dato
              etiqueta="Soportes"
              valor={
                d.soportes
                  .slice(0, 2)
                  .map((s) => s.toFixed(2))
                  .join(" · ") || "—"
              }
            />
            <Dato
              etiqueta="Resistencias"
              valor={
                d.resistencias
                  .slice(0, 2)
                  .map((s) => s.toFixed(2))
                  .join(" · ") || "—"
              }
            />
          </div>
        )}
        {d.signals.length > 0 && (
          <ul className="space-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
            {d.signals.map((s, i) => (
              <li key={i}>
                <span className="font-medium text-foreground">{s.nombre}:</span> {s.detalle}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function NoticiasPanel({ ticker }: { ticker: string }) {
  const fn = useServerFn(noticiasTickerFn);
  const q = useQuery({
    queryKey: ["clara-noticias", ticker],
    queryFn: () => fn({ data: { ticker } }),
    staleTime: 15 * 60_000,
    refetchOnWindowFocus: false,
  });

  if (q.isPending) return <Skeleton className="h-48 w-full" />;
  if (q.isError || !q.data || q.data.noticias.length === 0)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Sin noticias recientes para {ticker}.
        </CardContent>
      </Card>
    );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Newspaper className="h-4 w-4 text-primary" /> Noticias recientes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border/60">
          {q.data.noticias.map((n, i) => (
            <li key={i} className="py-2">
              <a
                href={n.enlace}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm leading-snug hover:text-primary"
              >
                {n.titulo}
              </a>
              <div className="mt-0.5 font-mono text-[13px] text-muted-foreground">{n.medio}</div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function AnalisisTab({ tickerInicial }: { tickerInicial?: string | null }) {
  const navigate = useNavigate();
  const [input, setInput] = useState(tickerInicial ?? "");
  const [ticker, setTicker] = useState<string | null>(tickerInicial ?? null);
  const [sugerencias, setSugerencias] = useState<TickerInfo[]>([]);
  const [dropAbierto, setDropAbierto] = useState(false);
  const [idxSel, setIdxSel] = useState(-1);

  useEffect(() => {
    if (tickerInicial && tickerInicial.trim()) {
      setInput(tickerInicial.trim().toUpperCase());
      setTicker(tickerInicial.trim().toUpperCase());
    }
  }, [tickerInicial]);

  // Único mecanismo de análisis: refleja el ticker en la URL (?tab=analisis&ticker=...)
  const analizar = (raw: string) => {
    const t = raw.trim().toUpperCase();
    if (!t) return;
    setInput(t);
    setTicker(t);
    setDropAbierto(false);
    setIdxSel(-1);
    navigate({ to: "/herramientas", search: { tab: "analisis", ticker: t } });
  };

  const onChangeInput = (v: string) => {
    setInput(v);
    setSugerencias(buscarUniverso(v));
    setDropAbierto(v.trim().length > 0);
    setIdxSel(-1);
  };

  const elegirSugerencia = (t: TickerInfo) => {
    analizar(t.ticker);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!dropAbierto || sugerencias.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdxSel((i) => Math.min(i + 1, sugerencias.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdxSel((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && idxSel >= 0) {
      e.preventDefault();
      elegirSugerencia(sugerencias[idxSel]);
    } else if (e.key === "Escape") {
      setDropAbierto(false);
      setIdxSel(-1);
    }
  };

  return (
    <div className="space-y-5">
      <form
        className="flex flex-wrap items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          analizar(input);
        }}
      >
        {/* Autocomplete del universo unificado_completo.json */}
        <div className="relative max-w-xs min-w-[240px] flex-1 sm:flex-none sm:w-72">
          <Input
            value={input}
            onChange={(e) => onChangeInput(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => input.trim() && setDropAbierto(true)}
            placeholder="Ticker o nombre (AAPL, GGAL, Pampa…)"
            autoComplete="off"
            className="w-full bg-background/80 font-mono uppercase placeholder:font-sans placeholder:normal-case placeholder:text-muted-foreground"
          />
          {dropAbierto && sugerencias.length > 0 && (
            <div
              className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border/70 bg-background/85 shadow-2xl backdrop-blur-xl"
              role="listbox"
            >
              <div className="sticky top-0 z-10 border-b border-border/50 bg-background/90 px-3 py-1.5 text-[10px] font-medium tracking-widest text-muted-foreground uppercase backdrop-blur-xl">
                Universo BCBA · CEDEARs · NYSE/NASDAQ
              </div>
              {sugerencias.map((s, i) => (
                <button
                  key={`${s.ticker}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === idxSel}
                  onMouseDown={(e) => {
                    // evita blur antes del click para que la selección llegue
                    e.preventDefault();
                    elegirSugerencia(s);
                  }}
                  onMouseEnter={() => setIdxSel(i)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors",
                    i === idxSel
                      ? "bg-primary/20 text-foreground"
                      : "text-foreground hover:bg-primary/10",
                  )}
                >
                  <span className="min-w-0">
                    <span className="font-mono text-sm font-bold">{s.ticker}</span>
                    <span className="ml-2 block truncate text-xs text-muted-foreground">
                      {s.nombre}
                    </span>
                  </span>
                  {(s.mercado || s.moneda) && (
                    <span className="shrink-0 rounded border border-border/60 bg-accent/80 px-1.5 py-0.5 font-mono text-[10px] text-foreground/90">
                      {[s.mercado, s.moneda].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button type="submit" disabled={!input.trim()}>
          <Search className="h-4 w-4" />
          Analizar
        </Button>
        <div className="hidden items-center gap-1 sm:flex">
          {EJEMPLOS.map((e) => (
            <Button
              key={e}
              type="button"
              variant="outline"
              size="sm"
              className="font-mono text-xs"
              onClick={() => analizar(e)}
            >
              {e}
            </Button>
          ))}
        </div>
      </form>
      <p className="-mt-3 text-[11px] text-muted-foreground">
        {UNIVERSO.length.toLocaleString("es-AR")} activos mapeados (acciones BCBA, CEDEARs ARS/USD,
        NYSE/NASDAQ y Brasil). Escribí ticker o nombre y elegí de la lista.
      </p>

      {ticker && (
        <div className="space-y-6">
          {/* ── ANÁLISIS TÉCNICO — disponible para TODO el universo ── */}
          <section className="space-y-3">
            <div className="flex items-baseline gap-2">
              <h3 className="text-[13px] font-semibold tracking-widest text-primary uppercase">
                Análisis técnico
              </h3>
              <span className="text-[11px] text-muted-foreground">
                precios · RSI · MACD · medias · soportes — cualquier activo listado
              </span>
            </div>
            <SemaforoPanel ticker={ticker} />
            <NoticiasPanel ticker={ticker} />
          </section>

          {/* ── ANÁLISIS FUNDAMENTAL — se despliega solo con datos reales.
              Sin fundamentales: no se renderiza nada. Con datos parciales:
              se muestran únicamente las métricas disponibles. ── */}
          <SeccionFundamental ticker={ticker} />
        </div>
      )}
    </div>
  );
}
