// @ts-nocheck
import type { FundamentalAFResult, PeriodoHistoricoRow } from "./fundamental-af.functions";
import type { ConclusionSectorialInteligente } from "./interpretacion-sectorial.functions";

export type FuerzaSenal = "positiva" | "mixta" | "negativa" | "no_disponible";

export interface SenalVentaja {
  nombre: string;
  fuerza: FuerzaSenal;
  detalle: string;
  comparadoConSector: boolean;
}

export interface VentajaCompetitivaCuantitativaResult {
  symbol: string;
  senales: SenalVentaja[];
  senalesPositivas: number;
  senalesEvaluadas: number;
  conclusion: "Alta evidencia" | "Evidencia moderada" | "No concluyente" | "Evidencia insuficiente";
  coberturaDatos: {
    peersConRdData: number;
    peersTotal: number;
    peersConRevisionData: number;
    periodosHistoricosUsados: number;
  };
  advertenciaMetodologica: string;
}

const UMBRAL_ALTA_EVIDENCIA = 0.75;
const UMBRAL_EVIDENCIA_MODERADA = 0.5;
const SECTORES_RD = ["healthcare", "communication services", "technology"];

function extraerBanda(
  metricLabel: string,
  fortalezas: string[],
  debilidades: string[],
): { banda: string; percentil: number } | null {
  const pattern = new RegExp(`^${metricLabel}: (.+?) \\(percentil ~(\\d+)\\)`);
  for (const f of fortalezas) {
    const m = f.match(pattern);
    if (m) return { banda: m[1], percentil: parseInt(m[2]) };
  }
  for (const d of debilidades) {
    const m = d.match(pattern);
    if (m) return { banda: m[1], percentil: parseInt(m[2]) };
  }
  return null;
}

function esBandaFavorable(banda: string): boolean {
  return banda === "Líder del sector" || banda === "Por encima de la mediana";
}

function esBandaDesfavorable(banda: string): boolean {
  return banda === "Por debajo de la mediana" || banda === "Rezagado del sector";
}

function calcularTendenciaMargen(periodos: PeriodoHistoricoRow[]): {
  tendencia: "creciente" | "estable" | "decreciente" | "no_disponible";
  periodosUsados: number;
} {
  const conDato = periodos
    .filter((p) => p.netMargin != null)
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
  if (conDato.length < 3) return { tendencia: "no_disponible", periodosUsados: conDato.length };

  const ultimos = conDato.map((p) => p.netMargin!).slice(-4);
  let allCreciente = true;
  let hasBigDrop = false;
  for (let i = 1; i < ultimos.length; i++) {
    if (ultimos[i] < ultimos[i - 1] * 0.95) allCreciente = false;
    if (ultimos[i] < ultimos[i - 1] * 0.8) hasBigDrop = true;
  }
  const tendencia: "creciente" | "estable" | "decreciente" = allCreciente
    ? "creciente"
    : hasBigDrop
      ? "decreciente"
      : "estable";
  return { tendencia, periodosUsados: ultimos.length };
}

function calcularTendenciaCrecimiento(periodos: PeriodoHistoricoRow[]): {
  tendencia: "acelerando" | "estable" | "desacelerando" | "no_disponible";
  periodosUsados: number;
} {
  const conDato = periodos
    .filter((p) => p.revenueChgPct != null)
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
  if (conDato.length < 3) return { tendencia: "no_disponible", periodosUsados: conDato.length };

  const valores = conDato.map((p) => p.revenueChgPct!).slice(-4);
  let allAscending = true;
  let allDescending = true;
  for (let i = 1; i < valores.length; i++) {
    if (valores[i] <= valores[i - 1] * 0.98) allAscending = false;
    if (valores[i] >= valores[i - 1] * 1.02) allDescending = false;
  }
  const tendencia: "acelerando" | "estable" | "desacelerando" = allAscending
    ? "acelerando"
    : allDescending
      ? "desacelerando"
      : "estable";
  return { tendencia, periodosUsados: valores.length };
}

function calcularPercentilEnPeerGroup(valor: number, peers: number[]): number | null {
  const validos = peers.filter((v) => v != null && Number.isFinite(v));
  if (validos.length === 0) return null;
  const sorted = [...validos].sort((a, b) => a - b);
  const below = sorted.filter((v) => v <= valor).length;
  return Math.round((below / sorted.length) * 100);
}

