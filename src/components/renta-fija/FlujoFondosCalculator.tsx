// @ts-nocheck
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getFlujoFondos,
  type TickerCashFlow,
  type AggregatedMonth,
} from "@/lib/flujo-fondos.functions";

function fmtAr(v: number): string {
  return v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function FlujoFondosCalculator() {
  const [input, setInput] = useState("");
  const [nominales, setNominales] = useState<Record<string, string>>({});
  const [data, setData] = useState<{
    tickers: TickerCashFlow[];
    mensual: AggregatedMonth[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fn = useServerFn(getFlujoFondos);

  const tickers = input
    .split(/[\s,]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const updateNominal = (ticker: string, val: string) => {
    setNominales((prev) => ({ ...prev, [ticker]: val }));
  };

  async function calcular() {
    if (tickers.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const nominalMap: Record<string, number> = {};
      for (const t of tickers) {
        const v = parseFloat(nominales[t] ?? "100");
        nominalMap[t] = v > 0 ? v : 100;
      }
      const result = await fn({ data: { tickers, nominales: nominalMap } });
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al calcular flujo de fondos");
    } finally {
      setLoading(false);
    }
  }

  const meses = data?.mensual ?? [];
  const allTickers = data?.tickers ?? [];
  const totalCobrar = meses.reduce((s, m) => s + m.total, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/40 bg-background/30 p-4">
        <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-3">
          Calculadora de Flujo de Fondos
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col text-xs text-muted-foreground flex-1 min-w-[300px]">
            Tickers separados por coma (ONs, Bonos, LECAPs)
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="VSCXO, GD30D, AL30, TX26"
              className="bg-background border border-border/40 rounded px-3 py-2 text-sm font-mono text-foreground mt-1"
            />
          </label>
          <button
            onClick={calcular}
            disabled={loading || tickers.length === 0}
            className="bg-primary/20 border border-primary/40 text-primary rounded px-4 py-2 text-sm font-mono hover:bg-primary/30 disabled:opacity-40 transition-colors"
          >
            {loading ? "Calculando\u2026" : "Calcular flujo"}
          </button>
        </div>

        {tickers.length > 0 && (
          <div className="flex flex-wrap gap-3 mt-3">
            {tickers.map((t) => (
              <label key={t} className="flex items-center gap-2 text-xs text-muted-foreground">
                {t}:
                <input
                  type="number"
                  value={nominales[t] ?? "100"}
                  onChange={(e) => updateNominal(t, e.target.value)}
                  className="bg-background border border-border/40 rounded px-2 py-1 text-sm font-mono text-foreground w-24"
                  title="Valor nominal"
                />
                <span className="text-muted-foreground/60">VN</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-3">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Per-ticker metrics */}
          <div className="overflow-x-auto rounded-lg border border-border/40">
            <table className="w-full text-left font-mono text-[11px]">
              <thead className="border-b border-border/40 text-[9px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5">Ticker</th>
                  <th className="px-2 py-1.5">Nombre</th>
                  <th className="px-2 py-1.5 text-right">Precio</th>
                  <th className="px-2 py-1.5 text-right">TIR</th>
                  <th className="px-2 py-1.5 text-right">TEA</th>
                  <th className="px-2 py-1.5 text-right">Duration</th>
                  <th className="px-2 py-1.5 text-right">Flujos</th>
                </tr>
              </thead>
              <tbody>
                {allTickers.map((t) => (
                  <tr
                    key={t.ticker}
                    className="border-b border-border/20 last:border-0 hover:bg-muted/10"
                  >
                    <td className="px-2 py-1 font-semibold text-foreground">{t.ticker}</td>
                    <td className="px-2 py-1 text-muted-foreground text-[10px]">{t.nombre}</td>
                    <td className="px-2 py-1 text-right">
                      {t.price != null ? (
                        <span>
                          {fmtAr(t.price)}{" "}
                          <span className="text-muted-foreground/50 text-[9px]">
                            ({t.priceSource})
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">\u2014</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {t.tir != null ? `${(t.tir * 100).toFixed(2)}%` : "\u2014"}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {t.tea != null ? `${(t.tea * 100).toFixed(2)}%` : "\u2014"}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {t.duration != null ? t.duration.toFixed(2) : "\u2014"}
                    </td>
                    <td className="px-2 py-1 text-right font-semibold">{t.flows.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Monthly cashflow table */}
          <div className="overflow-x-auto rounded-lg border border-border/40">
            <table className="w-full text-left font-mono text-[11px]">
              <thead className="border-b border-border/40 text-[9px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5">Mes</th>
                  {allTickers.map((t) => (
                    <th key={t.ticker} className="px-2 py-1.5 text-right">
                      {t.ticker}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {meses.map((m) => (
                  <tr
                    key={m.mes}
                    className="border-b border-border/20 last:border-0 hover:bg-muted/10"
                  >
                    <td className="px-2 py-1 text-muted-foreground">{m.mes}</td>
                    {allTickers.map((t) => {
                      const val = m.porTicker.find((p) => p.ticker === t.ticker)?.monto ?? 0;
                      return (
                        <td
                          key={t.ticker}
                          className={`px-2 py-1 text-right ${val > 0 ? "text-emerald-400" : "text-muted-foreground/40"}`}
                        >
                          {val > 0 ? fmtAr(val) : "\u2014"}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-right font-semibold text-emerald-400">
                      {fmtAr(m.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border/40 text-[11px]">
                <tr className="font-semibold">
                  <td className="px-2 py-1.5 text-foreground">Total</td>
                  {allTickers.map((t) => {
                    const total = meses.reduce(
                      (s, m) => s + (m.porTicker.find((p) => p.ticker === t.ticker)?.monto ?? 0),
                      0,
                    );
                    return (
                      <td key={t.ticker} className="px-2 py-1.5 text-right text-emerald-400">
                        {fmtAr(total)}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-right text-emerald-400">{fmtAr(totalCobrar)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-[8px] text-muted-foreground/60 leading-relaxed">
            Flujo de fondos proyectado para{" "}
            {allTickers.map((t) => `${t.ticker} (VN ${nominales[t.ticker] ?? "100"})`).join(", ")}.
            Montos en moneda original de cada instrumento. Datos de flujos via Docta Capital API /
            bonos.json. No constituye recomendacion de inversion.
          </p>
        </>
      )}
    </div>
  );
}
