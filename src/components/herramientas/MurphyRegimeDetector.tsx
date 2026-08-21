// @ts-nocheck
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  getIntermarketMurphyIndicators,
  type IntermarketMurphyResult,
} from "@/lib/sectores/intermarket-murphy.functions";

type Regime =
  "inflacionario" | "desinflacionario" | "deflacionario" | "risk_on" | "mixto" | "sin_datos";

interface RegimeConfig {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: string;
  desc: string;
}

const REGIME_CONFIG: Record<Regime, RegimeConfig> = {
  inflacionario: {
    label: "INFLACIONARIO",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    icon: "\u25B2",
    desc: "Commodities suben, bonos caen, dólar débil. Ciclo tardío — favorecer energía, materiales. Proteger con commodities y TIPS.",
  },
  desinflacionario: {
    label: "DESINFLACIONARIO",
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    icon: "\u25BC",
    desc: "Inflación cediendo, bonos estabilizándose. Favorecer growth (XLK), consumo discrecional (XLY). Duration larga empieza a funcionar.",
  },
  deflacionario: {
    label: "DEFLACIONARIO",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    icon: "",
    desc: "Bonos suben, acciones caen, commodities se desploman. Flight-to-quality. Refugio en TLT, XLP, XLU. Evitar todo cíclico.",
  },
  risk_on: {
    label: "CRECIMIENTO / RISK-ON",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    icon: "\u2728",
    desc: "Bonos caen, acciones suben, commodities estables. Expansión económica. Favorecer tecnológicas, industriales, consumo discrecional.",
  },
  mixto: {
    label: "MIXTO / TRANSICIÓN",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    icon: "\u21C4",
    desc: "Señales mixtas entre clases de activos. Reducir tamaño de posiciones. Esperar confirmación de tendencia dominante.",
  },
  sin_datos: {
    label: "SIN DATOS",
    color: "text-muted-foreground",
    bg: "bg-muted/10",
    border: "border-border/30",
    icon: "\u2014",
    desc: "No hay suficientes datos para determinar el régimen.",
  },
};

function detectRegime(data: IntermarketMurphyResult): { regime: Regime; confianza: number } {
  const { crbBonds, bondsStocks } = data;

  const crbUp = crbBonds.trend === "rising";
  const crbDown = crbBonds.trend === "falling";
  const bondsUp = (bondsStocks.tltReturn60d ?? 0) > 0;
  const stocksUp = (bondsStocks.spyReturn60d ?? 0) > 0;
  const corrNeg = (bondsStocks.correlacion60d ?? 0) < -0.3;
  const corrPos = (bondsStocks.correlacion60d ?? 0) > 0.3;

  // Inflacionario: CRB/Bonds sube, bonos caen (TLT-), acciones mixtas
  if (crbUp && !bondsUp && corrNeg) {
    return { regime: "inflacionario", confianza: 80 };
  }
  if (crbUp && !bondsUp) {
    return { regime: "inflacionario", confianza: 65 };
  }

  // Deflacionario: CRB/Bonds cae, bonos suben (TLT+), acciones caen (SPY-)
  if (crbDown && bondsUp && !stocksUp && corrNeg) {
    return { regime: "deflacionario", confianza: 85 };
  }
  if (bondsUp && !stocksUp && corrNeg) {
    return { regime: "deflacionario", confianza: 70 };
  }

  // Risk-on: Bonos caen, acciones suben, CRB estable o subiendo
  if (!bondsUp && stocksUp && corrNeg) {
    return { regime: "risk_on", confianza: 80 };
  }
  if (!bondsUp && stocksUp) {
    return { regime: "risk_on", confianza: 60 };
  }

  // Desinflacionario: CRB/Bonds cae o plano, bonos estables, acciones suben
  if ((crbDown || crbBonds.trend === "flat") && bondsUp && stocksUp && corrPos) {
    return { regime: "desinflacionario", confianza: 75 };
  }
  if ((crbDown || crbBonds.trend === "flat") && stocksUp) {
    return { regime: "desinflacionario", confianza: 55 };
  }

  // Mixto: no hay señal clara
  return { regime: "mixto", confianza: 40 };
}

//  Las 4 relaciones Murphy como cards individuales 

function RelationshipCard({
  title,
  direction,
  summary,
  status,
  detail,
}: {
  title: string;
  direction: string;
  summary: string;
  status: "normal" | "alerta" | "neutro";
  detail: string;
}) {
  const statusColor =
    status === "normal"
      ? "text-green-400 border-green-500/30 bg-green-500/10"
      : status === "alerta"
        ? "text-red-400 border-red-500/30 bg-red-500/10"
        : "text-muted-foreground border-border/30 bg-muted/10";
  return (
    <Card className="border-border/40 bg-background/40/40 p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[13px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <span className={cn("rounded px-1.5 py-0.5 text-[12px] font-mono border", statusColor)}>
          {direction}
        </span>
      </div>
      <p className="text-[13px] text-foreground font-medium mb-1">{summary}</p>
      <p className="text-[13px] text-muted-foreground/70 leading-relaxed">{detail}</p>
    </Card>
  );
}

