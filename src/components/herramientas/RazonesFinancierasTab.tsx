// @ts-nocheck
import React, { useState, useEffect, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { fetchFundamentalAF, fetchHistoricoDetallado } from "@/lib/fundamental-af.functions";
import { calcularRazonesFinancieras } from "@/lib/razones-financieras.functions";
import type { RazonesFinancierasResult, RazonesPeriodo } from "@/lib/razones-financieras.functions";

// Formatters
function f(v: number | null, dec = 2): string {
  if (v === null) return "--";
  return v.toFixed(dec);
}

function fPct(v: number | null, alreadyPct = false): string {
  if (v === null) return "--";
  const val = alreadyPct ? v : v * 100;
  return `${val.toFixed(1)}%`;
}

function fMoney(v: number | null): string {
  if (v === null) return "--";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `USD ${(v / 1e12).toFixed(2)} T`;
  if (abs >= 1e9) return `USD ${(v / 1e9).toFixed(2)} B`;
  if (abs >= 1e6) return `USD ${(v / 1e6).toFixed(2)} M`;
  return `USD ${v.toFixed(0)}`;
}

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <tr className="border-b border-border/10 last:border-0">
      <td className="py-1 pr-4 text-[10px] text-muted-foreground whitespace-nowrap">{label}</td>
      <td className={`py-1 text-[10px] font-mono text-right ${color ?? "text-foreground"}`}>
        {value}
      </td>
    </tr>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <tr>
      <td
        colSpan={2}
        className="pt-3 pb-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60"
      >
        {label}
      </td>
    </tr>
  );
}

function RatioTable({ periodo }: { periodo: RazonesPeriodo }) {
  const l = periodo.liquidez;
  const a = periodo.actividad;
  const e = periodo.endeudamiento;
  const r = periodo.rentabilidad;
  const m = periodo.mercado;
  const d = periodo.dupont;

  return (
    <table className="w-full">
      <tbody>
        <SectionHeader label="1 · Liquidez" />
        <MetricRow label="Razón circulante" value={f(l.razonCirculante)} />
        <MetricRow label="Razón rápida (ácido)" value={f(l.razonRapida)} />
        <MetricRow label="Capital de trabajo" value={fMoney(l.capitalTrabajo)} />
        <SectionHeader label="2 · Administración de activos" />
        <MetricRow label="Rotación de inventarios (x)" value={`${f(a.rotacionInventarios)}x`} />
        <MetricRow label="DSO (días)" value={f(a.dso, 0)} />
        <MetricRow label="Rotación de activos fijos (x)" value={`${f(a.rotacionActivosFijos)}x`} />
        <MetricRow
          label="Rotación de activos totales (x)"
          value={`${f(a.rotacionActivosTotales)}x`}
        />
        <SectionHeader label="3 · Endeudamiento" />
        <MetricRow label="Razón de deuda" value={fPct(e.razonDeuda)} />
        <MetricRow label="Deuda / Patrimonio (x)" value={`${f(e.deudaPatrimonio)}x`} />
        <MetricRow label="Cobertura de intereses (TIE)" value={`${f(e.tie)}x`} />
        <SectionHeader label="4 · Rentabilidad" />
        <MetricRow label="Margen de utilidad" value={fPct(r.margenUtilidad)} />
        <MetricRow label="BEP (EBIT/Activos)" value={fPct(r.bep)} />
        <MetricRow label="ROA" value={fPct(r.roa)} />
        <MetricRow label="ROE" value={fPct(r.roe, true)} />
        <SectionHeader label="5 · Valor de mercado" />
        <MetricRow label="P/U" value={`${f(m.pe)}x`} />
        <MetricRow label="P/VL" value={`${f(m.priceToBook)}x`} />
        <MetricRow label="Valor libros / acción" value={fMoney(m.libroPorAccion)} />
        <SectionHeader label="· Descomposición DuPont" />
        <MetricRow label="Margen neto" value={fPct(d.margenNeto)} />
        <MetricRow label="Rotación activos (x)" value={`${f(d.rotacionActivos)}x`} />
        <MetricRow
          label="Multiplicador patrimonio (x)"
          value={`${f(d.multiplicadorPatrimonio)}x`}
        />
        <MetricRow label="ROA DuPont" value={fPct(d.roaDupont, true)} />
        <MetricRow label="ROE DuPont" value={`${f(d.roeDupont)}%`} color="text-emerald-400" />
      </tbody>
    </table>
  );
}

