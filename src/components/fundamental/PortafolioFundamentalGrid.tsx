export interface PortafolioFundamentalItem {
  ticker: string;
  peso: number;
  fundScore: number;
  recomendacionConsenso?: string | null;
  semaforoRec?: string | null;
  percentilRango: number | null;
  sector: string | null;
  companyName: string | null;
  currentPrice: number | null;
  marketCapM: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  evToEbitda: number | null;
  returnOnEquity: number | null;
  profitMargin: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  debtToEquityRaw: number | null;
  fcfYield: number | null;
  upsidePct: number | null;
  beta: number | null;
  recommendationMean: number | null;
  numberOfAnalystOpinions: number | null;
  dividendYield: number | null;
  pricePercentile10y: number | null;
  accion: string | null;
  plazo: string | null;
  noAnalizado?: boolean;
  motivoExclusion?: string;
}

interface Props {
  items: PortafolioFundamentalItem[];
  totalValorizado: number;
  scorePonderado: number;
  excludedCount: number;
  onSelectTicker: (ticker: string) => void;
}

function interpretarScore(score: number): string {
  if (score > 70)
    return "Tu cartera está compuesta mayormente por empresas con fundamentos sólidos.";
  if (score >= 40)
    return "Tu cartera tiene fundamentos mixtos — algunas posiciones son más sólidas que otras.";
  return "Varias posiciones de tu cartera muestran fundamentos débiles según los datos disponibles.";
}

function f(v: number | null, dec = 2): string {
  if (v === null) return "\u2014";
  return v.toFixed(dec);
}

function fPct(v: number | null): string {
  if (v === null) return "\u2014";
  const val = v * 100;
  return `${val >= 0 ? "+" : ""}${val.toFixed(1)}%`;
}

function fMarketCap(mM: number | null): string {
  if (mM === null) return "\u2014";
  if (mM >= 1_000_000) return `USD ${(mM / 1_000_000).toFixed(2)} T`;
  if (mM >= 1_000) return `USD ${(mM / 1_000).toFixed(2)} B`;
  return `USD ${mM.toFixed(0)} M`;
}

function scoreColor(s: number): string {
  if (s >= 65) return "text-emerald-400";
  if (s >= 45) return "text-amber-400";
  return "text-red-400";
}

function scoreBg(s: number): string {
  if (s >= 65) return "bg-emerald-500";
  if (s >= 45) return "bg-amber-500";
  return "bg-red-500";
}

function recBadge(rec: string | null | undefined): { label: string; cls: string } | null {
  if (!rec) return null;
  const r = rec.toLowerCase();
  if (r.includes("buy") || r.includes("compra") || r.includes("acumular"))
    return { label: "BUY", cls: "text-emerald-400 border-emerald-800/40 bg-emerald-950/30" };
  if (r === "hold" || r === "mantener")
    return { label: "HOLD", cls: "text-amber-400 border-amber-800/40 bg-amber-950/30" };
  if (r.includes("sell") || r.includes("venta") || r.includes("reduccion"))
    return { label: "SELL", cls: "text-red-400 border-red-800/40 bg-red-950/30" };
  return null;
}