//  Componente principal 

export function MurphyRegimeDetector() {
  const fn = useServerFn(getIntermarketMurphyIndicators);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["murphy-regime"],
    queryFn: () => fn(),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-lg" />
        <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-[13px] text-danger">
        Error al cargar indicadores intermarket.
      </div>
    );
  }

  const { regime, confianza } = detectRegime(data);
  const cfg = REGIME_CONFIG[regime];

  // Determinar el estado de cada relación
  const dxyCorrs = data.crossAssetCorrelations.filter(
    (c) => c.assetB.includes("XLB") || c.assetB.includes("XLE"),
  );
  const dxyPressuringCommodities = dxyCorrs.some(
    (c) => c.correlation60d != null && c.correlation60d < -0.3,
  );
  const crbRising = data.crbBonds.trend === "rising";
  const bondsVsStocksCorr = data.bondsStocks.correlacion60d;
  const deflationScenario = data.bondsStocks.escenario?.includes("DEFLACIÓN");
  const riskOnScenario = data.bondsStocks.escenario?.includes("CRECIMIENTO");

  return (
    <div className="space-y-4">
      {/* Regime Banner */}
      <Card className={cn("border-2", cfg.border, cfg.bg)}>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{cfg.icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className={cn("text-sm font-bold font-mono tracking-wide", cfg.color)}>
                  {cfg.label}
                </span>
                <div className="flex items-center gap-1">
                  <div className="relative h-2 w-20 rounded-full bg-border/30">
                    <div
                      className={cn(
                        "absolute left-0 top-0 h-full rounded-full transition-all",
                        cfg.color.replace("text-", "bg-"),
                      )}
                      style={{ width: `${confianza}%` }}
                    />
                  </div>
                  <span className="text-[13px] font-mono text-muted-foreground">{confianza}%</span>
                </div>
              </div>
              <p className="text-[13px] text-muted-foreground/80 leading-relaxed mt-0.5">
                {cfg.desc}
              </p>
            </div>
          </div>
          <div className="hidden sm:block text-right">
            <span className="text-[12px] font-mono text-muted-foreground/50">
              {new Date(data.generatedAt).toLocaleString("es-AR")}
            </span>
          </div>
        </div>
      </Card>

      {/* Las 4 relaciones Murphy */}
      <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <RelationshipCard
          title="1. Dólar vs Commodities"
          direction="Opuesta"
          summary={
            dxyPressuringCommodities
              ? "USD fuerte presiona commodities a la baja"
              : "Sin presión significativa del USD sobre commodities"
          }
          status={dxyPressuringCommodities ? "alerta" : "neutro"}
          detail="Dólar fuerte abarata commodities (cotizados en USD). Si DXY sube y XLB/XLE caen, la relación se cumple. Si ambos suben, algo más está impulsando commodities (ej. escasez física)."
        />
        <RelationshipCard
          title="2. Commodities vs Bonos"
          direction="Opuesta"
          summary={
            crbRising
              ? "CRB/Bonds subiendo: inflación presionando"
              : "CRB/Bonds estable o bajando: presión inflacionaria cediendo"
          }
          status={crbRising ? "alerta" : "normal"}
          detail="Commodities al alza = inflación = tasas suben = precio de bonos baja. El ratio CRB/DBC vs TLT es el mejor indicador líder de inflación (Murphy Cap. 1)."
        />
        <RelationshipCard
          title="3. Bonos vs Acciones"
          direction="Misma"
          summary={
            (bondsVsStocksCorr ?? 0) > 0
              ? `Correlación positiva (${bondsVsStocksCorr?.toFixed(2)}): relación normal`
              : `Correlación negativa (${bondsVsStocksCorr?.toFixed(2)}): régiMen anormal`
          }
          status={(bondsVsStocksCorr ?? 0) > 0 ? "normal" : "alerta"}
          detail="Tasas bajas (precios de bonos altos) suelen beneficiar al equity. Correlación positiva entre TLT y SPY = régimen normal. Correlación negativa = algo está fuera de equilibrio."
        />
        <RelationshipCard
          title="4. Escenario de Deflación"
          direction="Inversa"
          summary={
            deflationScenario
              ? "Flight-to-quality detectado: bonos suben, acciones caen"
              : riskOnScenario
                ? "Risk-on: acciones lideran, bonos caen"
                : "Sin señal deflacionaria"
          }
          status={deflationScenario ? "alerta" : riskOnScenario ? "normal" : "neutro"}
          detail="En deflación severa, la correlación TLT/SPY se vuelve negativa: bonos refugio suben, acciones caen. Es la señal más confiable de estrés macro (Murphy Cap. 13)."
        />
      </div>
    </div>
  );
}
