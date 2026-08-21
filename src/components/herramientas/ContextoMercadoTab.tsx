// @ts-nocheck
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getRecomendaciones } from "@/lib/motor-recomendacion.functions";
import {
  getRecomendacionesSchvarz,
  type PerfilSchvarz,
  type RecomendacionSchvarz,
  type RecomendacionesSchvarzResult,
} from "@/lib/schvarz-recomendacion.functions";

function fmtPct(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "--";
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
}

function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "--";
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}`;
}

// ─── Nuevo panel: Contexto Macro ──────────────────────────────────────────────

function MacroContextoPanel() {
  const FLASK_BASE =
    import.meta.env.NEWS_API_URL || import.meta.env.FLASK_API_URL || "http://localhost:5000";
  const [data, setData] = useState<{
    riesgoPais: number | null;
    inflacion_mensual: number | null;
    dolar_oficial: number | null;
    dolar_blue: number | null;
    dolar_mep: number | null;
    dolar_ccl: number | null;
    badlar: number | null;
    timestamp: string;
  } | null>(null);

  const { isLoading, isError } = useQuery({
    queryKey: ["macro-contexto"],
    queryFn: async () => {
      try {
        const res = await fetch(`${FLASK_BASE}/api/macro-context`, {
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Record<string, unknown>;

        const num = (v: unknown): number | null =>
          typeof v === "number" ? v : v != null ? null : null;

        const dolar = (d: unknown): number | null => {
          if (d == null) return null;
          if (typeof d === "object" && "compra" in d) return num((d as { compra?: number }).compra);
          return num(d);
        };

        const riesgo = json.riesgoPais ?? json.riesgo_pais;
        const inflacion = (json.inflacion as { mensual?: number } | undefined) ?? null;
        const dolares =
          (json.dolares as
            | {
                oficial?: unknown;
                blue?: unknown;
                mep?: unknown;
                ccl?: unknown;
              }
            | undefined) ?? null;
        const tasas = (json.tasas as { badlar?: number } | undefined) ?? null;

        setData({
          riesgoPais:
            typeof riesgo === "number" ? riesgo : num((riesgo as { valor?: number })?.valor),
          inflacion_mensual:
            typeof json.inflacion_mensual === "number"
              ? json.inflacion_mensual
              : num(inflacion?.mensual),
          dolar_oficial: dolar(dolares?.oficial ?? json.dolar_oficial),
          dolar_blue: dolar(dolares?.blue ?? json.dolar_blue),
          dolar_mep: dolar(dolares?.mep ?? json.dolar_mep),
          dolar_ccl: dolar(dolares?.ccl ?? json.dolar_ccl),
          badlar:
            typeof json.tasa_pasiva === "number"
              ? json.tasa_pasiva
              : num(tasas?.badlar ?? json.badlar),
          timestamp: typeof json.timestamp === "string" ? json.timestamp : new Date().toISOString(),
        });
      } catch (e) {
        console.error("[MacroContextoPanel] error fetching data:", e);
        throw e;
      }
    },
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card className="border border-border/40 bg-background/40/80 backdrop-blur-sm">
        <div className="p-4">
          <Skeleton className="h-6 w-full rounded-lg" />
        </div>
      </Card>
    );
  }

  if (isError || data == null) {
    return (
      <Card className="border border-border/40 bg-background/40/80 backdrop-blur-sm">
        <div className="p-2 text-[9px] text-warning">
          Error al cargar contexto macro. Intente nuevamente.
        </div>
      </Card>
    );
  }

  // Derivar indicadores para MetricaMini
  const riesgoPaisTexto = data.riesgoPais ? `${data.riesgoPais} puntos` : "--";
  const inflacionTexto = data.inflacion_mensual ? `${fmtPct(data.inflacion_mensual)}` : "--";
  const brechaTexto =
    data.dolar_oficial != null && data.dolar_blue != null
      ? `${fmtPct(data.dolar_blue - data.dolar_oficial)} (blue-oficial)`
      : "--";
  const badlarTexto = data.badlar ? `${fmtPct(data.badlar)}` : "--";

  return (
    <Card className="border border-border/40 bg-background/40/80 backdrop-blur-sm">
      <h3 className="text-[9px] font-mono uppercase tracking-wider text-[2px] font-semibold text-muted-foreground px-3 py-2.5">
        Contexto Macro
      </h3>
      <div className="p-3 space-y-2">
        <MetricaMini label="Riesgo País" value={riesgoPaisTexto} />
        <MetricaMini label="Inflación Mensual" value={inflacionTexto} />
        <MetricaMini label="Brecha Cambiaria" value={brechaTexto} />
        <MetricaMini label="Badlar" value={badlarTexto} />
      </div>
    </Card>
  );
}

// Reordenar: MacroContextoPanel primero, luego los paneles existentes
function RecomendacionesPanel() {
  const getRecomendacionesFn = useServerFn(getRecomendaciones);
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const {
    data: recomendaciones,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["recomendaciones-contexto"],
    queryFn: () => getRecomendacionesFn(),
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  const irATab = (tab: string, ticker: string, subTab?: string) => {
    navigate({
      to: "/herramientas",
      search: { tab, subTab, ticker } as {
        tab: string;
        subTab: string | undefined;
        ticker: string | undefined;
      },
    });
  };

  return (
    <Card className="border border-border/40 bg-background/40/80 backdrop-blur-sm">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground"
      >
        <span>Activos Recomendados Hoy</span>
        <span className="text-muted-foreground">{collapsed ? "▼" : "▲"}</span>
      </button>
      {!collapsed && (
        <div className="px-4 pb-4">
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          )}
          {isError && !isLoading && (
            <p className="text-[10px] text-warning py-2">
              Error al obtener recomendaciones. Intente nuevamente más tarde.
            </p>
          )}
          {!isLoading && !isError && (!recomendaciones || recomendaciones.length === 0) && (
            <p className="text-[10px] text-muted-foreground/80 border border-dashed border-border/30 rounded p-3 text-center">
              Sin candidatos con alineación suficiente hoy &mdash; las capas disponibles no
              confirman senales.
            </p>
          )}
          {!isLoading && recomendaciones && recomendaciones.length > 0 && (
            <div className="space-y-2">
              {recomendaciones.map((r) => (
                <div
                  key={r.ticker}
                  className="rounded-lg border border-border/30 bg-background/40/40 p-2.5"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="text-xs font-mono font-semibold text-foreground">
                        {r.ticker}
                      </span>
                      <span className="ml-2 text-[9px] text-muted-foreground">{r.sector}</span>
                    </div>
                    <span
                      className={`text-[9px] font-mono ${
                        r.scoreConfianza >= 3
                          ? "text-emerald-400"
                          : r.scoreConfianza >= 1
                            ? "text-amber-400"
                            : "text-muted-foreground"
                      }`}
                    >
                      {r.scoreConfianza}/{r.maxPosible} capas
                    </span>
                  </div>
                  <p className="text-[9px] text-muted-foreground leading-relaxed mb-1.5">
                    {r.resumenTextual}
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    {r.capas
                      .filter((c) => c.disponible)
                      .map((c) => (
                        <span
                          key={c.nombre}
                          className={`text-[8px] font-mono px-1 py-0.5 rounded ${
                            c.valor === 1
                              ? "bg-emerald-950/40 text-emerald-400"
                              : c.valor === -1
                                ? "bg-red-950/40 text-red-400"
                                : "bg-muted/20 text-muted-foreground"
                          }`}
                        >
                          {c.nombre}: {c.valor === 1 ? "+1" : c.valor === -1 ? "-1" : "0"}
                        </span>
                      ))}
                    <div className="flex gap-1 ml-auto">
                      <button
                        onClick={() => irATab("analisis", r.ticker, "fundamental")}
                        className="text-[8px] font-mono px-1.5 py-0.5 rounded border border-emerald-800/40 text-emerald-400 hover:bg-emerald-950/40 transition-colors"
                      >
                        Ver AF
                      </button>
                      <button
                        onClick={() => irATab("analisis", r.ticker, "tecnico")}
                        className="text-[8px] font-mono px-1.5 py-0.5 rounded border border-blue-800/40 text-blue-400 hover:bg-blue-950/40 transition-colors"
                      >
                        Ver Tecnico
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function RecomendacionesSchvarzPanel() {
  const getRecomendacionesSchvarzFn = useServerFn(getRecomendacionesSchvarz);
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [perfilActivo, setPerfilActivo] = useState<PerfilSchvarz>("moderado");

  const {
    data: result,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["recomendaciones-schvarz"],
    queryFn: () => getRecomendacionesSchvarzFn({ data: { topN: 5 } }),
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  const irATab = (tab: string, ticker: string, subTab?: string) => {
    navigate({
      to: "/herramientas",
      search: { tab, subTab, ticker } as {
        tab: string;
        subTab: string | undefined;
        ticker: string | undefined;
      },
    });
  };

  const recomendaciones = result?.[perfilActivo] ?? [];
  const perfilInfo = result?.diversificacion.find((d) => d.perfil === perfilActivo);

  const perfilLabel: Record<PerfilSchvarz, string> = {
    conservador: "Conservador",
    moderado: "Moderado",
    agresivo: "Agresivo",
  };

  const perfilColor: Record<PerfilSchvarz, string> = {
    conservador: "text-emerald-400 border-emerald-800/40",
    moderado: "text-amber-400 border-amber-800/40",
    agresivo: "text-rose-400 border-rose-800/40",
  };

  return (
    <Card className="border border-border/40 bg-background/40/80 backdrop-blur-sm">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground"
      >
        <span>Activos Recomendados Hoy — Metodología Hernán Schvarz</span>
        <span className="text-muted-foreground">{collapsed ? "▼" : "▲"}</span>
      </button>
      {!collapsed && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-[9px] text-muted-foreground leading-relaxed">
            Combina análisis técnico, valuación por WACC/APV, múltiplos implícitos, valor técnico de
            activos y ventaja competitiva (moat) para seleccionar activos dentro de un marco de
            diversificación por perfil de riesgo.
          </p>

          <div className="flex gap-1.5">
            {(["conservador", "moderado", "agresivo"] as PerfilSchvarz[]).map((p) => (
              <button
                key={p}
                onClick={() => setPerfilActivo(p)}
                className={`text-[9px] font-mono px-2 py-1 rounded border transition-colors ${
                  perfilActivo === p
                    ? `${perfilColor[p]} bg-background/60`
                    : "border-border/30 text-muted-foreground hover:bg-muted/20"
                }`}
              >
                {perfilLabel[p]}
              </button>
            ))}
          </div>

          {perfilInfo && (
            <div className="rounded-lg border border-border/30 bg-background/40/40 p-2.5">
              <p className="text-[9px] font-mono text-foreground mb-1.5">
                Diversificación sugerida — perfil {perfilLabel[perfilActivo].toLowerCase()}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {perfilInfo.allocations.map((a) => (
                  <div
                    key={a.clase}
                    className="rounded border border-border/20 bg-background/40 p-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] text-muted-foreground">{a.clase}</span>
                      <span className="text-[8px] font-mono text-foreground">{a.pct}%</span>
                    </div>
                    <p className="text-[7px] text-muted-foreground/80 mt-0.5">{a.nota}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result?.universo && (
            <div className="rounded-lg border border-border/30 bg-background/40/40 p-2.5">
              <p className="text-[9px] font-mono text-foreground mb-1.5">
                Universo analizado · {result.universo.total} tickers
              </p>
              <div className="flex flex-wrap gap-1">
                {result.universo.porSector.slice(0, 6).map((s) => (
                  <span
                    key={s.sector}
                    className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground"
                  >
                    {s.sector} · {s.cantidad}
                  </span>
                ))}
              </div>
            </div>
          )}

          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          )}
          {isError && !isLoading && (
            <p className="text-[10px] text-warning py-2">
              Error al obtener recomendaciones Schvarz. Intente nuevamente más tarde.
            </p>
          )}
          {!isLoading && recomendaciones.length === 0 && (
            <p className="text-[10px] text-muted-foreground/80 border border-dashed border-border/30 rounded p-3 text-center">
              Sin candidatos con alineación Schvarz suficiente hoy.
            </p>
          )}
          {!isLoading && recomendaciones.length > 0 && (
            <div className="space-y-2">
              {recomendaciones.map((r: RecomendacionSchvarz) => (
                <div
                  key={r.ticker}
                  className="rounded-lg border border-border/30 bg-background/40/40 p-2.5"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="text-xs font-mono font-semibold text-foreground">
                        {r.ticker}
                      </span>
                      <span className="ml-2 text-[9px] text-muted-foreground">
                        {r.industria || r.sector}
                      </span>
                      {r.tipo && (
                        <span className="ml-2 text-[8px] font-mono uppercase text-muted-foreground/70">
                          {r.tipo}
                        </span>
                      )}
                      {r.mercado && (
                        <span className="ml-1 text-[8px] font-mono text-muted-foreground/70">
                          {r.mercado}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[9px] font-mono ${
                        r.clasificacion === "COMPRA"
                          ? "text-emerald-400"
                          : r.clasificacion === "COMPRA CON CAUTELA"
                            ? "text-amber-400"
                            : "text-muted-foreground"
                      }`}
                    >
                      {r.clasificacion} · {r.scoreSchvarz.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[9px] text-muted-foreground leading-relaxed mb-1.5">
                    {r.reasoning}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 mb-2">
                    <MetricaMini
                      label="Margen val."
                      value={fmtPct(r.valuation.margenSeguridadPromedio)}
                    />
                    <MetricaMini label="Técnico" value={r.technical.clasificacion} />
                    <MetricaMini label="Moat" value={r.moatLabel} />
                    <MetricaMini
                      label="Precio"
                      value={r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                    />
                  </div>
                  <div className="flex gap-1 ml-auto justify-end">
                    <button
                      onClick={() => irATab("analisis", r.ticker, "fundamental")}
                      className="text-[8px] font-mono px-1.5 py-0.5 rounded border border-emerald-800/40 text-emerald-400 hover:bg-emerald-950/40 transition-colors"
                    >
                      Ver AF
                    </button>
                    <button
                      onClick={() => irATab("analisis", r.ticker, "tecnico")}
                      className="text-[8px] font-mono px-1.5 py-0.5 rounded border border-blue-800/40 text-blue-400 hover:bg-blue-950/40 transition-colors"
                    >
                      Ver Técnico
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function MetricaMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/20 bg-background/40 px-1.5 py-1">
      <span className="text-[7px] text-muted-foreground/80 block">{label}</span>
      <span className="text-[9px] font-mono text-foreground">{value}</span>
    </div>
  );
}

// Reordenado: MacroContextoPanel primero, luego RecomendacionesPanel y RecomendacionesSchvarzPanel
export function ContextoMercadoTab() {
  return (
    <div className="space-y-4">
      <MacroContextoPanel />
      <RecomendacionesSchvarzPanel />
      <RecomendacionesPanel />
    </div>
  );
}
