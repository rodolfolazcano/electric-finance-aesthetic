// @ts-nocheck
import { useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  COMPARADORES,
  type ComparadorId,
  type ComparadorResultado,
  type HardDollarAsset,
} from "@/lib/renta-fija/comparadores.types";
import {
  comparadorA,
  comparadorB,
  comparadorC,
  comparadorD,
  comparadorE,
  comparadorF,
  comparadorG,
  comparadorH,
  buscarCERIOL,
} from "@/lib/renta-fija/comparadores.functions";

const DISCLAIMER =
  "Esta herramienta es informativa y no constituye recomendación de inversión. Los cálculos se basan en datos de mercado públicos (IOL, ArgentinaDatos, BCRA, Yahoo Finance) y proyecciones sujetas a error. Rentabilidades pasadas no garantizan resultados futuros. Consulte a su Agente Productora antes de invertir.";

function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtPct(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(dp)}%`;
}

function fmtBps(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return `${n >= 0 ? "+" : ""}${n.toFixed(0)} bps`;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-4 text-center text-sm text-red-400">
      Error: {error}
    </div>
  );
}

function Disclaimer() {
  return (
    <div className="mt-4 rounded-lg border border-border/30 bg-muted/5 p-3 text-[10px] leading-relaxed text-muted-foreground">
      {DISCLAIMER}
    </div>
  );
}

function TimestampBadge({ ts }: { ts: string }) {
  const fecha = new Date(ts);
  const diff = Date.now() - fecha.getTime();
  const horas = Math.floor(diff / 3600000);
  const antigua = horas > 24;
  return (
    <span className={`text-[9px] ${antigua ? "text-yellow-500" : "text-muted-foreground"}`}>
      {antigua ? "" : ""}Actualizado: {fecha.toLocaleString("es-AR")}
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-4 w-48 rounded bg-muted/20" />
      <div className="h-32 rounded bg-muted/10" />
      <div className="h-24 rounded bg-muted/10" />
    </div>
  );
}

interface ComparadoresSubTabProps {
  sessionId?: string;
}

export function ComparadoresSubTab({ sessionId }: ComparadoresSubTabProps) {
  const [active, setActive] = useState<ComparadorId>("A");
  const [resultado, setResultado] = useState<ComparadorResultado | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selTickerA, setSelTickerA] = useState("GD30");
  const [selPeriodoA, setSelPeriodoA] = useState(12);
  const [selTickerC, setSelTickerC] = useState("CUJ26");
  const [selTickerCerD, setSelTickerCerD] = useState("CUJ26");
  const [selTickerTFD, setSelTickerTFD] = useState("S17A6");
  const [hdAssets, setHdAssets] = useState<HardDollarAsset[]>([]);
  const [hdSearch, setHdSearch] = useState("");

  const fnA = useServerFn(comparadorA);
  const fnB = useServerFn(comparadorB);
  const fnC = useServerFn(comparadorC);
  const fnD = useServerFn(comparadorD);
  const fnE = useServerFn(comparadorE);
  const fnF = useServerFn(comparadorF);
  const fnG = useServerFn(comparadorG);
  const fnH = useServerFn(comparadorH);
  const fnCER = useServerFn(buscarCERIOL);

  const loadComparador = useCallback(
    (id: ComparadorId, extra?: Record<string, unknown>) => {
      setActive(id);
      setLoading(true);
      setError(null);
      setResultado(null);

      const action = async () => {
        let res: ComparadorResultado;
        switch (id) {
          case "A": {
            const d = await fnA({
              data: {
                ticker: (extra?.ticker as string) ?? selTickerA,
                sessionId,
                periodoMeses: (extra?.periodo as number) ?? selPeriodoA,
              },
            });
            if (d.hardDollarAssets) setHdAssets(d.hardDollarAssets);
            res = { id: "A", data: d };
            break;
          }
          case "B": {
            const d = await fnB({
              data: { tickerLecap: (extra?.tickerLecap as string) ?? "S17A6" },
            });
            res = { id: "B", data: d };
            break;
          }
          case "C": {
            const d = await fnC({
              data: { ticker: (extra?.ticker as string) ?? selTickerC, sessionId },
            });
            res = { id: "C", data: d };
            break;
          }
          case "D": {
            const d = await fnD({
              data: {
                cerTicker: (extra?.cerTicker as string) ?? selTickerCerD,
                tasaFijaTicker: (extra?.tasaFijaTicker as string) ?? selTickerTFD,
              },
            });
            res = { id: "D", data: d };
            break;
          }
          case "E": {
            const d = await fnE({ data: {} });
            res = { id: "E", data: d };
            break;
          }
          case "F": {
            const d = await fnF({ data: {} });
            res = { id: "F", data: d };
            break;
          }
          case "G": {
            const d = await fnG({ data: {} });
            res = { id: "G", data: d };
            break;
          }
          case "H": {
            const d = await fnH({ data: {} });
            res = { id: "H", data: d };
            break;
          }
        }
        return res;
      };

      action()
        .then(setResultado)
        .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar"))
        .finally(() => setLoading(false));
    },
    [
      sessionId,
      selTickerA,
      selPeriodoA,
      selTickerC,
      selTickerCerD,
      selTickerTFD,
      fnA,
      fnB,
      fnC,
      fnD,
      fnE,
      fnF,
      fnG,
    ],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-border/40 pb-2">
        {COMPARADORES.map((c) => (
          <button
            key={c.id}
            onClick={() => loadComparador(c.id)}
            className={`mono rounded-t-sm px-2 py-1 text-[10px] transition-colors ${
              active === c.id
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title={c.descripcion}
          >
            {c.id} · {c.label}
          </button>
        ))}
      </div>

      {loading && <LoadingSkeleton />}
      {error && <ErrorState error={error} />}

      {resultado && !loading && !error && (
        <ComparadorRenderer resultado={resultado} sessionId={sessionId} />
      )}

      {!loading && !resultado && !error && (
        <EmptyState text="Seleccioná un comparador para ver el análisis." />
      )}

      {resultado && <Disclaimer />}
    </div>
  );
}

