// @ts-nocheck
import { useState, useMemo } from "react";
import { getFlatTickerList } from "@/lib/universos";
import { covMatrix, portfolioVariance } from "@/lib/optimizer";

const RF_RATE = 0.03;

export interface DraftAsset {
  symbol: string;
  moneda: "ARS" | "USD";
  cantidad: number;
  pesoManual?: number;
  sector: string | null;
  sectorKey: string | null;
  industry: string | null;
  ultimoPrecio: number | null;
  beta: number | null;
  retornoEsperadoAnual: number | null;
  volatilidadAnual: number | null;
  dailyLogReturns: number[];
  longName: string | null;
  fetchStatus: "pending" | "ok" | "error";
  fetchError: string | null;
}

interface Props {
  assets: DraftAsset[];
  onUpdateCantidad: (symbol: string, cantidad: number) => void;
  onUpdatePesoManual: (symbol: string, peso: number) => void;
  onRemove: (symbol: string) => void;
  onAddTicker: (symbol: string, moneda: "ARS" | "USD") => void;
}

function f(v: number | null | undefined, dp = 2): string {
  if (v == null || !Number.isFinite(v)) return "\u2014";
  return v.toFixed(dp);
}
function fmtPct(v: number | null | undefined, dp = 2): string {
  if (v == null || !Number.isFinite(v)) return "\u2014";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(dp)}%`;
}
function scoreColor(s: number | null): string {
  if (s == null) return "text-muted-foreground";
  if (s >= 80) return "text-emerald-400";
  if (s >= 60) return "text-emerald-300/80";
  if (s >= 40) return "text-amber-400";
  return "text-red-400";
}

export function PortfolioDraftPanel({
  assets,
  onUpdateCantidad,
  onUpdatePesoManual,
  onRemove,
  onAddTicker,
}: Props) {
  const [tab, setTab] = useState<"composicion" | "sector" | "industria">("composicion");
  const [suggestCurrency, setSuggestCurrency] = useState<"ARS" | "USD">("USD");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());

  const allTickers = useMemo(() => getFlatTickerList(), []);
  const sectores = useMemo(
    () => [...new Set(allTickers.map((t) => t.sector))].sort(),
    [allTickers],
  );

  //  Computed values 
  const computed = useMemo(() => {
    const totalValorARS = assets
      .filter((a) => a.moneda === "ARS" && a.ultimoPrecio != null)
      .reduce((s, a) => s + a.cantidad * a.ultimoPrecio!, 0);
    const totalValorUSD = assets
      .filter((a) => a.moneda === "USD" && a.ultimoPrecio != null)
      .reduce((s, a) => s + a.cantidad * a.ultimoPrecio!, 0);

    const withValor = assets.filter((a) => a.ultimoPrecio != null && a.fetchStatus === "ok");
    const totalValor = withValor.reduce((s, a) => s + a.cantidad * a.ultimoPrecio!, 0);

    let portRet: number | null = null;
    let portVol: number | null = null;
    let portSharpe: number | null = null;

    if (totalValor > 0 && withValor.length > 0) {
      const weights = withValor.map((a) => (a.cantidad * a.ultimoPrecio!) / totalValor);
      portRet = withValor.reduce((s, a, i) => s + weights[i] * (a.retornoEsperadoAnual ?? 0), 0);

      const validLR = withValor.filter((a) => a.dailyLogReturns.length >= 20);
      if (validLR.length >= 2) {
        const n = Math.min(...validLR.map((a) => a.dailyLogReturns.length));
        const aligned = validLR.map((a) => a.dailyLogReturns.slice(-n));
        const T = aligned[0].length;
        const returns2d: number[][] = [];
        for (let t = 0; t < T; t++) {
          returns2d.push(aligned.map((r) => r[t]));
        }
        const cov = covMatrix(returns2d);
        const w = validLR.map((a) => {
          const val = a.cantidad * a.ultimoPrecio!;
          return totalValor > 0 ? val / totalValor : 0;
        });
        const pv = portfolioVariance(w, cov);
        portVol = pv > 0 ? Math.sqrt(pv) * Math.sqrt(252) : null;
      } else if (validLR.length === 1) {
        portVol = validLR[0].volatilidadAnual;
      }

      if (portRet != null && portVol != null && portVol > 0) {
        portSharpe = (portRet - RF_RATE) / portVol;
      }
    }

    return {
      totalValorARS,
      totalValorUSD,
      totalValor,
      portRet,
      portVol,
      portSharpe,
      n: assets.length,
    };
  }, [assets]);

  //  Sector grouping 
  const sectorGroups = useMemo(() => {
    const map = new Map<string, DraftAsset[]>();
    for (const a of assets) {
      if (a.fetchStatus !== "ok") continue;
      const sec = a.sector ?? "Sin clasificar";
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(a);
    }
    return Array.from(map.entries())
      .sort((a, b) => {
        const wa = a[1].reduce((s, i) => s + i.cantidad * (i.ultimoPrecio ?? 0), 0);
        const wb = b[1].reduce((s, i) => s + i.cantidad * (i.ultimoPrecio ?? 0), 0);
        return wb - wa;
      })
      .map(([sector, items]) => {
        const totalVal = items.reduce((s, i) => s + i.cantidad * (i.ultimoPrecio ?? 0), 0);
        const totalW = computed.totalValor > 0 ? totalVal / computed.totalValor : 0;
        const avgRet =
          items.reduce((s, i) => {
            const val = i.cantidad * (i.ultimoPrecio ?? 0);
            return s + val * (i.retornoEsperadoAnual ?? 0);
          }, 0) / (totalVal > 0 ? totalVal : 1);
        return { sector, items, totalWeight: totalW, avgRet };
      });
  }, [assets, computed.totalValor]);

  //  Industry grouping 
  const industryGroups = useMemo(() => {
    const map = new Map<string, DraftAsset[]>();
    for (const a of assets) {
      if (a.fetchStatus !== "ok") continue;
      const ind = a.industry ?? "Sin clasificar";
      const key = `${a.sector ?? "?"} :: ${ind}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return Array.from(map.entries())
      .sort((a, b) => {
        const wa = a[1].reduce((s, i) => s + i.cantidad * (i.ultimoPrecio ?? 0), 0);
        const wb = b[1].reduce((s, i) => s + i.cantidad * (i.ultimoPrecio ?? 0), 0);
        return wb - wa;
      })
      .map(([key, items]) => {
        const [sector, industry] = key.split(" :: ");
        const totalVal = items.reduce((s, i) => s + i.cantidad * (i.ultimoPrecio ?? 0), 0);
        const totalW = computed.totalValor > 0 ? totalVal / computed.totalValor : 0;
        const avgRet =
          items.reduce((s, i) => {
            const val = i.cantidad * (i.ultimoPrecio ?? 0);
            return s + val * (i.retornoEsperadoAnual ?? 0);
          }, 0) / (totalVal > 0 ? totalVal : 1);
        return { sector, industry, items, totalWeight: totalW, avgRet };
      });
  }, [assets, computed.totalValor]);

  const toggleSector = (s: string) => {
    setExpandedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  if (assets.length === 0) return null;

  return (
    <div className="glass p-4 space-y-4">
      {/*  KPI cards  */}
      <div className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded border border-border/40 bg-background/40 p-3">
          <p className="mono text-[13px] uppercase tracking-[0.18em] text-muted-foreground">
            Retorno esp.
          </p>
          <p
            className={`mt-1 font-mono text-sm font-bold ${computed.portRet != null && computed.portRet >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
            {fmtPct(computed.portRet, 1)}
          </p>
        </div>
        <div className="rounded border border-border/40 bg-background/40 p-3">
          <p className="mono text-[13px] uppercase tracking-[0.18em] text-muted-foreground">
            Volatilidad
          </p>
          <p className="mt-1 font-mono text-sm font-bold text-foreground">
            {computed.portVol != null ? `${(computed.portVol * 100).toFixed(1)}%` : "\u2014"}
            {assets.filter((a) => a.dailyLogReturns.length >= 20).length < 2 &&
              assets.length >= 1 && (
                <span className="ml-1 text-[12px] text-muted-foreground font-normal">
                  (individual)
                </span>
              )}
          </p>
        </div>
        <div className="rounded border border-border/40 bg-background/40 p-3">
          <p className="mono text-[13px] uppercase tracking-[0.18em] text-muted-foreground">
            Sharpe
          </p>
          <p
            className={`mt-1 font-mono text-sm font-bold ${computed.portSharpe != null ? (computed.portSharpe >= 1 ? "text-emerald-400" : computed.portSharpe >= 0 ? "text-amber-400" : "text-red-400") : ""}`}
          >
            {computed.portSharpe != null ? f(computed.portSharpe, 2) : "\u2014"}
          </p>
        </div>
        <div className="rounded border border-border/40 bg-background/40 p-3">
          <p className="mono text-[13px] uppercase tracking-[0.18em] text-muted-foreground">
            Valor USD
          </p>
          <p className="mt-1 font-mono text-sm font-bold text-foreground">
            ${computed.totalValorUSD.toLocaleString()}
          </p>
        </div>
        <div className="rounded border border-border/40 bg-background/40 p-3">
          <p className="mono text-[13px] uppercase tracking-[0.18em] text-muted-foreground">
            Valor ARS
          </p>
          <p className="mt-1 font-mono text-sm font-bold text-foreground">
            ${computed.totalValorARS.toLocaleString()}
          </p>
        </div>
      </div>

      {/*  Tabs  */}
      <div className="flex gap-1.5 border-b border-border/40 pb-2">
        {(["composicion", "sector", "industria"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`font-mono text-[13px] px-2.5 py-1 rounded-md border transition-colors ${tab === t ? "border-primary/60 bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground"}`}
          >
            {t === "composicion" ? "Composición" : t === "sector" ? "Por Sector" : "Por Industria"}
          </button>
        ))}
      </div>

      {/*  Tab content: Composición  */}
      {tab === "composicion" && (
        <div className="overflow-x-auto rounded border border-border/40">
          <table className="w-full text-left font-mono text-[14px]">
            <thead className="text-[13px] uppercase tracking-wider text-muted-foreground border-b border-border/40 bg-background/40">
              <tr>
                <th className="px-2 py-1.5">Ticker</th>
                <th className="px-2 py-1.5 text-center w-12">Mon</th>
                <th className="px-2 py-1.5 text-right w-20">Cantidad</th>
                <th className="px-2 py-1.5 text-right w-16">Precio</th>
                <th className="px-2 py-1.5 text-right w-16">Peso %</th>
                <th className="px-2 py-1.5 text-right w-16">Ret.Esp</th>
                <th className="px-2 py-1.5 text-right w-16">Vol</th>
                <th className="px-2 py-1.5 text-right w-14">Beta</th>
                <th className="px-2 py-1.5">Sector</th>
                <th className="px-2 py-1.5">Industria</th>
                <th className="px-2 py-1.5 text-center w-10"></th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => {
                const valor = a.ultimoPrecio != null ? a.cantidad * a.ultimoPrecio : 0;
                const peso = computed.totalValor > 0 ? valor / computed.totalValor : 0;
                return (
                  <tr
                    key={a.symbol}
                    className="border-b border-border/20 last:border-0 hover:bg-muted/10"
                  >
                    <td className="px-2 py-1 font-semibold text-foreground">
                      {a.symbol}
                      {a.fetchStatus === "pending" && (
                        <span className="ml-1 inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                      )}
                      {a.fetchStatus === "error" && (
                        <span
                          className="ml-1 text-[12px] text-red-400"
                          title={a.fetchError ?? ""}
                        ></span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-center text-[13px] text-muted-foreground">
                      {a.moneda}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={a.cantidad}
                        onChange={(e) =>
                          onUpdateCantidad(a.symbol, Math.max(0, parseInt(e.target.value) || 0))
                        }
                        className="w-16 text-right bg-transparent border-b border-border/30 text-[13px] font-mono text-foreground outline-none focus:border-primary/60"
                      />
                    </td>
                    <td className="px-2 py-1 text-right text-muted-foreground">
                      {a.ultimoPrecio != null ? `$${a.ultimoPrecio.toFixed(2)}` : "\u2014"}
                    </td>
                    <td className="px-2 py-1 text-right font-semibold text-foreground">
                      {(peso * 100).toFixed(1)}%
                    </td>
                    <td
                      className={`px-2 py-1 text-right ${a.retornoEsperadoAnual != null ? (a.retornoEsperadoAnual >= 0 ? "text-emerald-400" : "text-red-400") : ""}`}
                    >
                      {a.retornoEsperadoAnual != null
                        ? fmtPct(a.retornoEsperadoAnual, 1)
                        : "\u2014"}
                    </td>
                    <td className="px-2 py-1 text-right text-muted-foreground">
                      {a.volatilidadAnual != null
                        ? `${(a.volatilidadAnual * 100).toFixed(1)}%`
                        : "\u2014"}
                    </td>
                    <td className="px-2 py-1 text-right text-muted-foreground">
                      {a.beta != null ? f(a.beta, 2) : "\u2014"}
                    </td>
                    <td className="px-2 py-1 text-[13px] text-muted-foreground">
                      {a.sector ?? "\u2014"}
                    </td>
                    <td className="px-2 py-1 text-[13px] text-muted-foreground">
                      {a.industry ?? "\u2014"}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button
                        onClick={() => onRemove(a.symbol)}
                        className="text-[13px] text-red-400 hover:text-red-300"
                      >
                        
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {computed.totalValor > 0 && (
              <tfoot className="border-t border-border/40 bg-muted/10">
                <tr>
                  <td colSpan={2} className="px-2 py-1.5 text-[13px] font-bold text-foreground">
                    TOTAL
                  </td>
                  <td className="px-2 py-1.5 text-right text-[13px] font-bold">{computed.n}</td>
                  <td className="px-2 py-1.5"></td>
                  <td className="px-2 py-1.5 text-right text-[13px] font-bold text-foreground">
                    100%
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right text-[13px] font-bold ${computed.portRet != null && computed.portRet >= 0 ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {fmtPct(computed.portRet, 1)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-[13px] font-bold">
                    {computed.portVol != null
                      ? `${(computed.portVol * 100).toFixed(1)}%`
                      : "\u2014"}
                  </td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/*  Tab content: Por Sector  */}
      {tab === "sector" && (
        <div className="overflow-x-auto rounded border border-border/40">
          <table className="w-full text-left font-mono text-[14px]">
            <thead className="text-[13px] uppercase tracking-wider text-muted-foreground border-b border-border/40 bg-background/40">
              <tr>
                <th className="px-2 py-1.5">Sector</th>
                <th className="px-2 py-1.5 text-right">Peso Total</th>
                <th className="px-2 py-1.5 text-right">Retorno Ponderado</th>
                <th className="px-2 py-1.5 text-right">Cant. Activos</th>
                <th className="px-2 py-1.5">Tickers</th>
              </tr>
            </thead>
            <tbody>
              {sectorGroups.map((sg) => (
                <tr key={sg.sector} className="border-b border-border/20 hover:bg-muted/10">
                  <td className="px-2 py-1.5 text-[13px] font-semibold text-foreground">
                    {sg.sector}
                  </td>
                  <td className="px-2 py-1.5 text-right text-[13px] font-semibold">
                    {(sg.totalWeight * 100).toFixed(1)}%
                  </td>
                  <td className="px-2 py-1.5 text-right text-[13px] text-emerald-400">
                    {fmtPct(sg.avgRet, 1)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-[13px]">{sg.items.length}</td>
                  <td className="px-2 py-1.5 text-[13px] text-muted-foreground">
                    {sg.items.map((i) => i.symbol).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/*  Tab content: Por Industria  */}
      {tab === "industria" && (
        <div className="overflow-x-auto rounded border border-border/40">
          <table className="w-full text-left font-mono text-[14px]">
            <thead className="text-[13px] uppercase tracking-wider text-muted-foreground border-b border-border/40 bg-background/40">
              <tr>
                <th className="px-2 py-1.5">Sector</th>
                <th className="px-2 py-1.5">Industria</th>
                <th className="px-2 py-1.5 text-right">Peso Total</th>
                <th className="px-2 py-1.5 text-right">Retorno Ponderado</th>
                <th className="px-2 py-1.5 text-right">Cant. Activos</th>
                <th className="px-2 py-1.5">Tickers</th>
              </tr>
            </thead>
            <tbody>
              {industryGroups.map((ig) => (
                <tr
                  key={`${ig.sector}::${ig.industry}`}
                  className="border-b border-border/20 hover:bg-muted/10"
                >
                  <td className="px-2 py-1.5 text-[13px] text-muted-foreground">{ig.sector}</td>
                  <td className="px-2 py-1.5 text-[13px] font-semibold text-foreground">
                    {ig.industry}
                  </td>
                  <td className="px-2 py-1.5 text-right text-[13px] font-semibold">
                    {(ig.totalWeight * 100).toFixed(1)}%
                  </td>
                  <td className="px-2 py-1.5 text-right text-[13px] text-emerald-400">
                    {fmtPct(ig.avgRet, 1)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-[13px]">{ig.items.length}</td>
                  <td className="px-2 py-1.5 text-[13px] text-muted-foreground">
                    {ig.items.map((i) => i.symbol).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/*  Suggestion panel  */}
      <details
        open={suggestOpen}
        onToggle={(e) => setSuggestOpen((e.target as HTMLDetailsElement).open)}
        className="rounded border border-border/40 bg-background/60"
      >
        <summary className="px-3 py-2 text-[13px] font-mono text-muted-foreground cursor-pointer hover:text-foreground select-none">
          Sugerir activos por sector/industria
        </summary>
        <div className="px-3 pb-3 space-y-1 max-h-64 overflow-y-auto">
          <div className="flex gap-2 items-center mb-2">
            <span className="text-[13px] text-muted-foreground">Moneda:</span>
            {(["USD", "ARS"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setSuggestCurrency(c)}
                className={`text-[13px] px-2 py-0.5 rounded border ${suggestCurrency === c ? "border-primary/60 bg-primary/10 text-primary" : "border-border/40 text-muted-foreground"}`}
              >
                {c}
              </button>
            ))}
          </div>
          {sectores.map((sector) => {
            const isOpen = expandedSectors.has(sector);
            const tickersInSector = allTickers.filter(
              (t) => t.sector === sector && !assets.some((a) => a.symbol === t.ticker),
            );
            const industrias = [...new Set(tickersInSector.map((t) => t.industria))].sort();
            if (tickersInSector.length === 0) return null;
            return (
              <div key={sector}>
                <button
                  onClick={() => toggleSector(sector)}
                  className="w-full text-left text-[13px] font-mono text-foreground hover:text-primary py-1 px-1 rounded hover:bg-muted/10"
                >
                  {isOpen ? "" : ""} {sector} ({tickersInSector.length})
                </button>
                {isOpen && (
                  <div className="ml-3 space-y-1">
                    {industrias.map((ind) => {
                      const tks = tickersInSector.filter((t) => t.industria === ind);
                      return (
                        <div key={ind} className="border-l border-border/20 pl-2">
                          <p className="text-[12px] text-muted-foreground uppercase tracking-wider mt-1">
                            {ind}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {tks.map((t) => (
                              <button
                                key={t.ticker}
                                onClick={() => onAddTicker(t.ticker, suggestCurrency)}
                                className="text-[13px] font-mono px-1.5 py-0.5 rounded border border-border/30 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
                                title={t.nombre}
                              >
                                {t.ticker}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}
