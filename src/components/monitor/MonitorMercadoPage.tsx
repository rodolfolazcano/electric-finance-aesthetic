import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useIOLSession } from "@/lib/iol-context";
import { getMonitorMercadoData, type MonitorMercadoData, type BonoRow } from "@/lib/api/monitor-mercado.functions";
import { esMercadoAbierto } from "@/lib/renta-fija/mercado-horario";
import { cn } from "@/lib/utils";
import { DolarComparativaTable } from "./DolarComparativaTable";

// ─── Main Component ────────────────────────────────────────────────────────

export function MonitorMercadoPage() {
  const { accessToken } = useIOLSession();
  const fnMonitor = useServerFn(getMonitorMercadoData);
  const [data, setData] = useState<MonitorMercadoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fnMonitor({ data: { bearerToken: accessToken ?? undefined } });
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, [fnMonitor, accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  const mercadoAbierto = data?.mercadoAbierto ?? esMercadoAbierto();
  const fechaSesion = data?.timestamp
    ? new Date(data.timestamp).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="mx-auto max-w-[1600px] px-2 py-4 sm:px-4 space-y-3">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <Header
        fechaSesion={fechaSesion}
        mercadoAbierto={mercadoAbierto}
        loading={loading}
        onRefresh={load}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
        error={error}
      />

      {error && !loading && (
        <div className="glass-panel p-4 text-center">
          <div className="text-sm text-red-400 mb-2">{error}</div>
          <button onClick={load} className="mono rounded-md border border-border/60 bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground">
            Reintentar
          </button>
        </div>
      )}

      {/* ── Grid de paneles ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3">
        <PanelDolares data={data} loading={loading} />
        <PanelLecaps data={data} loading={loading} />
        <PanelTamar data={data} loading={loading} />
        <PanelBonares data={data} loading={loading} />
        <PanelCER data={data} loading={loading} />
        <PanelFuturos data={data} loading={loading} />
        <PanelBopreales data={data} loading={loading} />
        <PanelLider data={data} loading={loading} />
        <PanelDolarLinked data={data} loading={loading} />
        <PanelPares data={data} loading={loading} />
        <PanelSendero data={data} loading={loading} />
      </div>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <div className="text-center text-[10px] text-muted-foreground py-4 border-t border-border/40">
        Cintia Boos, Agente Productora CNV N&deg; 2192
      </div>
    </div>
  );
}

// ─── Header ────────────────────────────────────────────────────────────────

function Header({
  fechaSesion,
  mercadoAbierto,
  loading,
  onRefresh,
  autoRefresh,
  onToggleAutoRefresh,
  error,
}: {
  fechaSesion: string;
  mercadoAbierto: boolean;
  loading: boolean;
  onRefresh: () => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  error: string | null;
}) {
  return (
    <div className="glass-panel p-3 flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-3">
        <span className="mono text-sm font-semibold tracking-tight text-foreground">MONITOR MERCADO</span>
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${mercadoAbierto ? "bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.6)]" : "bg-muted-foreground"}`} />
          <span className={`mono text-[10px] font-medium ${mercadoAbierto ? "text-green-400" : "text-muted-foreground"}`}>
            {mercadoAbierto ? "EN VIVO" : "MERCADO CERRADO"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="mono text-[10px] text-muted-foreground">{fechaSesion}</span>
        <button
          onClick={onToggleAutoRefresh}
          className={cn(
            "mono rounded-md border px-2 py-1 text-[10px] transition-colors",
            autoRefresh
              ? "border-primary/40 text-primary bg-primary/10"
              : "border-border/60 text-muted-foreground bg-muted/30",
          )}
        >
          {autoRefresh ? "AUTO" : "MANUAL"}
        </button>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="mono rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {loading ? "..." : "\u21BB"}
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-shimmer rounded", className ?? "h-4 w-full")} />;
}

function NoDisponible() {
  return <span className="text-muted-foreground/60 text-[10px] italic">— No disponible</span>;
}

function fmtNum(n: number | null | undefined, d = 2): string {
  if (n == null) return "";
  return n.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function colorVar(n: number | null | undefined, inverse = false): string {
  if (n == null) return "text-muted-foreground";
  if (n > 0) return inverse ? "text-red-400" : "text-green-400";
  if (n < 0) return inverse ? "text-green-400" : "text-red-400";
  return "text-muted-foreground";
}

function PanelCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("glass-panel p-3", className)}>
      <div className="mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 border-b border-border/40 pb-1.5">
        {title}
      </div>
      {children}
    </div>
  );
}

// ─── Panel 1: Dólares & Macro ─────────────────────────────────────────────

function PanelDolares({ data, loading }: { data: MonitorMercadoData | null; loading: boolean }) {
  const dolarCasas = data?.dolares ?? [];
  const riesgo = data?.riesgoPais;
  const reservas = data?.reservas;
  const tamarTna = data?.tamarTna;

  return (
    <PanelCard title="Dólares — Comparativa">
      <DolarComparativaTable dolares={dolarCasas} loading={loading} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
        <MacroCard label="Riesgo País" value={riesgo?.valor} variacion={riesgo?.variacion} unit="pts" inverse />
        <MacroCard label="Reservas BCRA" value={reservas?.valor} variacion={reservas?.variacion} unit="USD B" format={(v) => v.toFixed(1)} />
        <MacroCard label="TAMAR (TNA)" value={tamarTna} variacion={null} unit="%" format={(v) => `${v.toFixed(2)}%`} />
      </div>
    </PanelCard>
  );
}

function MacroCard({
  label, value, variacion, unit, inverse, format,
}: {
  label: string; value: number | null | undefined; variacion: number | null | undefined;
  unit: string; inverse?: boolean; format?: (v: number) => string;
}) {
  return (
    <div className="glass-inset p-2">
      <div className="mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mono text-sm font-semibold tabular-nums mt-0.5">
        {value != null ? (format ? format(value) : fmtNum(value)) : <NoDisponible />}
      </div>
      <div className={cn("mono text-[10px]", variacion != null ? colorVar(variacion, inverse) : "text-muted-foreground")}>
        {variacion != null ? `${variacion >= 0 ? "+" : ""}${fmtNum(variacion)} ${unit}` : <NoDisponible />}
      </div>
    </div>
  );
}

// ─── Panel 2: LECAPs & BONCAPs ────────────────────────────────────────────

function PanelLecaps({ data, loading }: { data: MonitorMercadoData | null; loading: boolean }) {
  const lecaps = data?.lecaps ?? [];
  return (
    <PanelCard title="LECAPs & BONCAPs (Tasa Fija)">
      {loading && !data ? (
        <Skeleton className="h-40" />
      ) : lecaps.length === 0 ? (
        <EmptyText />
      ) : (
        <div className="overflow-x-auto">
          <table className="mono w-full text-[10px]">
            <thead className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
              <tr>
                <Th>Ticker</Th>
                <Th>Emisión</Th>
                <Th>Vencimiento</Th>
                <Th>Días</Th>
                <Th>VPV</Th>
                <Th right>Precio</Th>
                <Th right>TNA(365)</Th>
                <Th right>TEM(365)</Th>
                <Th right>Var%</Th>
              </tr>
            </thead>
            <tbody>
              {lecaps.map((l) => (
                <tr key={l.ticker} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <Td className="font-semibold text-foreground">{l.ticker}</Td>
                  <Td className="text-muted-foreground">{l.fechaEmision}</Td>
                  <Td className="text-muted-foreground">{l.fechaVencimiento}</Td>
                  <Td>{l.dias}</Td>
                  <Td>{l.vpv > 0 ? fmtNum(l.vpv) : <NoDisponible />}</Td>
                  <Td right>{l.precio != null ? `$${fmtNum(l.precio)}` : <NoDisponible />}</Td>
                  <Td right className={colorVar(l.tna)}>{l.tna != null ? `${l.tna.toFixed(2)}%` : <NoDisponible />}</Td>
                  <Td right className={colorVar(l.tem)}>{l.tem != null ? `${l.tem.toFixed(2)}%` : <NoDisponible />}</Td>
                  <Td right className={colorVar(l.variacion)}>{l.variacion != null ? fmtPct(l.variacion) : <NoDisponible />}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelCard>
  );
}

// ─── Panel genérico para bonos ─────────────────────────────────────────────

function BonoTable({ rows, loading }: { rows: BonoRow[]; loading: boolean }) {
  if (loading && rows.length === 0) return <Skeleton className="h-40" />;
  if (rows.length === 0) return <EmptyText />;
  return (
    <div className="overflow-x-auto">
      <table className="mono w-full text-[10px]">
        <thead className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
          <tr>
            <Th>Ticker</Th>
            <Th>Vencimiento</Th>
            <Th right>Precio</Th>
            <Th right>TIR</Th>
            <Th right>TEA</Th>
            <Th right>TNA</Th>
            <Th right>DM</Th>
            <Th right>Paridad</Th>
            <Th right>Var%</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ticker} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
              <Td className="font-semibold text-foreground">{r.ticker}</Td>
              <Td className="text-muted-foreground">{r.vencimiento}</Td>
              <Td right>{r.precio != null ? `$${fmtNum(r.precio)}` : <NoDisponible />}</Td>
              <Td right className={r.tir != null ? colorTIR(r.tir / 100) : ""}>{r.tir != null ? `${r.tir.toFixed(2)}%` : <NoDisponible />}</Td>
              <Td right>{r.tea != null ? `${r.tea.toFixed(2)}%` : <NoDisponible />}</Td>
              <Td right>{r.tna != null ? `${r.tna.toFixed(2)}%` : <NoDisponible />}</Td>
              <Td right>{r.duration != null ? r.duration.toFixed(2) : <NoDisponible />}</Td>
              <Td right>{r.paridad != null ? `${r.paridad.toFixed(2)}%` : <NoDisponible />}</Td>
              <Td right className={colorVar(r.variacion)}>{r.variacion != null ? fmtPct(r.variacion) : <NoDisponible />}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PanelTamar({ data, loading }: { data: MonitorMercadoData | null; loading: boolean }) {
  return (
    <PanelCard title="TAMAR (Puro)">
      <BonoTable rows={data?.tamar ?? []} loading={loading} />
    </PanelCard>
  );
}

function PanelBonares({ data, loading }: { data: MonitorMercadoData | null; loading: boolean }) {
  return (
    <PanelCard title="Bonares & Globales">
      <BonoTable rows={data?.bonaresGlobales ?? []} loading={loading} />
    </PanelCard>
  );
}

function PanelCER({ data, loading }: { data: MonitorMercadoData | null; loading: boolean }) {
  return (
    <PanelCard title="Bonos CER">
      <BonoTable rows={data?.bonosCER ?? []} loading={loading} />
    </PanelCard>
  );
}

function PanelBopreales({ data, loading }: { data: MonitorMercadoData | null; loading: boolean }) {
  return (
    <PanelCard title="BOPREALES">
      <BonoTable rows={data?.bopreales ?? []} loading={loading} />
    </PanelCard>
  );
}

function PanelDolarLinked({ data, loading }: { data: MonitorMercadoData | null; loading: boolean }) {
  return (
    <PanelCard title="Dólar Linked">
      <BonoTable rows={data?.dolarLinked ?? []} loading={loading} />
    </PanelCard>
  );
}

// ─── Panel 6: Futuros ROFEX ────────────────────────────────────────────────

function PanelFuturos({ data, loading }: { data: MonitorMercadoData | null; loading: boolean }) {
  const futuros = data?.futuros ?? [];
  return (
    <PanelCard title="Futuros ROFEX (Dólar Curva)">
      {loading && !data ? (
        <Skeleton className="h-32" />
      ) : futuros.length === 0 ? (
        <EmptyText />
      ) : (
        <div className="overflow-x-auto">
          <table className="mono w-full text-[10px]">
            <thead className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
              <tr>
                <Th>Contrato</Th>
                <Th>VTO</Th>
                <Th right>Último</Th>
                <Th right>Var%</Th>
                <Th right>Vol</Th>
                <Th right>TNA</Th>
                <Th right>Op.Int</Th>
              </tr>
            </thead>
            <tbody>
              {futuros.map((f) => (
                <tr key={f.contrato} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <Td className="font-semibold text-foreground">{f.contrato}</Td>
                  <Td className="text-muted-foreground">{f.vencimiento ?? <NoDisponible />}</Td>
                  <Td right>{f.ultimo != null ? `$${fmtNum(f.ultimo)}` : <NoDisponible />}</Td>
                  <Td right className={colorVar(f.variacion)}>{f.variacion != null ? fmtPct(f.variacion) : <NoDisponible />}</Td>
                  <Td right>{f.volumen != null ? fmtNum(f.volumen, 0) : <NoDisponible />}</Td>
                  <Td right><NoDisponible /></Td>
                  <Td right><NoDisponible /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelCard>
  );
}

// ─── Panel 8: Panel Líder ──────────────────────────────────────────────────

function PanelLider({ data, loading }: { data: MonitorMercadoData | null; loading: boolean }) {
  const acciones = data?.panelLider ?? [];
  return (
    <PanelCard title="Panel Líder (Acciones BYMA)">
      {loading && !data ? (
        <Skeleton className="h-40" />
      ) : acciones.length === 0 ? (
        <EmptyText />
      ) : (
        <div className="overflow-x-auto">
          <table className="mono w-full text-[10px]">
            <thead className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
              <tr>
                <Th>Ticker</Th>
                <Th right>Compra</Th>
                <Th right>Venta</Th>
                <Th right>Último</Th>
                <Th right>Día%</Th>
                <Th right>Vol</Th>
                <Th right>30 Días%</Th>
              </tr>
            </thead>
            <tbody>
              {acciones.map((a) => (
                <tr key={a.ticker} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <Td className="font-semibold text-foreground">{a.ticker}</Td>
                  <Td right>{a.compra != null ? `$${fmtNum(a.compra)}` : <NoDisponible />}</Td>
                  <Td right>{a.venta != null ? `$${fmtNum(a.venta)}` : <NoDisponible />}</Td>
                  <Td right>{a.ultimo != null ? `$${fmtNum(a.ultimo)}` : <NoDisponible />}</Td>
                  <Td right className={colorVar(a.variacion)}>{a.variacion != null ? fmtPct(a.variacion) : <NoDisponible />}</Td>
                  <Td right>{a.volumen != null ? fmtNum(a.volumen, 0) : <NoDisponible />}</Td>
                  <Td right><NoDisponible /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelCard>
  );
}

// ─── Panel 10: Pares ───────────────────────────────────────────────────────

function PanelPares({ data, loading }: { data: MonitorMercadoData | null; loading: boolean }) {
  return (
    <PanelCard title="Método de Pares · Cross-check NT8 Apéndice">
      <div className="py-6 text-center text-muted-foreground/60 text-[10px] italic">
        Panel derivado — requiere confirmación de fórmula Apéndice NT8
      </div>
    </PanelCard>
  );
}

// ─── Panel 11: Sendero Mensual ─────────────────────────────────────────────

function PanelSendero({ data, loading }: { data: MonitorMercadoData | null; loading: boolean }) {
  return (
    <PanelCard title="Sendero Mensual · BEI vs REM-BCRA">
      <div className="py-6 text-center text-muted-foreground/60 text-[10px] italic">
        BEI: cálculo propio derivado de Panel 10 (breakeven curva LECAP vs CER).
        REM: requiere fuente BCRA no confirmada.
      </div>
    </PanelCard>
  );
}

// ─── Table helpers ─────────────────────────────────────────────────────────

function Th({ children, right, className }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return (
    <th className={cn("px-2 py-1.5 font-medium", right ? "text-right" : "text-left", className)}>
      {children}
    </th>
  );
}

function Td({ children, right, className }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return (
    <td className={cn("px-2 py-1.5", right ? "text-right tabular-nums" : "text-left", className)}>
      {children}
    </td>
  );
}

function EmptyText() {
  return <div className="py-4 text-center text-muted-foreground/60 text-[10px] italic">Sin datos disponibles</div>;
}

function colorTIR(tir: number): string {
  if (tir > 0.10) return "text-red-400";
  if (tir > 0.06) return "text-amber-400";
  if (tir > 0.03) return "text-yellow-400";
  return "text-green-400";
}
