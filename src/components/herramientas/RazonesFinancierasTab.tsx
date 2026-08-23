// @ts-nocheck
import React, { useState, useEffect, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { fetchFundamentalAF, fetchHistoricoDetallado } from "@/lib/fundamental-af.functions";
import { calcularRazonesFinancieras, calcularRazonesReales } from "@/lib/razones-financieras.functions";
import type { RazonesFinancierasResult, RazonesPeriodo, IndiceInflacion } from "@/lib/razones-financieras.functions";

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
      <td className="py-1 pr-4 text-[13px] text-muted-foreground whitespace-nowrap">{label}</td>
      <td className={`py-1 text-[13px] font-mono text-right ${color ?? "text-foreground"}`}>
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
        className="pt-3 pb-1 text-[13px] font-semibold uppercase tracking-widest text-muted-foreground/60"
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
        <li key={i} className="text-[13px] leading-relaxed text-muted-foreground flex gap-1.5">
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
  const [dataReal, setDataReal] = useState<RazonesFinancierasResult | null>(null);
  const [factorReal, setFactorReal] = useState<number | null>(null);
  const [verReal, setVerReal] = useState(false);
  const [serieIPC, setSerieIPC] = useState<IndiceInflacion[] | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const histFn = useServerFn(fetchHistoricoDetallado);

  // Cargar serie IPC una vez (ArgentinaDatos) para ajuste a moneda constante — Fowler Newton
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await fetch("https://api.argentinadatos.com/v1/finanzas/indices/inflacion");
        if (!r.ok) return;
        const j = (await r.json()) as Array<{ fecha?: string; valor?: number }>;
        if (!Array.isArray(j) || !j.length) return;
        // Construir índice acumulado (base 100) desde valor mensual %
        let idx = 100;
        const serie: IndiceInflacion[] = [];
        for (const row of j) {
          const v = row.valor;
          const f = row.fecha;
          if (typeof v !== "number" || !f) continue;
          idx = idx * (1 + v / 100);
          serie.push({ fecha: String(f).slice(0, 10), indice: idx });
        }
        if (!cancel) setSerieIPC(serie);
      } catch {}
    })();
    return () => { cancel = true; };
  }, []);

  const run = useCallback(
    async (symbol: string) => {
      setLoading(true);
      setError(null);
      setData(null);
      setDataReal(null);
      setFactorReal(null);
      try {
        const res = await fetchFundamentalAF({ data: { symbol } });
        if (res.error) {
          setError(res.error);
          return;
        }
        const hist = await histFn({ data: { symbol, granularidad: "anual" } });
        const nominal = calcularRazonesFinancieras(res, hist.periods);
        setData(nominal);
        // Si hay serie IPC y el activo es ARS (.BA) o el usuario activa moneda constante, pre-calcular real
        if (serieIPC && serieIPC.length && hist.periods.length) {
          const { real, factorUsado } = calcularRazonesReales(res, hist.periods, serieIPC);
          if (real) { setDataReal(real); setFactorReal(factorUsado); }
        }
        setSelectedIdx(0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al consultar Yahoo Finance");
      } finally {
        setLoading(false);
      }
    },
    [histFn, serieIPC],
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

  const activo = verReal && dataReal ? dataReal : data;
  const selected =
    activo && selectedIdx >= 0 && activo.periods[selectedIdx] ? activo.periods[selectedIdx] : null;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
        <p className="text-[13px] text-muted-foreground mb-2">
          Razones financieras según Weston &amp; Brigham (5 categorías) + descomposición DuPont a
          partir de los estados financieros anuales de Yahoo Finance (22 módulos quoteSummary normalizados).{" "}
          <span className="text-emerald-400/60">Fowler Newton/Biondi: se ofrece vista en moneda constante (ajuste IPC ArgentinaDatos) para comparar períodos en términos reales.</span>
        </p>
        {serieIPC && dataReal && factorReal && (
          <div className="flex items-center gap-2 mb-2">
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <input type="checkbox" checked={verReal} onChange={(e) => setVerReal(e.target.checked)} className="rounded" />
              Ver en moneda constante (ajuste inflación)
            </label>
            <span className="text-[11px] text-muted-foreground/60">factor {factorReal.toFixed(3)}x · IPC acumulado desde el período más reciente</span>
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="AAPL, MSFT, GGAL.BA"
            maxLength={20}
            className="flex-1 rounded-md border border-border/40 bg-background/20 px-3 py-2 text-[14px] font-mono text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-emerald-500/50"
          />
          <button
            onClick={handleSearch}
            disabled={loading || !ticker.trim()}
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[14px] text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Consultando..." : "Analizar razones"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3 text-[13px] text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-md border border-border/40 bg-background/40/60 px-4 py-6 text-center text-[13px] text-muted-foreground">
          Consultando estados financieros y calculando razones...
        </div>
      )}

      {activo && !loading && (
        <div className="space-y-4">
          {activo.periods.length > 1 && (
            <div className="rounded-md border border-border/40 bg-background/40/60 p-3">
              <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-2">
                Período {verReal ? "(moneda constante)" : "(nominal)"}
              </p>
              <select
                value={selectedIdx}
                onChange={(e) => setSelectedIdx(Number(e.target.value))}
                className="w-full rounded-md border border-border/40 bg-background/20 px-2 py-1.5 text-[14px] font-mono text-foreground outline-none focus:border-emerald-500/50"
              >
                {activo.periods.map((p, i) => (
                  <option key={p.label + i} value={i}>
                    {p.label} — {p.endDate}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selected && (
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-3">
                Razones del periodo {selected.label} ({selected.endDate})
              </p>
              <RatioTable periodo={selected} />
            </div>
          )}

          <div className="grid w-full grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-2">
                Liquidez · interpretación {verReal ? "(real)" : ""}
              </p>
              <InterpList items={activo.interpretaciones.liquidez} />
            </div>
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-2">
                Actividad · interpretación
              </p>
              <InterpList items={activo.interpretaciones.actividad} />
            </div>
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-2">
                Endeudamiento · interpretación
              </p>
              <InterpList items={activo.interpretaciones.endeudamiento} />
            </div>
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-2">
                Rentabilidad + DuPont · interpretación
              </p>
              <InterpList items={activo.interpretaciones.rentabilidad} />
            </div>
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-2">
                Valor de mercado · interpretación
              </p>
              <InterpList items={activo.interpretaciones.mercado} />
            </div>
          </div>
          {verReal && (
            <p className="text-[11px] text-muted-foreground/60">Ajuste Fowler Newton: valores monetarios reexpresados a moneda homogénea (IPC). Ratios no se reexpresan (adimensionales).</p>
          )}
        </div>
      )}
    </div>
  );
}