function InterpList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="text-[9px] leading-relaxed text-muted-foreground flex gap-1.5">
          <span className="text-emerald-400/70 shrink-0">•</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export function RazonesFinancierasTab({
  tickerFromSearch,
}: {
  tickerFromSearch?: string;
} = {}) {
  const [ticker, setTicker] = useState(tickerFromSearch ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RazonesFinancierasResult | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const histFn = useServerFn(fetchHistoricoDetallado);

  const run = useCallback(
    async (symbol: string) => {
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const res = await fetchFundamentalAF({ data: { symbol } });
        if (res.error) {
          setError(res.error);
          return;
        }
        const hist = await histFn({ data: { symbol, granularidad: "anual" } });
        setData(calcularRazonesFinancieras(res, hist.periods));
        setSelectedIdx(0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al consultar Yahoo Finance");
      } finally {
        setLoading(false);
      }
    },
    [histFn],
  );

  useEffect(() => {
    if (tickerFromSearch) {
      run(tickerFromSearch.toUpperCase());
    }
  }, [tickerFromSearch, run]);

  const handleSearch = () => {
    const sym = ticker.trim().toUpperCase();
    if (!sym) return;
    run(sym);
  };

  const selected =
    data && selectedIdx >= 0 && data.periods[selectedIdx] ? data.periods[selectedIdx] : null;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
        <p className="text-[10px] text-muted-foreground mb-2">
          Razones financieras según Weston &amp; Brigham (5 categorías) + descomposición DuPont a
          partir de los estados financieros anuales de Yahoo Finance.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="AAPL, MSFT, GGAL.BA"
            maxLength={20}
            className="flex-1 rounded-md border border-border/40 bg-background/20 px-3 py-2 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-emerald-500/50"
          />
          <button
            onClick={handleSearch}
            disabled={loading || !ticker.trim()}
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[11px] text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Consultando..." : "Analizar razones"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3 text-[10px] text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-md border border-border/40 bg-background/40/60 px-4 py-6 text-center text-[10px] text-muted-foreground">
          Consultando estados financieros y calculando razones...
        </div>
      )}

      {data && !loading && (
        <div className="space-y-4">
          {data.periods.length > 1 && (
            <div className="rounded-md border border-border/40 bg-background/40/60 p-3">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
                Período
              </p>
              <select
                value={selectedIdx}
                onChange={(e) => setSelectedIdx(Number(e.target.value))}
                className="w-full rounded-md border border-border/40 bg-background/20 px-2 py-1.5 text-[11px] font-mono text-foreground outline-none focus:border-emerald-500/50"
              >
                {data.periods.map((p, i) => (
                  <option key={p.label + i} value={i}>
                    {p.label} — {p.endDate}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selected && (
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-3">
                Razones del periodo {selected.label} ({selected.endDate})
              </p>
              <RatioTable periodo={selected} />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
                Liquidez · interpretación
              </p>
              <InterpList items={data.interpretaciones.liquidez} />
            </div>
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
                Actividad · interpretación
              </p>
              <InterpList items={data.interpretaciones.actividad} />
            </div>
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
                Endeudamiento · interpretación
              </p>
              <InterpList items={data.interpretaciones.endeudamiento} />
            </div>
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
                Rentabilidad + DuPont · interpretación
              </p>
              <InterpList items={data.interpretaciones.rentabilidad} />
            </div>
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
                Valor de mercado · interpretación
              </p>
              <InterpList items={data.interpretaciones.mercado} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