export function PortafolioFundamentalGrid({
  items,
  totalValorizado,
  scorePonderado,
  excludedCount,
  onSelectTicker,
}: Props) {
  const sorted = [...items].sort((a, b) => b.peso - a.peso).filter((i) => !i.noAnalizado);
  const hasBadgeRojo = items.some((i) => !i.noAnalizado && i.fundScore < 40);
  const contextualMessage = hasBadgeRojo
    ? `Tenés ${items.filter((i) => !i.noAnalizado && i.fundScore < 40).length} posiciones con fundamentos débiles en tu cartera — ¿revisamos juntos si conviene rotar?`
    : scorePonderado > 70
      ? "Tu cartera está bien posicionada — ¿charlamos sobre próximos pasos o nuevas oportunidades?"
      : null;

  return (
    <div className="space-y-4">
      {excludedCount > 0 && (
        <div className="rounded-md border border-border/40 bg-background/40/60 px-4 py-2.5 text-[10px] text-muted-foreground">
          {excludedCount} posición{excludedCount > 1 ? "es" : ""} de renta fija/liquidez no incluida
          {excludedCount > 1 ? "s" : ""} en el análisis fundamental — podés verlas en la sección
          Renta Fija.
        </div>
      )}

      <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
        <p className="text-[10px] font-semibold text-foreground">Tu cartera fundamental</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-mono text-lg font-bold text-foreground">{scorePonderado}/100</span>
          <span className="text-[10px] text-muted-foreground">score ponderado</span>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
          {interpretarScore(scorePonderado)}
        </p>
      </div>

      {/* DataFrame comparativo */}
      <div className="overflow-x-auto rounded-lg border border-border/40">
        <table className="w-full text-left font-mono text-[11px]">
          <thead className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
            <tr>
              <th className="px-2 py-1.5">Ticker</th>
              <th className="px-2 py-1.5">Sector</th>
              <th className="px-2 py-1.5 text-right">Peso</th>
              <th className="px-2 py-1.5 text-right">Score</th>
              <th className="px-2 py-1.5 text-center">Rec</th>
              <th className="px-2 py-1.5 text-right">P/E</th>
              <th className="px-2 py-1.5 text-right">ROE</th>
              <th className="px-2 py-1.5 text-right">Margen Neto</th>
              <th className="px-2 py-1.5 text-right">Crec. Ing.</th>
              <th className="px-2 py-1.5 text-right">FCF Yield</th>
              <th className="px-2 py-1.5 text-right">Upside</th>
              <th className="px-2 py-1.5 text-right">D/E</th>
              <th className="px-2 py-1.5 text-right">Beta</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => {
              const rec = recBadge(item.semaforoRec ?? item.recomendacionConsenso);
              return (
                <tr
                  key={item.ticker}
                  onClick={() => onSelectTicker(item.ticker)}
                  className="border-b border-border/20 last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
                >
                  <td className="px-2 py-1.5">
                    <span className="font-semibold text-foreground">{item.ticker}</span>
                    {item.companyName && (
                      <span className="ml-1 text-[9px] text-muted-foreground">
                        ({item.companyName})
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-[10px] text-muted-foreground">
                    {item.sector ?? "\u2014"}
                  </td>
                  <td className="px-2 py-1.5 text-right">{(item.peso * 100).toFixed(1)}%</td>
                  <td className="px-2 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="w-12 h-1 rounded-full bg-border/30">
                        <div
                          className={`h-1 rounded-full ${scoreBg(item.fundScore)}`}
                          style={{ width: `${item.fundScore}%` }}
                        />
                      </div>
                      <span className={`text-[10px] font-bold ${scoreColor(item.fundScore)}`}>
                        {item.fundScore}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {rec ? (
                      <span
                        className={`inline-block rounded border px-1.5 py-0.5 text-[9px] ${rec.cls}`}
                      >
                        {rec.label}
                      </span>
                    ) : (
                      "\u2014"
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">
                    {item.trailingPE !== null ? `${f(item.trailingPE, 1)}x` : "\u2014"}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right ${item.returnOnEquity !== null ? (item.returnOnEquity * 100 >= 12 ? "text-emerald-400" : "text-amber-400") : ""}`}
                  >
                    {item.returnOnEquity !== null ? fPct(item.returnOnEquity) : "\u2014"}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right ${item.profitMargin !== null ? (item.profitMargin * 100 >= 10 ? "text-emerald-400" : item.profitMargin >= 0 ? "text-amber-400" : "text-red-400") : ""}`}
                  >
                    {item.profitMargin !== null ? fPct(item.profitMargin) : "\u2014"}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right ${item.revenueGrowth !== null ? (item.revenueGrowth >= 0 ? "text-emerald-400" : "text-red-400") : ""}`}
                  >
                    {item.revenueGrowth !== null ? fPct(item.revenueGrowth) : "\u2014"}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right ${item.fcfYield !== null ? (item.fcfYield * 100 >= 3 ? "text-emerald-400" : item.fcfYield >= 0 ? "text-amber-400" : "text-red-400") : ""}`}
                  >
                    {item.fcfYield !== null ? fPct(item.fcfYield) : "\u2014"}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right ${item.upsidePct !== null ? (item.upsidePct >= 10 ? "text-emerald-400" : item.upsidePct >= 0 ? "text-amber-400" : "text-red-400") : ""}`}
                  >
                    {item.upsidePct !== null
                      ? `${item.upsidePct >= 0 ? "+" : ""}${item.upsidePct.toFixed(1)}%`
                      : "\u2014"}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right ${item.debtToEquityRaw !== null ? (item.debtToEquityRaw < 100 ? "text-emerald-400" : item.debtToEquityRaw < 200 ? "text-amber-400" : "text-red-400") : ""}`}
                  >
                    {item.debtToEquityRaw !== null
                      ? `${(item.debtToEquityRaw / 100).toFixed(2)}x`
                      : "\u2014"}
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">
                    {item.beta !== null ? f(item.beta, 2) : "\u2014"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="p-2 text-[8px] text-muted-foreground border-t border-border/20">
          Datos de Yahoo Finance. Hacé clic en cualquier fila para ver el análisis completo del
          ticker.
        </div>
      </div>

      {items.some((i) => i.noAnalizado) && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-[10px] text-amber-400">
          {items.filter((i) => i.noAnalizado).length} activo(s) sin datos fundamentales disponibles.
        </div>
      )}

      {contextualMessage && <div className="hidden" data-contextual-message={contextualMessage} />}
    </div>
  );
}