function mediana(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function calcularVentajaCompetitivaCuantitativa(
  result: FundamentalAFResult,
  sectorComparacion: {
    peers: FundamentalAFResult[];
    sector: string;
    industria: string;
  } | null,
  sectorConclusion: ConclusionSectorialInteligente | null,
  historico: PeriodoHistoricoRow[] | null,
): VentajaCompetitivaCuantitativaResult {
  if (result.esETF) {
    return {
      symbol: result.symbol,
      senales: [],
      senalesPositivas: 0,
      senalesEvaluadas: 0,
      conclusion: "Evidencia insuficiente",
      coberturaDatos: {
        peersConRdData: 0,
        peersTotal: 0,
        peersConRevisionData: 0,
        periodosHistoricosUsados: 0,
      },
      advertenciaMetodologica: "No aplica para ETFs.",
    };
  }

  const peers = sectorComparacion?.peers?.filter((p) => !p.error) ?? [];
  const peersTotal = peers.length;
  const peersConRdData = peers.filter((p) => p.rdToRevenuePct != null).length;
  const peersConRevisionData = peers.filter((p) => p.revisionEstimadosPct != null).length;
  const periodos = historico ?? [];
  const fortalezas = sectorConclusion?.fortalezas ?? [];
  const debilidades = sectorConclusion?.debilidades ?? [];

  const senales: SenalVentaja[] = [];
  let senalesPositivas = 0;
  let senalesEvaluadas = 0;

  function pushSenal(s: SenalVentaja) {
    senales.push(s);
    if (s.fuerza === "positiva") senalesPositivas++;
    if (s.fuerza !== "no_disponible") senalesEvaluadas++;
  }

  // ── Señal 1: Premium de margen sostenido ──
  const bandaMargen = extraerBanda("margen neto", fortalezas, debilidades);
  const tendenciaMargen = calcularTendenciaMargen(periodos);
  const bandaMargenFavorable = bandaMargen ? esBandaFavorable(bandaMargen.banda) : false;
  const bandaMargenDesfavorable = bandaMargen ? esBandaDesfavorable(bandaMargen.banda) : false;

  if (bandaMargen && tendenciaMargen.tendencia !== "no_disponible") {
    const f =
      bandaMargenFavorable &&
      (tendenciaMargen.tendencia === "creciente" || tendenciaMargen.tendencia === "estable")
        ? "positiva"
        : bandaMargenFavorable && tendenciaMargen.tendencia === "decreciente"
          ? "mixta"
          : bandaMargenDesfavorable
            ? "negativa"
            : "mixta";
    pushSenal({
      nombre: "Premium de margen",
      fuerza: f as FuerzaSenal,
      detalle: bandaMargenDesfavorable
        ? `Margen neto en banda "${bandaMargen.banda}" vs sector (pct ~${bandaMargen.percentil}), tendencia ${tendenciaMargen.tendencia}. Posición desfavorable frente a pares.`
        : bandaMargenFavorable && tendenciaMargen.tendencia === "decreciente"
          ? `Margen neto en banda "${bandaMargen.banda}" vs sector pero tendencia propia decreciente en últimos ${tendenciaMargen.periodosUsados} años — posición buena hoy pero deteriorándose.`
          : `Margen neto en banda "${bandaMargen.banda}" vs sector (pct ~${bandaMargen.percentil}), tendencia propia ${tendenciaMargen.tendencia} en últimos ${tendenciaMargen.periodosUsados} años.`,
      comparadoConSector: true,
    });
  } else if (bandaMargen) {
    pushSenal({
      nombre: "Premium de margen",
      fuerza: bandaMargenFavorable
        ? "mixta"
        : ((bandaMargenDesfavorable ? "negativa" : "mixta") as FuerzaSenal),
      detalle: `Margen neto en banda "${bandaMargen.banda}" vs sector (pct ~${bandaMargen.percentil}) — tendencia histórica no disponible (<3 períodos con dato).`,
      comparadoConSector: true,
    });
  } else {
    pushSenal({
      nombre: "Premium de margen",
      fuerza: "no_disponible",
      detalle: "Sin datos suficientes de margen neto para clasificación sectorial.",
      comparadoConSector: false,
    });
  }

  // ── Señal 2: Premium de crecimiento de ingresos ──
  const bandaGrowth = extraerBanda("crecimiento de ingresos", fortalezas, debilidades);
  const tendenciaGrowth = calcularTendenciaCrecimiento(periodos);

  if (bandaGrowth) {
    const bandaGrowthFavorable = esBandaFavorable(bandaGrowth.banda);
    const bandaGrowthDesfavorable = esBandaDesfavorable(bandaGrowth.banda);
    const f =
      bandaGrowthFavorable &&
      (tendenciaGrowth.tendencia === "acelerando" || tendenciaGrowth.tendencia === "estable")
        ? "positiva"
        : bandaGrowthFavorable && tendenciaGrowth.tendencia === "desacelerando"
          ? "mixta"
          : bandaGrowthDesfavorable
            ? "negativa"
            : tendenciaGrowth.tendencia === "desacelerando"
              ? "negativa"
              : "mixta";
    const detalle = bandaGrowthDesfavorable
      ? `Crecimiento de ingresos en banda "${bandaGrowth.banda}" vs sector (pct ~${bandaGrowth.percentil}), tendencia ${tendenciaGrowth.tendencia}. Por detrás de pares.`
      : bandaGrowthFavorable && tendenciaGrowth.tendencia === "desacelerando"
        ? `Crecimiento de ingresos en banda "${bandaGrowth.banda}" vs sector pero desacelerando en últimos ${tendenciaGrowth.periodosUsados} períodos — posición buena hoy pero perdiendo impulso.`
        : `Crecimiento de ingresos en banda "${bandaGrowth.banda}" vs sector (pct ~${bandaGrowth.percentil}), tendencia propia ${tendenciaGrowth.tendencia} en últimos ${tendenciaGrowth.periodosUsados} períodos.`;
    pushSenal({
      nombre: "Premium de crecimiento",
      fuerza: f as FuerzaSenal,
      detalle,
      comparadoConSector: true,
    });
  } else {
    const tienePeerData = peers.some((p) => p.revenueGrowth != null);
    if (!tienePeerData) {
      pushSenal({
        nombre: "Premium de crecimiento",
        fuerza: "no_disponible",
        detalle: "Sin datos de crecimiento de ingresos en pares del sector.",
        comparadoConSector: false,
      });
    } else if (result.revenueGrowth == null) {
      pushSenal({
        nombre: "Premium de crecimiento",
        fuerza: "no_disponible",
        detalle: "Sin dato de crecimiento de ingresos para la empresa.",
        comparadoConSector: false,
      });
    } else {
      const peersGrowth = peers
        .map((p) => p.revenueGrowth)
        .filter((v) => v != null && Number.isFinite(v)) as number[];
      if (peersGrowth.length < 3) {
        pushSenal({
          nombre: "Premium de crecimiento",
          fuerza: "no_disponible",
          detalle: "Muestra insuficiente de pares para comparar crecimiento.",
          comparadoConSector: false,
        });
      } else {
        const pct = calcularPercentilEnPeerGroup(result.revenueGrowth, peersGrowth);
        const favorable = pct != null && pct >= 60;
        const tendStr =
          tendenciaGrowth.tendencia !== "no_disponible"
            ? `, tendencia propia ${tendenciaGrowth.tendencia}`
            : "";
        pushSenal({
          nombre: "Premium de crecimiento",
          fuerza: favorable ? "positiva" : "mixta",
          detalle: `Crecimiento de ingresos en percentil ~${pct} vs sector (${peersGrowth.length} pares)${tendStr}.`,
          comparadoConSector: true,
        });
      }
    }
  }

  // ── Señal 3: I+D traducido en resultado ──
  const sectorStr = (result.sector ?? "").toLowerCase();
  const esSectorRd = SECTORES_RD.some((s) => sectorStr.includes(s));

  if (esSectorRd && result.rdToRevenuePct != null) {
    const peersRd = peers
      .map((p) => p.rdToRevenuePct)
      .filter((v) => v != null && Number.isFinite(v)) as number[];
    const pctRd = calcularPercentilEnPeerGroup(result.rdToRevenuePct, peersRd);
    if (pctRd != null) {
      const rdAlto = pctRd >= 66;
      const senal2 = senales.find((s) => s.nombre === "Premium de crecimiento");
      const f =
        rdAlto && senal2?.fuerza === "positiva" ? "positiva" : rdAlto ? "mixta" : "negativa";
      const detalle =
        rdAlto && senal2?.fuerza === "positiva"
          ? `I+D/Revenue en percentil ~${pctRd} del sector (${peersRd.length} pares) — inversión alta que se traduce en crecimiento superior.`
          : rdAlto
            ? `I+D/Revenue en percentil ~${pctRd} del sector pero sin traducción visible en crecimiento superior aún — señal a monitorear.`
            : `I+D/Revenue en percentil ~${pctRd} del sector — por detrás de pares en inversión.`;
      pushSenal({
        nombre: "I+D e innovación",
        fuerza: f as FuerzaSenal,
        detalle,
        comparadoConSector: true,
      });
    } else {
      pushSenal({
        nombre: "I+D e innovación",
        fuerza: "no_disponible",
        detalle: "Sin datos de I+D en pares del sector para comparar.",
        comparadoConSector: false,
      });
    }
  } else if (esSectorRd) {
    pushSenal({
      nombre: "I+D e innovación",
      fuerza: "no_disponible",
      detalle: "Empresa no reporta I+D por separado en sus estados financieros.",
      comparadoConSector: false,
    });
  } else {
    pushSenal({
      nombre: "I+D e innovación",
      fuerza: "no_disponible",
      detalle: "No aplica para este sector (no es Salud/Comunicación/Tecnología).",
      comparadoConSector: false,
    });
  }

  // ── Señal 4: Momentum de revisión de analistas ──
  if (result.revisionEstimadosPct != null) {
    const peersRev = peers
      .map((p) => p.revisionEstimadosPct)
      .filter((v) => v != null && Number.isFinite(v)) as number[];
    const medianaRev = mediana(peersRev);
    if (medianaRev != null && peersRev.length >= 2) {
      const diff = result.revisionEstimadosPct - medianaRev;
      const f = diff > 2 ? "positiva" : diff < -2 ? "negativa" : "mixta";
      const detalle = `Revisiones de EPS ${result.revisionEstimadosPct > 0 ? "+" : ""}${result.revisionEstimadosPct}% — ${f === "positiva" ? `supera la mediana sectorial (${medianaRev > 0 ? "+" : ""}${medianaRev.toFixed(1)}%). Momentum favorable.` : f === "negativa" ? `por debajo de la mediana sectorial (${medianaRev > 0 ? "+" : ""}${medianaRev.toFixed(1)}%).` : `en línea con la mediana sectorial (${medianaRev > 0 ? "+" : ""}${medianaRev.toFixed(1)}%).`}`;
      pushSenal({
        nombre: "Momentum de revisiones",
        fuerza: f as FuerzaSenal,
        detalle,
        comparadoConSector: true,
      });
    } else {
      pushSenal({
        nombre: "Momentum de revisiones",
        fuerza: "mixta",
        detalle: `Revisiones de EPS ${result.revisionEstimadosPct > 0 ? "+" : ""}${result.revisionEstimadosPct}% — sin comparación sectorial suficiente (${peersRev.length} pares con dato). Dato propio informativo.`,
        comparadoConSector: peersRev.length > 0,
      });
    }
  } else {
    pushSenal({
      nombre: "Momentum de revisiones",
      fuerza: "no_disponible",
      detalle: "Sin datos de revisiones de analistas para esta empresa.",
      comparadoConSector: false,
    });
  }

  let conclusion: VentajaCompetitivaCuantitativaResult["conclusion"];
  if (senalesEvaluadas === 0) {
    conclusion = "Evidencia insuficiente";
  } else {
    const ratio = senalesPositivas / senalesEvaluadas;
    conclusion =
      ratio >= UMBRAL_ALTA_EVIDENCIA
        ? "Alta evidencia"
        : ratio >= UMBRAL_EVIDENCIA_MODERADA
          ? "Evidencia moderada"
          : "No concluyente";
  }

  return {
    symbol: result.symbol,
    senales,
    senalesPositivas,
    senalesEvaluadas,
    conclusion,
    coberturaDatos: {
      peersConRdData,
      peersTotal,
      peersConRevisionData,
      periodosHistoricosUsados: Math.max(
        tendenciaMargen.periodosUsados,
        tendenciaGrowth.periodosUsados,
      ),
    },
    advertenciaMetodologica:
      "Esta señal cuantitativa mide la posición relativa de la empresa frente a sus pares del sector y su propia trayectoria histórica. No explica LA CAUSA de la ventaja (innovación, marca, regulatorio, etc.) — para eso, revisar fuentes cualitativas (10-K, noticias, entrevistas a gestión) por separado.",
  };
}
