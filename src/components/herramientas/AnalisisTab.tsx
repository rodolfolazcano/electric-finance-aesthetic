import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Loader2,
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
import { cn } from "@/lib/utils";

const EJEMPLOS = ["AAPL", "MSFT", "GGAL.BA", "YPFD.BA", "KO"];

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

function FichaCard({ ticker }: { ticker: string }) {
  const fn = useServerFn(fichaDecisionFn);
  const q = useQuery({
    queryKey: ["clara-ficha", ticker],
    queryFn: () => fn({ data: { ticker } }),
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  if (q.isPending)
    return (
      <div className="grid w-full gap-4 md:grid-cols-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  if (q.isError || !q.data)
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          No se pudo completar el análisis de {ticker}. Verificá el símbolo e intentá de nuevo.
        </CardContent>
      </Card>
    );

  const d = q.data;
  const ms = d.margen_seguridad;
  return (
    <div className="space-y-4">
      {/* Resumen de decisión */}
      <Card className={cn("border", decisionColor(d.decision_final))}>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="text-xs tracking-wide text-muted-foreground uppercase">
              Ficha de decisión · {d.empresa}
            </div>
            <div className="mt-1 font-mono text-2xl font-bold">{d.decision_final}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Precio {fmtUSD(d.precio_actual)} · Valor central {fmtUSD(d.valuacion.vi_central)} ·
              Upside {fmtPctS(ms.upside_pct)}
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

      {d.bloqueado_por_cualitativo && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-2 p-4 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            Score cualitativo insuficiente (&lt;5.0): el análisis cuantitativo queda bloqueado — no
            comprar lo que no se entiende.
          </CardContent>
        </Card>
      )}

      <div className="grid w-full gap-4 lg:grid-cols-3">
        {/* Valuación */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4 text-primary" /> Triangulación de valor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Fila k="DCF (FCFF 5 años)" v={fmtUSD(d.valuacion.vi_dcf)} />
            <Fila k="Múltiplos sectoriales" v={fmtUSD(d.valuacion.vi_multi)} />
            <Fila k="Valor libro / APV" v={fmtUSD(d.valuacion.vi_libro)} />
            <Fila
              k="Rango final"
              v={
                d.valuacion.rango
                  ? `${fmtUSD(d.valuacion.rango.min)} – ${fmtUSD(d.valuacion.rango.max)}`
                  : "s/d"
              }
            />
            <Fila k="Perfil" v={d.valuacion.perfil} />
            <Fila k="Precio máx. entrada" v={fmtUSD(ms.precio_max_entrada)} destacado />
          </CardContent>
        </Card>

        {/* Cualitativo */}
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

        {/* Cuantitativo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Cuantitativo clave
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Fila k="ROE" v={pct(d.cuantitativo.metricas.M12_roe)} />
            <Fila k="Margen neto" v={pct(d.cuantitativo.metricas.M6_margen_neto)} />
            <Fila k="Deuda / EBITDA" v={x(d.cuantitativo.metricas.M14_deuda_ebitda)} />
            <Fila k="P/E" v={x(d.cuantitativo.metricas.M15_pe)} />
            <Fila k="EV/EBITDA" v={x(d.cuantitativo.metricas.ev_ebitda)} />
            {d.cuantitativo.alertas.rojas.length > 0 && (
              <ul className="space-y-1 pt-1 text-xs text-red-400">
                {d.cuantitativo.alertas.rojas.map((a, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <XCircle className="mt-0.5 h-3 w-3 shrink-0" /> {a}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {d.notas_consistencia.length > 0 && (
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

export function AnalisisTab() {
  const [input, setInput] = useState("");
  const [ticker, setTicker] = useState<string | null>(null);

  const analizar = useMutation({
    mutationFn: async (t: string) => t.trim().toUpperCase(),
    onSuccess: (t) => {
      if (t) setTicker(t);
    },
  });

  return (
    <div className="space-y-5">

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          analizar.mutate(input);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ticker (ej. AAPL, MSFT, GGAL.BA…)"
          className="max-w-xs font-mono uppercase"
        />
        <Button type="submit" disabled={analizar.isPending || !input.trim()}>
          {analizar.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
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
              onClick={() => {
                setInput(e);
                setTicker(e);
              }}
            >
              {e}
            </Button>
          ))}
        </div>
      </form>

      {ticker && (
        <div className="space-y-5">
          <FichaCard ticker={ticker} />
          <div className="grid w-full gap-4 lg:grid-cols-2">
            <SemaforoPanel ticker={ticker} />
            <NoticiasPanel ticker={ticker} />
          </div>
        </div>
      )}
    </div>
  );
}
