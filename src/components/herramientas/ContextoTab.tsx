import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Compass,
  Search,
  Loader2,
  TrendingUp,
  BookOpen,
  Scale,
  Lightbulb,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getDailyOportunidades,
  type DailyOportunidadesResult,
} from "@/lib/herramientas/daily-opportunities.functions";
import {
  getFlatTickerList,
  getIndustriasBySector,
  getUniqueSectores,
  type TickerInfo,
} from "@/lib/herramientas/universos";

// ── Subtabs (mismos valores que subTabs de "contexto" en SidebarHerramientas) ──
type SubTab = "oportunidades" | "metodologia";

const SUBTABS: { key: SubTab; label: string }[] = [
  { key: "oportunidades", label: "Oportunidades" },
  { key: "metodologia", label: "Metodología" },
];

const MAX_TICKERS = 50; // límite de getDailyOportunidades

// ── Carteras modelo (Hernán Schvarz, "Tácticas para ver oportunidades en el mercado") ──
const CARTERAS_MODELO = [
  {
    nombre: "Conservadora",
    filas: [
      ["Renta Variable", "10%"],
      ["Cedears SPY/DJ", "35%"],
      ["Renta Fija", "35%"],
      ["Caución", "20%"],
    ],
  },
  {
    nombre: "Intermedia",
    filas: [
      ["Renta Variable", "20%"],
      ["Cedears SPY/DJ", "30%"],
      ["Renta Fija", "30%"],
      ["Caución", "20%"],
    ],
  },
  {
    nombre: "Arriesgada",
    filas: [
      ["Renta Variable", "30%"],
      ["Cedears SPY/DJ", "25%"],
      ["Renta Fija", "30%"],
      ["Caución", "15%"],
    ],
  },
] as const;

function scoreColor(score: number | null): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 70) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function fmtNum(v: number | null, digits = 2): string {
  if (v == null || !isFinite(v)) return "--";
  return v.toLocaleString("es-AR", { maximumFractionDigits: digits });
}