function ComparadorRenderer({
  resultado,
  sessionId,
}: {
  resultado: ComparadorResultado;
  sessionId?: string;
}) {
  switch (resultado.id) {
    case "A":
      return <ComparadorAView data={resultado.data} sessionId={sessionId} />;
    case "B":
      return <ComparadorBView data={resultado.data} />;
    case "C":
      return <ComparadorCView data={resultado.data} />;
    case "D":
      return <ComparadorDView data={resultado.data} />;
    case "E":
      return <ComparadorEView data={resultado.data} />;
    case "F":
      return <ComparadorFView data={resultado.data} />;
    case "G":
      return <ComparadorGView data={resultado.data} />;
    case "H":
      return <ComparadorHView data={resultado.data} />;
  }
}

//
// COMPARADOR H — Brecha de Ley AL vs GD (Elbaum 10.7)
//

function ComparadorHView({ data }: { data: ComparadorResultado["data"] }) {
  const hd = data as any;
  if (hd.error) return <ErrorState error={hd.error} />;
  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-medium">Brecha de Ley · Bonares (AR) vs Globales (NY)</div>
        <div className="text-[10px] text-muted-foreground">
          Riesgo jurisdiccional: TIR Bonar − TIR Global del mismo vencimiento. Brecha positiva =
          premio por ley argentina; negativa = riesgo de reestructuración local. Elbaum 10.7.
        </div>
        <TimestampBadge ts={hd.timestamp} />
      </div>
      {hd.pares?.length ? (
        <table className="mono w-full text-xs">
          <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="px-2 py-2 text-left">Par</th>
              <th className="px-2 py-2 text-right">Venc</th>
              <th className="px-2 py-2 text-right">TIR Bonar</th>
              <th className="px-2 py-2 text-right">TIR Global</th>
              <th className="px-2 py-2 text-right">Brecha</th>
              <th className="px-2 py-2 text-left">Interpretación</th>
            </tr>
          </thead>
          <tbody>
            {hd.pares.map((p: any) => (
              <tr key={p.par} className="border-b border-border/30">
                <td className="px-2 py-2 font-medium">{p.par}</td>
                <td className="px-2 py-2 text-right text-muted-foreground">{p.vencimiento}</td>
                <td className="px-2 py-2 text-right">
                  {p.bonarTir != null ? fmtPct(p.bonarTir, 2) : "—"}
                </td>
                <td className="px-2 py-2 text-right">
                  {p.globalTir != null ? fmtPct(p.globalTir, 2) : "—"}
                </td>
                <td
                  className={`px-2 py-2 text-right font-medium ${
                    p.brechaBps == null
                      ? ""
                      : p.brechaBps > 0
                        ? "text-green-400"
                        : "text-red-400"
                  }`}
                >
                  {fmtBps(p.brechaBps)}
                </td>
                <td className="px-2 py-2 text-[10px] text-muted-foreground">
                  {p.brechaBps == null
                    ? "s/d"
                    : p.brechaBps > 100
                      ? "Premio ley AR alto"
                      : p.brechaBps > 0
                        ? "Premio moderado"
                        : "Ley NY paga más"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState text="Sin pares disponibles." />
      )}
    </div>
  );
}

// 
// COMPARADOR A — Hard Dollar vs UST10Y
// 

function ComparadorAView({
  data,
  sessionId,
}: {
  data: ComparadorResultado["data"];
  sessionId?: string;
}) {
  const ad = data as any;
  const [busqueda, setBusqueda] = useState("");
  const [selTicker, setSelTicker] = useState(ad.ticker ?? "GD30");
  const [selPeriodo, setSelPeriodo] = useState(ad.periodoMeses ?? 12);

  if (ad.error && !ad.hardDollarAssets?.length) return <ErrorState error={ad.error} />;

  const filtered = (ad.hardDollarAssets ?? []).filter(
    (a: any) =>
      a.ticker.toUpperCase().includes(busqueda.toUpperCase()) ||
      a.descripcion.toUpperCase().includes(busqueda.toUpperCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Hard Dollar · {selTicker} vs UST 10Y</div>
          <div className="text-[10px] text-muted-foreground">{ad.descripcion}</div>
          <TimestampBadge ts={ad.timestamp} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Buscar activo Hard Dollar..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="mono w-full rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/50"
          />
          {busqueda && filtered.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-10 mt-0.5 max-h-36 overflow-y-auto rounded-md border border-border/60 bg-background shadow-lg">
              {filtered.slice(0, 20).map((a: any) => (
                <button
                  key={a.ticker}
                  onClick={() => {
                    setSelTicker(a.ticker);
                    setBusqueda("");
                  }}
                  className={`w-full px-2 py-1 text-left text-[10px] hover:bg-muted/20 ${selTicker === a.ticker ? "bg-muted/30 text-foreground" : "text-muted-foreground"}`}
                >
                  <span className="font-medium">{a.ticker}</span>
                  <span className="ml-1 text-[9px]">{a.descripcion.substring(0, 60)}</span>
                  <span className="ml-1 text-[9px] text-muted-foreground/60">{a.vencimiento}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Período:</span>
          {[6, 12, 18, 24, 36].map((m) => (
            <button
              key={m}
              onClick={() => setSelPeriodo(m)}
              className={`mono rounded px-1.5 py-0.5 text-[10px] ${selPeriodo === m ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {m < 12 ? `${m}m` : m === 12 ? "1a" : m === 24 ? "2a" : m === 36 ? "3a" : `${m}m`}
            </button>
          ))}
        </div>
      </div>

      <table className="mono w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-2 py-2 text-left">Métrica</th>
            <th className="px-2 py-2 text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/30">
            <td className="px-2 py-2">TIR {selTicker}</td>
            <td className="px-2 py-2 text-right font-medium">{fmtPct(ad.tir)}</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="px-2 py-2">TIR TEA {selTicker}</td>
            <td className="px-2 py-2 text-right">{fmtPct(ad.tirTEA)}</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="px-2 py-2">UST 10Y Yield</td>
            <td className="px-2 py-2 text-right">{fmtPct(ad.usTreasury10y)}</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="px-2 py-2">Spread (bps)</td>
            <td className="px-2 py-2 text-right">{fmtBps(ad.spreadBps)}</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="px-2 py-2">Riesgo País (EMBI+)</td>
            <td className="px-2 py-2 text-right">
              {ad.riesgoPais != null ? fmtNum(ad.riesgoPais, 0) : "\u2014"}
            </td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="px-2 py-2">Delta spread − riesgo país</td>
            <td
              className={`px-2 py-2 text-right ${ad.deltaSpreadRiesgoPais != null && Math.abs(ad.deltaSpreadRiesgoPais) > 150 ? "text-yellow-400" : ""}`}
            >
              {fmtBps(ad.deltaSpreadRiesgoPais)}
            </td>
          </tr>
        </tbody>
      </table>

      {ad.spreadBps != null &&
        ad.riesgoPais != null &&
        Math.abs(ad.spreadBps - ad.riesgoPais) > 150 && (
          <div className="rounded-lg border border-yellow-900/40 bg-yellow-950/20 p-3 text-[11px] text-yellow-300">
            Posible desalineo: spread ({fmtBps(ad.spreadBps)}) difiere del riesgo país (
            {ad.riesgoPais != null ? fmtNum(ad.riesgoPais, 0) + " bps" : "\u2014"}) en más de 150
            bps.
          </div>
        )}

      {ad.monthlyFlows && ad.monthlyFlows.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-medium">
            Flujo mensual proyectado (por cada $100 VN, USD)
          </div>
          <div className="overflow-x-auto">
            <table className="mono w-full text-[10px]">
              <thead className="text-[9px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-1 py-1 text-left">Mes</th>
                  <th className="px-1 py-1 text-right">Cupón</th>
                  <th className="px-1 py-1 text-right">Amort.</th>
                  <th className="px-1 py-1 text-right">Total bono</th>
                  <th className="px-1 py-1 text-right">UST 10Y</th>
                </tr>
              </thead>
              <tbody>
                {(ad.monthlyFlows as any[]).map((m: any, i: number) => (
                  <tr key={i} className="border-b border-border/20">
                    <td className="px-1 py-1">{m.mes}</td>
                    <td className="px-1 py-1 text-right">
                      {m.bonoCupon > 0 ? `${fmtNum(m.bonoCupon * 100, 2)}` : "\u2014"}
                    </td>
                    <td className="px-1 py-1 text-right">
                      {m.bonoAmortizacion > 0 ? `${fmtNum(m.bonoAmortizacion * 100, 2)}` : "\u2014"}
                    </td>
                    <td className="px-1 py-1 text-right font-medium">
                      {m.bonoTotal > 0 ? `${fmtNum(m.bonoTotal * 100, 2)}` : "\u2014"}
                    </td>
                    <td className="px-1 py-1 text-right">
                      {m.usTreasuryCupon > 0 ? `${fmtNum(m.usTreasuryCupon, 2)}` : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="text-[9px] font-medium border-t border-border/60">
                <tr>
                  <td className="px-1 py-1">Total período</td>
                  <td className="px-1 py-1 text-right">
                    {fmtNum(ad.totalCuponesPeriodo * 100, 2)}
                  </td>
                  <td className="px-1 py-1 text-right">
                    {fmtNum(ad.totalAmortizacionesPeriodo * 100, 2)}
                  </td>
                  <td className="px-1 py-1 text-right">{fmtNum(ad.flujoNetoPeriodo * 100, 2)}</td>
                  <td className="px-1 py-1 text-right">\u2014</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {ad.syntheticUsTreasuryFlows.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-medium">Flujo superpuesto (base USD 10.000 VN)</div>
          <div className="overflow-x-auto">
            <table className="mono w-full text-[10px]">
              <thead className="text-[9px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-1 py-1 text-left">Fecha</th>
                  <th className="px-1 py-1 text-right">Cupón {selTicker}</th>
                  <th className="px-1 py-1 text-right">Cupón UST 10Y</th>
                </tr>
              </thead>
              <tbody>
                {(ad.syntheticUsTreasuryFlows as any[]).slice(0, 12).map((f, i) => {
                  const bonoFlujo = ad.cashFlows?.[i];
                  return (
                    <tr key={i} className="border-b border-border/20">
                      <td className="px-1 py-1">{f.fecha}</td>
                      <td className="px-1 py-1 text-right">
                        {bonoFlujo ? `$${fmtNum(bonoFlujo.monto * 100)}` : "\u2014"}
                      </td>
                      <td className="px-1 py-1 text-right">${fmtNum(f.monto * 100)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// 
// COMPARADOR B — PF vs LECAP vs Inflación
// 

function ComparadorBView({ data }: { data: ComparadorResultado["data"] }) {
  const d = data as any;
  if (d.error) return <ErrorState error={d.error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Plazo Fijo vs LECAP vs Inflación</div>
          <TimestampBadge ts={d.timestamp} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border/30 bg-muted/5 p-2 text-center">
          <div className="text-[9px] text-muted-foreground">TNA PF Promedio</div>
          <div className="text-sm font-medium">{fmtPct(d.tasaPF_TNA)}</div>
        </div>
        <div className="rounded-lg border border-border/30 bg-muted/5 p-2 text-center">
          <div className="text-[9px] text-muted-foreground">TEM LECAP ({d.lecapTicker})</div>
          <div className="text-sm font-medium">{fmtPct(d.lecapTEM)}</div>
        </div>
        <div className="rounded-lg border border-border/30 bg-muted/5 p-2 text-center">
          <div className="text-[9px] text-muted-foreground">Inflación Mensual</div>
          <div className="text-sm font-medium">{fmtPct(d.inflacionMensual)}</div>
        </div>
      </div>

      <div>
        <div className="mb-1 text-[11px] font-medium">Retorno esperado por horizonte</div>
        <table className="mono w-full text-[10px]">
          <thead className="text-[9px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="px-2 py-1 text-left">Días</th>
              <th className="px-2 py-1 text-right">PF Nominal</th>
              <th className="px-2 py-1 text-right">LECAP Nominal</th>
              <th className="px-2 py-1 text-right">PF Real</th>
              <th className="px-2 py-1 text-right">LECAP Real</th>
              <th className="px-2 py-1 text-right">Infl. Proyectada</th>
            </tr>
          </thead>
          <tbody>
            {(d.horizontes as any[]).map((h: any) => (
              <tr key={h.dias} className="border-b border-border/20">
                <td className="px-2 py-1 font-medium">{h.dias}d</td>
                <td className="px-2 py-1 text-right">{fmtPct(h.pfNominal)}</td>
                <td className="px-2 py-1 text-right">{fmtPct(h.lecapNominal)}</td>
                <td
                  className={`px-2 py-1 text-right ${h.pfReal != null ? (h.pfReal >= 0 ? "text-green-400" : "text-red-400") : ""}`}
                >
                  {fmtPct(h.pfReal)}
                </td>
                <td
                  className={`px-2 py-1 text-right ${h.lecapReal != null ? (h.lecapReal >= 0 ? "text-green-400" : "text-red-400") : ""}`}
                >
                  {fmtPct(h.lecapReal)}
                </td>
                <td className="px-2 py-1 text-right">{fmtPct(h.inflacionProyectadaPeriodo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {d.ranking && d.ranking.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-medium">Ranking (retorno real a 30 días)</div>
          {(d.ranking as any[]).map((r: any, i: number) => (
            <div
              key={r.instrumento}
              className="flex items-center justify-between border-b border-border/20 py-1 text-[11px]"
            >
              <span>
                #{i + 1} {r.instrumento}
              </span>
              <span
                className={
                  r.retornoReal != null && r.retornoReal >= 0 ? "text-green-400" : "text-red-400"
                }
              >
                {fmtPct(r.retornoReal)}
              </span>
            </div>
          ))}
        </div>
      )}

      {d.horizontes && d.horizontes.length > 0 && (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={(d.horizontes as any[]).map((h: any) => ({
                name: `${h.dias}d`,
                PF: h.pfReal,
                LECAP: h.lecapReal,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="oklch(0.5 0 0)" />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="oklch(0.5 0 0)"
                tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "#141a28",
                  border: "1px solid oklch(0.3 0 0)",
                  fontSize: 11,
                }}
                formatter={(v: number) => `${(v * 100).toFixed(2)}%`}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="PF" fill="oklch(0.5 0.1 260)" name="Plazo Fijo" />
              <Bar dataKey="LECAP" fill="oklch(0.5 0.1 280)" name="LECAP" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// 
// COMPARADOR C — Bono CER vs Inflación (retorno real)
// 

function ComparadorCView({ data }: { data: ComparadorResultado["data"] }) {
  const d = data as any;
  const [busquedaCER, setBusquedaCER] = useState("");
  const [cerList, setCerList] = useState<any[]>([]);
  const fnCER = useServerFn(buscarCERIOL);

  if (d.error && cerList.length === 0) return <ErrorState error={d.error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Bono CER · {d.ticker} vs Inflación</div>
          <TimestampBadge ts={d.timestamp} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Buscar bono CER..."
            value={busquedaCER}
            onChange={(e) => setBusquedaCER(e.target.value)}
            className="mono w-full rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/50"
          />
          {busquedaCER && !d.error && (
            <div className="absolute top-full left-0 right-0 z-10 mt-0.5 max-h-36 overflow-y-auto rounded-md border border-border/60 bg-background shadow-lg">
              {(d.hardDollarAssets ?? [])
                .filter(
                  (a: any) =>
                    (a.ticker ?? "").toUpperCase().includes(busquedaCER.toUpperCase()) ||
                    (a.descripcion ?? "").toUpperCase().includes(busquedaCER.toUpperCase()),
                )
                .slice(0, 15)
                .map((a: any) => (
                  <button
                    key={a.ticker}
                    className="w-full px-2 py-1 text-left text-[10px] hover:bg-muted/20 text-muted-foreground"
                  >
                    <span className="font-medium">{a.ticker}</span>
                    <span className="ml-1">{a.descripcion?.substring(0, 50)}</span>
                  </button>
                ))}
              {(!d.hardDollarAssets || d.hardDollarAssets.length === 0) && (
                <div className="px-2 py-1 text-[10px] text-muted-foreground">
                  <button
                    onClick={async () => {
                      try {
                        const r = await fnCER({ data: {} });
                        setCerList(r);
                      } catch {}
                    }}
                    className="text-primary hover:underline"
                  >
                    Cargar desde IOL
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border/30 bg-muted/5 p-2 text-center">
          <div className="text-[9px] text-muted-foreground">TIR CER (TEA)</div>
          <div className="text-sm font-medium">{fmtPct(d.tirActual)}</div>
        </div>
        <div className="rounded-lg border border-border/30 bg-muted/5 p-2 text-center">
          <div className="text-[9px] text-muted-foreground">Inflación Interanual</div>
          <div className="text-sm font-medium">{fmtPct(d.inflacionInteranual)}</div>
        </div>
        <div className="rounded-lg border border-border/30 bg-muted/5 p-2 text-center">
          <div className="text-[9px] text-muted-foreground">Retorno Real</div>
          <div
            className={`text-sm font-medium ${d.retornoReal != null && d.retornoReal >= 0 ? "text-green-400" : "text-red-400"}`}
          >
            {fmtPct(d.retornoReal)}
          </div>
        </div>
      </div>

      {d.retornoRealAcumulado12m != null && (
        <div className="rounded-lg border border-border/30 bg-muted/5 p-2 text-center">
          <div className="text-[9px] text-muted-foreground">Retorno Real Acumulado 12m</div>
          <div
            className={`text-sm font-medium ${d.retornoRealAcumulado12m >= 0 ? "text-green-400" : "text-red-400"}`}
          >
            {fmtPct(d.retornoRealAcumulado12m)}
          </div>
        </div>
      )}

      {d.serieHistorica && d.serieHistorica.length > 0 && (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={d.serieHistorica}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0)" />
              <XAxis
                dataKey="fecha"
                tick={{ fontSize: 8 }}
                stroke="oklch(0.5 0 0)"
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 10 }}
                stroke="oklch(0.5 0 0)"
                tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10 }}
                stroke="oklch(0.5 0 0)"
                tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "#141a28",
                  border: "1px solid oklch(0.3 0 0)",
                  fontSize: 11,
                }}
                formatter={(v: number) => `${(v * 100).toFixed(2)}%`}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="tirCER"
                stroke="oklch(0.6 0.15 90)"
                name="TIR CER"
                dot={false}
                strokeWidth={2}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="inflacionInteranual"
                stroke="oklch(0.6 0.15 260)"
                name="Inflación I.A."
                dot={false}
                strokeWidth={2}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="retornoReal"
                fill="oklch(0.5 0.15 160)"
                fillOpacity={0.15}
                stroke="oklch(0.5 0.15 160)"
                name="Retorno Real"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// 
// COMPARADOR D — Breakeven CER vs Tasa Fija
// 

function ComparadorDView({ data }: { data: ComparadorResultado["data"] }) {
  const d = data as any;
  if (d.error) return <ErrorState error={d.error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">
            Breakeven CER · {d.cerTicker} vs {d.tasaFijaTicker}
          </div>
          <span className="text-[9px] text-muted-foreground">
            Match vencimiento: ±{d.diasMatch} días
          </span>
          <TimestampBadge ts={d.timestamp} />
        </div>
      </div>

      <table className="mono w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-2 py-2 text-left">Métrica</th>
            <th className="px-2 py-2 text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/30">
            <td className="px-2 py-2">
              <TooltippedLabel label="TIR CER (TEA)" tooltip="Tasa efectiva anual del bono CER" />
            </td>
            <td className="px-2 py-2 text-right">{fmtPct(d.tirCER)}</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="px-2 py-2">
              <TooltippedLabel
                label="TIR Tasa Fija (TEA)"
                tooltip="Tasa efectiva anual del instrumento tasa fija"
              />
            </td>
            <td className="px-2 py-2 text-right">{fmtPct(d.tirTasaFija)}</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="px-2 py-2">
              <TooltippedLabel label="Breakeven Inflación" tooltip={d.breakevenTooltip} />
            </td>
            <td className="px-2 py-2 text-right font-medium">{fmtPct(d.breakevenInflacion)}</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="px-2 py-2">Inflación Interanual Actual</td>
            <td className="px-2 py-2 text-right">{fmtPct(d.inflacionInteranualActual)}</td>
          </tr>
        </tbody>
      </table>

      {d.comparacionTexto && (
        <div
          className={`rounded-lg border p-3 text-[11px] ${
            d.comparacion === "breakeven-mayor"
              ? "border-yellow-900/40 bg-yellow-950/20 text-yellow-300"
              : "border-blue-900/40 bg-blue-950/20 text-blue-300"
          }`}
        >
          {d.comparacionTexto}
        </div>
      )}
    </div>
  );
}

// 
// COMPARADOR E — Dollar-Linked vs Hard Dollar vs CER
// 

function ComparadorEView({ data }: { data: ComparadorResultado["data"] }) {
  const d = data as any;
  if (d.error) return <ErrorState error={d.error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Cobertura Cambiaria · Escenarios</div>
          <TimestampBadge ts={d.timestamp} />
        </div>
      </div>

      <div className="rounded-lg border border-border/30 bg-muted/5 p-2 text-center">
        <div className="text-[9px] text-muted-foreground">TC MEP Actual</div>
        <div className="text-sm font-medium">${fmtNum(d.tcMepActual, 2)}</div>
      </div>

      {d.escenarios &&
        (d.escenarios as any[]).map((esc: any, i: number) => (
          <div key={i}>
            <div className="mb-1 text-[11px] font-medium">{esc.nombre}</div>
            <div className="text-[10px] text-muted-foreground mb-1">{esc.descripcion}</div>
            <table className="mono w-full text-[10px]">
              <thead className="text-[9px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-2 py-1 text-left">Instrumento</th>
                  <th className="px-2 py-1 text-right">Retorno USD</th>
                </tr>
              </thead>
              <tbody>
                {(esc.retornos as any[]).map((r: any) => (
                  <tr key={r.ticker} className="border-b border-border/20">
                    <td className="px-2 py-1">
                      {r.ticker} · {r.instrumento}
                    </td>
                    <td
                      className={`px-2 py-1 text-right ${r.retornoUSD != null && r.retornoUSD >= 0 ? "text-green-400" : "text-red-400"}`}
                    >
                      {fmtPct(r.retornoUSD)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}

// 
// COMPARADOR F — FCI vs Instrumento Directo
// 

function ComparadorFView({ data }: { data: ComparadorResultado["data"] }) {
  const d = data as any;
  if (d.error) return <ErrorState error={d.error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">FCI vs Instrumento Directo</div>
          <TimestampBadge ts={d.timestamp} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {d.fcismm && (
          <div className="rounded-lg border border-border/30 p-3">
            <div className="text-[11px] font-medium mb-2">Money Market</div>
            <table className="mono w-full text-[10px]">
              <tbody>
                <tr className="border-b border-border/20">
                  <td className="py-1">FCI</td>
                  <td className="py-1 text-right">{d.fcismm.fciTicker}</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="py-1">VCP</td>
                  <td className="py-1 text-right">${fmtNum(d.fcismm.vcpActual)}</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="py-1">Retorno Anualizado</td>
                  <td className="py-1 text-right">{fmtPct(d.fcismm.retornoAnualizado)}</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="py-1">Comparable</td>
                  <td className="py-1 text-right">{d.fcismm.instrumentoDirecto}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {d.fciRentaFija && (
          <div className="rounded-lg border border-border/30 p-3">
            <div className="text-[11px] font-medium mb-2">Renta Fija</div>
            <table className="mono w-full text-[10px]">
              <tbody>
                <tr className="border-b border-border/20">
                  <td className="py-1">FCI</td>
                  <td className="py-1 text-right">{d.fciRentaFija.fciTicker}</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="py-1">VCP</td>
                  <td className="py-1 text-right">${fmtNum(d.fciRentaFija.vcpActual)}</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="py-1">Retorno Anualizado</td>
                  <td className="py-1 text-right">{fmtPct(d.fciRentaFija.retornoAnualizado)}</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="py-1">Comparable</td>
                  <td className="py-1 text-right">{d.fciRentaFija.instrumentoDirecto}</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="py-1">Retorno Directo</td>
                  <td className="py-1 text-right">{fmtPct(d.fciRentaFija.retornoDirecto)}</td>
                </tr>
                <tr>
                  <td className="py-1">Costo implícito (proxy)</td>
                  <td className="py-1 text-right text-yellow-400">
                    {d.fciRentaFija.diferencia != null
                      ? fmtPct(d.fciRentaFija.diferencia)
                      : "\u2014"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// 
// COMPARADOR G — BADLAR/TAMAR vs Tasa Fija
// 

function ComparadorGView({ data }: { data: ComparadorResultado["data"] }) {
  const d = data as any;
  if (d.error) return <ErrorState error={d.error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">BADLAR/TAMAR vs Tasa Fija</div>
          <TimestampBadge ts={d.timestamp} />
        </div>
      </div>

      <table className="mono w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-2 py-2 text-left">Métrica</th>
            <th className="px-2 py-2 text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/30">
            <td className="px-2 py-2">BADLAR (TNA)</td>
            <td className="px-2 py-2 text-right">{fmtPct(d.badlarActual)}</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="px-2 py-2">TAMAR (TNA)</td>
            <td className="px-2 py-2 text-right">{fmtPct(d.tamarActual)}</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="px-2 py-2">
              <TooltippedLabel label="TIR ON Badlar" tooltip={d.onBadlarTicker ?? ""} />
            </td>
            <td className="px-2 py-2 text-right">{fmtPct(d.onBadlarTIR)}</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="px-2 py-2">
              <TooltippedLabel label="TIR ON Tasa Fija" tooltip={d.onTasaFijaTicker ?? ""} />
            </td>
            <td className="px-2 py-2 text-right">{fmtPct(d.onTasaFijaTIR)}</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="px-2 py-2">
              <TooltippedLabel label="Breakeven Tasa" tooltip={d.breakevenTooltip} />
            </td>
            <td className="px-2 py-2 text-right font-medium">{fmtPct(d.breakevenBadlar)}</td>
          </tr>
        </tbody>
      </table>

      {d.comparacionTexto && (
        <div
          className={`rounded-lg border p-3 text-[11px] ${
            d.comparacion === "flotante-conviene"
              ? "border-green-900/40 bg-green-950/20 text-green-300"
              : "border-orange-900/40 bg-orange-950/20 text-orange-300"
          }`}
        >
          {d.comparacionTexto}
        </div>
      )}
    </div>
  );
}

function TooltippedLabel({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <span className="group relative cursor-help border-b border-dotted border-muted-foreground/40">
      {label}
      <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-56 rounded border border-border/60 bg-surface p-1.5 text-[9px] font-normal text-muted-foreground shadow-lg z-20 pointer-events-none">
        {tooltip}
      </span>
    </span>
  );
}