// ─────────────────────────────────────────────────────────────────────────────
// Subtab OPORTUNIDADES — screener AT/AF sobre universo real (unificado_completo)
// Metodología: Hernán Schvarz — AT = precio y volumen · AF = flujo vs stock
// ─────────────────────────────────────────────────────────────────────────────
function OportunidadesPanel() {
  const fn = useServerFn(getDailyOportunidades);
  const sectores = useMemo(() => getUniqueSectores(), []);
  const [sector, setSector] = useState("");
  const [industria, setIndustria] = useState("");
  const [universo, setUniverso] = useState<{
    tickers: string[];
    nombres: Map<string, TickerInfo>;
  } | null>(null);

  const industrias = useMemo(() => (sector ? getIndustriasBySector(sector) : []), [sector]);

  const construirUniverso = () => {
    const flat = getFlatTickerList();
    const filtrados = flat.filter(
      (t) =>
        t.sector === sector &&
        (!industria || t.industria === industria) &&
        !/Nombre no encontrado/i.test(t.nombre),
    );
    // Dedupe por ticker (el JSON repite ARS/USD y .BA)
    const map = new Map<string, TickerInfo>();
    for (const t of filtrados) if (!map.has(t.ticker)) map.set(t.ticker, t);
    return { tickers: [...map.keys()].slice(0, MAX_TICKERS), nombres: map };
  };

  const q = useQuery({
    queryKey: ["contexto-oportunidades", universo?.tickers.join(",")],
    queryFn: (): Promise<DailyOportunidadesResult> => fn({ data: { tickers: universo!.tickers } }),
    enabled: !!universo && universo.tickers.length > 0,
    staleTime: 15 * 60_000,
    refetchOnWindowFocus: false,
  });

  const rows = useMemo(() => {
    if (!q.data?.rows || !universo) return [];
    return [...q.data.rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }, [q.data, universo]);

  const totalEnUniverso = universo ? new Set(q.data?.rows.map((r) => r.ticker)).size : 0;
  void totalEnUniverso;

  return (
    <div className="space-y-5">
      {/* Selector de universo */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Screener de oportunidades sobre el universo real de{" "}
            <span className="font-mono text-foreground">unificado_completo.json</span>. Combina el
            análisis técnico (precio y volumen) con el fundamental (valuación y catalizadores) según
            la metodología Schvarz. Máximo {MAX_TICKERS} tickers por corrida.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sector}
              onChange={(e) => {
                setSector(e.target.value);
                setIndustria("");
              }}
              className="flex-1 min-w-[180px] bg-background border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5"
            >
              <option value="">Seleccionar sector</option>
              {sectores.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {sector && (
              <select
                value={industria}
                onChange={(e) => setIndustria(e.target.value)}
                className="flex-1 min-w-[180px] bg-background border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5"
              >
                <option value="">Todas las industrias</option>
                {industrias.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            )}
            <Button
              onClick={() => setUniverso(construirUniverso())}
              disabled={!sector}
              size="sm"
              className="h-8 text-[11px]"
            >
              {q.isFetching ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Search className="h-3 w-3" />
              )}{" "}
              Buscar oportunidades
            </Button>
            {universo && universo.tickers.length === MAX_TICKERS && (
              <span className="text-[10px] text-amber-400">
                Universo truncado a {MAX_TICKERS} tickers — afiná el filtro por industria.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {q.isPending && universo && <Skeleton className="h-72 w-full" />}

      {q.isError && (
        <Card>
          <CardContent className="p-4 text-sm text-danger">
            Error al obtener datos: {(q.error as Error)?.message ?? "intente nuevamente"}
          </CardContent>
        </Card>
      )}

      {q.data && universo && (
        <>
          {/* Contexto macro real (ArgentinaDatos / BCRA) */}
          <div className="flex flex-wrap gap-2">
            {[
              ["Dólar CCL", q.data.macro.dolarCCL],
              ["Dólar MEP", q.data.macro.dolarMEP],
              ["Dólar Blue", q.data.macro.dolarBlue],
              ["Riesgo país", q.data.macro.riesgoPais],
            ].map(([label, val]) => (
              <span
                key={String(label)}
                className="rounded-lg border border-border/40 bg-background/40 px-3 py-1.5 text-[12px]"
              >
                <span className="text-muted-foreground">{label}: </span>
                <span className="font-mono text-foreground">
                  {val != null ? fmtNum(Number(val)) : "--"}
                </span>
              </span>
            ))}
          </div>

          {/* Tabla de oportunidades */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Compass className="h-4 w-4 text-primary" /> Oportunidades detectadas ({rows.length}
                )
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="p-4 text-[13px] text-muted-foreground">
                  Sin datos para este universo.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ticker</TableHead>
                        <TableHead>Precio</TableHead>
                        <TableHead>Var %</TableHead>
                        <TableHead>Rvol</TableHead>
                        <TableHead>Beta</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Catalizador</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => {
                        const info = universo.nombres.get(r.ticker);
                        return (
                          <TableRow key={r.ticker}>
                            <TableCell>
                              <Link
                                to="/herramientas"
                                search={{ tab: "analisis", ticker: r.ticker }}
                                className="font-mono text-[12px] font-semibold text-primary hover:underline"
                              >
                                {r.ticker}
                              </Link>
                              <div className="max-w-[220px] truncate text-[11px] text-muted-foreground">
                                {info?.nombre ?? "--"}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-[12px]">
                              {fmtNum(r.precio)}
                            </TableCell>
                            <TableCell
                              className={`font-mono text-[12px] ${
                                (r.varPct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
                              }`}
                            >
                              {r.varPct != null ? `${fmtNum(r.varPct)}%` : "--"}
                            </TableCell>
                            <TableCell className="font-mono text-[12px]">
                              {fmtNum(r.rvol)}
                            </TableCell>
                            <TableCell className="font-mono text-[12px]">
                              {fmtNum(r.beta)}
                            </TableCell>
                            <TableCell>
                              <span
                                className={`font-mono text-[13px] font-semibold ${scoreColor(r.score)}`}
                              >
                                {r.score != null ? r.score : "--"}
                              </span>
                              <div className="mt-0.5 flex gap-1">
                                {(["volumen", "valuacion", "momentum"] as const).map((k) => (
                                  <span
                                    key={k}
                                    title={`${k}: ${r.detalleScore[k] ?? "s/d"}`}
                                    className={`h-1 w-6 rounded-full ${
                                      r.detalleScore[k] != null
                                        ? scoreColor(r.detalleScore[k])
                                        : "bg-muted"
                                    } inline-block`}
                                    style={
                                      r.detalleScore[k] != null
                                        ? { opacity: 0.35 + (r.detalleScore[k]! / 100) * 0.65 }
                                        : undefined
                                    }
                                  />
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[200px] text-[11px] leading-snug text-muted-foreground">
                              {r.catalizadorLabel}
                              {r.proximoEarnings && (
                                <div className="font-mono text-[10px]">
                                  Earnings: {r.proximoEarnings}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {(q.data.errors.length > 0 || q.data.warnings.length > 0) && (
                <div className="mt-3 space-y-1">
                  {[...q.data.errors, ...q.data.warnings].slice(0, 5).map((e, i) => (
                    <p key={i} className="text-[10px] text-amber-400/80">
                      {e}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Lectura metodológica */}
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardContent className="p-4 flex gap-3">
                <TrendingUp className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Capa técnica (AT): </span>
                  precio y volumen en una fecha dada. Rvol alto indica interés del mercado; el
                  momentum y el gap muestran si el movimiento tiene fuerza. Estudiá el gráfico antes
                  de operar: no te limites a las señales armadas.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex gap-3">
                <Scale className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Capa fundamental (AF): </span>
                  valuación por percentil de P/E frente a su historia y catalizadores (upgrades de
                  brokers, earnings). Clave: mirar el <em>flujo</em>, no solo el EPS ni los
                  revenues. Buscá ventajas competitivas: monopolios o empresas de un solo producto.
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {!universo && !q.isPending && (
        <Card>
          <CardContent className="p-6 text-[13px] text-muted-foreground">
            Seleccioná un sector y presioná{" "}
            <span className="text-foreground">Buscar oportunidades</span> para analizar el universo
            con datos en vivo.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subtab METODOLOGÍA — "Tácticas para ver oportunidades en el mercado"
// ─────────────────────────────────────────────────────────────────────────────
function MetodologiaPanel() {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4 text-primary" /> Marco general
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
          <p>
            Basado en{" "}
            <span className="text-foreground">“Tácticas para ver oportunidades en el mercado”</span>{" "}
            (Hernán Schvarz, Consultora ETR). Argentina presenta problemas estructurales
            persistentes y, al no ir de la mano la inflación con el tipo de cambio, diseñar una
            cartera es complejo:{" "}
            <span className="text-foreground">la clave está en la diversificación</span>. La
            sobre-diversificación es enemiga del retorno, pero nunca nadie se fundió por tener un
            bajo rendimiento.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>ETFs en pesos: buena alternativa para cubrirse de devaluaciones.</li>
            <li>Bonos CER / BONCAR: buena alternativa para cubrirse de la inflación.</li>
            <li>
              Estar actualizado con las normas cambiarias permite encontrar oportunidades (nuevos
              ETFs, ventajas regulatorias).
            </li>
            <li>
              Nadie determina el futuro: la misión es dar previsibilidad a partir de activos
              subvaluados.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary" /> Carteras modelo por perfil de riesgo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {CARTERAS_MODELO.map((c) => (
              <div
                key={c.nombre}
                className="rounded-lg border border-border/40 bg-background/40 p-3"
              >
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-primary">
                  {c.nombre}
                </p>
                <ul className="space-y-1.5">
                  {c.filas.map(([clase, peso]) => (
                    <li key={clase} className="flex items-center justify-between text-[12px]">
                      <span className="text-muted-foreground">{clase}</span>
                      <span className="font-mono text-foreground">{peso}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-primary" /> Análisis Técnico (AT)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[13px] leading-relaxed text-muted-foreground">
            <p>
              Precio y volumen en una fecha dada. Es fundamental entenderlo y estudiarlo, luego
              determinar si efectivamente se cumple — no comprar “porque el MACD dio compra” sin
              entender qué es una media ni dónde buscar la información.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Scale className="h-4 w-4 text-primary" /> Análisis Fundamental (AF)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[13px] leading-relaxed text-muted-foreground">
            <p>
              Mucho más complejo: conlleva múltiples análisis y estimaciones.{" "}
              <span className="text-foreground">Clave = Stock vs Flujo.</span> No limitarse al EPS
              ni a los revenues (ej. NFLX 2021: cayó por desaceleración proyectada de suscriptores
              ante más competencia → menos flujo futuro). Ejemplos de stock puro: CRESUD; flujo
              claro: empresa constructora con contratos a valor presente.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Lightbulb className="h-4 w-4 text-primary" /> Métodos para valuar empresas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              [
                "WACC",
                "Actualiza rendimientos netos estimados descontados al costo promedio ponderado del capital, deduciendo el valor de mercado de la deuda. Ventaja: simplicidad.",
              ],
              [
                "APV",
                "Más riguroso: soslaya la dificultad de determinar objetivamente el costo de capital. La empresa se financia exclusivamente con capital propio y se ajusta por escudos fiscales.",
              ],
              [
                "Múltiplos implícitos",
                "Comparar Market Cap / EBITDA con empresas similares del mismo sector en un mercado normal (EE.UU.): la que se desvía puede estar sobre o sub-valuada — esa es la tarea del AF.",
              ],
              [
                "Valuación técnica de activos",
                "Criterio relegado pero no obsoleto: valores corrientes de los activos netos de deudas operativas, cuando los valores contables no son representativos.",
              ],
            ].map(([titulo, texto]) => (
              <div key={titulo} className="rounded-lg border border-border/40 bg-background/40 p-3">
                <p className="mb-1 text-[12px] font-semibold text-foreground">{titulo}</p>
                <p className="text-[12px] leading-relaxed text-muted-foreground">{texto}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Caso 2021 · SCP</CardTitle>
          </CardHeader>
          <CardContent className="text-[13px] leading-relaxed text-muted-foreground">
            Sociedad Comercial del Plata: al borde de la quiebra (1999-2003), llegó a cotizar a
            $0,05. Reestructurada desde 2018 hacia construcción y petróleo. En 2021 comenzó a pagar
            dividendos y el precio se acomodó a su valor: la valuación por WACC daba ~$6,50 a fines
            de 2020 y dejó una renta del 80% en dólares. El “batacazo” surgió del AF aplicado con
            disciplina.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Caso 2021 · MELI</CardTitle>
          </CardHeader>
          <CardContent className="text-[13px] leading-relaxed text-muted-foreground">
            Cotizaba desde ~USD 50 (2007) y recién superó USD 100 en 2013. La euforia minoritaria
            entró entre USD 1.200 y 2.000 (2020-2021); presentó patrimonio negativo en Q1-2021 y fue
            uno de los peores CEDEARs del año (-50% desde máximos en USD). Por WACC estaba “en
            precio”, por múltiplos “barata”: el método importa tanto como el análisis.
          </CardContent>
        </Card>
      </div>

      <p className="text-[11px] text-muted-foreground/70">
        Fuente: “Tácticas para ver oportunidades en el mercado” — Hernán Schvarz (31/01/2022).
        Agente Productor N°1025 · Cdor. Público · MBA, MFA · Fundador Consultora ETR. Contenido
        informativo, no constituye recomendación de inversión.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function ContextoTab({ initialSubTab }: { initialSubTab?: string } = {}) {
  const [sub, setSub] = useState<SubTab>(
    SUBTABS.some((t) => t.key === initialSubTab) ? (initialSubTab as SubTab) : "oportunidades",
  );

  useEffect(() => {
    if (initialSubTab && SUBTABS.some((t) => t.key === initialSubTab)) {
      setSub(initialSubTab as SubTab);
    }
  }, [initialSubTab]);

  return (
    <div className="space-y-8 w-full">
      <div>
        <h2 className="font-display text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-tight tracking-tight">
          Contexto de mercado
        </h2>
        <p className="mt-1 max-w-3xl text-[17px] leading-relaxed text-muted-foreground lg:text-[19px]">
          Oportunidades con datos reales (Yahoo Finance, ArgentinaDatos, BCRA) sobre el universo
          completo de CEDEARs, acciones y bonos, aplicando la metodología de detección de
          oportunidades del mercado local.
        </p>
        <div aria-hidden className="electric-line mt-6 max-w-3xl" />
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-border/40 pb-2 w-full">
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={`font-mono text-[14px] px-4 py-2 rounded-lg border transition-colors ${
              sub === t.key
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === "oportunidades" && <OportunidadesPanel />}
      {sub === "metodologia" && <MetodologiaPanel />}
    </div>
  );
}
