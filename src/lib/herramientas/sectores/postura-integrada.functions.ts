// Diagnóstico INTEGRADO "¿dónde posicionarse?" — reciclado de
// clarity-dashboard-main (3)/coronar bases/intermarket_cycle_detector.py §8:
// fusión fase Murphy-Pring + alerta crediticia + consumidor + VIX + curva +
// flight-to-quality → balance bull/bear ponderado → postura de 5 niveles.
// Insumos: getDecouplingMonitor() y getIntermarketRatios() (ya portados).

import { createServerFn } from "@tanstack/react-start";
import { getDecouplingMonitor, type CreditAlertLevel } from "./decoupling-monitor.functions";
import { getIntermarketRatios } from "@/lib/sectores/internarket-ratios.functions";
import { consultarNoticias } from "@/lib/noticias.server";
import { leerEstado } from "@/lib/scanner-intermarket.server";

export interface ValidacionNoticias {
  titulos: number;
  apoyos: number;
  contradicciones: number;
  pctApoyo: number | null;
  veredicto: string;
}

export interface FactorPostura {
  direccion: "bull" | "bear";
  peso: number;
  texto: string;
}

export interface PosturaIntegradaResult {
  ok: boolean;
  error?: string;
  faseBaseStage: number | null;
  faseIntegradaStage: number | null;
  modificadaPorCredito: boolean;
  creditAlert: CreditAlertLevel;
  bull: number;
  bear: number;
  neto: number;
  postura: string;
  posturaDesc: string;
  comprar: string[];
  vender: string[];
  factores: FactorPostura[];
  riesgosRegimen?: { desacopleDeflacionario: boolean; flightToQuality: boolean };
  validacion?: ValidacionNoticias;
  texto: string;
}

const POSTURAS: Record<string, { desc: string; comprar: string[]; vender: string[] }> = {
  AGRESIVO_RISK_ON: {
    desc: "Todas las señales alcistas. Sobreponderar acciones, cíclicos y small caps.",
    comprar: ["XLK", "XLY", "IWM", "XLF", "QQQ"],
    vender: ["XLP", "XLU", "TLT"],
  },
  RISK_ON_MODERADO: {
    desc: "Señales mayormente alcistas pero con advertencias crediticias.",
    comprar: ["XLI", "XLB", "XLF", "COPX", "XLE"],
    vender: ["XLP", "XLU", "TLT", "LQD"],
  },
  CAUTELA_DEFENSIVA: {
    desc: "Señales mixtas con riesgo crediticio elevado. Postura defensiva.",
    comprar: ["XLE", "GLD", "XLV", "XLU", "BIL/SGOV"],
    vender: ["XLK", "XLY", "HYG", "LQD", "IWM"],
  },
  DEFENSIVO_REDUCIR: {
    desc: "Reducir riesgo: dominan las señales bajistas.",
    comprar: ["TLT", "GLD", "XLP", "XLU", "XLV", "BIL"],
    vender: ["Acciones", "HY", "Commodities", "IG largos"],
  },
  RISK_OFF_CAJA: {
    desc: "Preservación de capital: solo calidad máxima y caja.",
    comprar: ["TLT", "GLD", "Cash"],
    vender: ["Todo riesgo"],
  },
};

function posturaPorNeto(neto: number): { nombre: string; key: string } {
  if (neto >= 4) return { nombre: "AGRESIVO RISK-ON", key: "AGRESIVO_RISK_ON" };
  if (neto >= 1) return { nombre: "RISK-ON MODERADO", key: "RISK_ON_MODERADO" };
  if (neto >= -2) return { nombre: "CAUTELA DEFENSIVA", key: "CAUTELA_DEFENSIVA" };
  if (neto >= -4) return { nombre: "DEFENSIVO / REDUCIR RIESGO", key: "DEFENSIVO_REDUCIR" };
  return { nombre: "RISK-OFF / CAJA", key: "RISK_OFF_CAJA" }
}

const ETIQUETAS_STAGE = [
  "Bottom (deterioro tardío)",
  "Early Recovery / Reflación",
  "Mid Expansion",
  "Late Expansion",
  "Slowdown / Desaceleración",
  "Contracción",
];

async function vixActual(): Promise<number | null> {
  try {
    const mod: any = await import("yahoo-finance2");
    const YF = mod.default ?? mod;
    let inst: any;
    try {
      inst = new YF({ suppressNotices: ["yahooSurvey", "ripHistorical"] });
    } catch {
      inst = typeof YF === "function" ? new YF() : YF;
    }
    const q = await inst.quote("^VIX");
    const v = Array.isArray(q) ? q[0] : q;
    return typeof v?.regularMarketPrice === "number" ? v.regularMarketPrice : null;
  } catch {
    return null;
  }
}

const KW_BULL = [
  "sube", "suben", "rally", "alza", "alzas", "record", "récord", "máximos", "optimismo",
  "expansión", "ganancias", "compra", "soars", "jumps", "rises", "gains", "bullish",
  "optimism", "recovery", "crecimiento", "fortalece", "repunte",
];
const KW_BEAR = [
  "cae", "caen", "caída", "desploma", "corrección", "mínimos", "miedos", "recesión",
  "venta", "sell-off", "selloff", "plunges", "tumbles", "falls", "fears", "bearish",
  "recession", "weakness", "crisis", "default", "riesgo", "stress", "colapso",
];

function clasificarTitulo(title: string): "apoyo" | "contradiccion" | "neutral" {
  const t = title.toLowerCase();
  let b = 0;
  let x = 0;
  for (const k of KW_BULL) if (t.includes(k)) b++;
  for (const k of KW_BEAR) if (t.includes(k)) x++;
  if (b > x) return "apoyo";
  if (x > b) return "contradiccion";
  return "neutral";
}

/** Capa anti-sesgo (reciclado §9 detector): ¿los titulares confirman la postura? */
async function validarConNoticias(neto: number): Promise<ValidacionNoticias> {
  const vacio: ValidacionNoticiaS = { titulos: 0, apoyos: 0, contradicciones: 0, pctApoyo: null, veredicto: "sin datos" };
  try {
    const sesgo = neto >= 0 ? "mercado accionario rally expansión" : "mercado corrección riesgo recesión crédito";
    const consultas = [sesgo, "bolsa indices credit spreads"];
    const titulosSet = new Set<string>();
    for (const c of consultas) {
      const r = await consultarNoticias(c, "semana").catch(() => null);
      for (const f of r?.fuentes ?? []) {
        const t = (f.title ?? "").trim();
        if (t.length > 25) titulosSet.add(t);
      }
      if (titulosSet.size >= 20) break;
    }
    let apoyos = 0;
    let contra = 0;
    for (const t of titulosSet) {
      const c = clasificarTitulo(t);
      if (c === "apoyo") apoyos++;
      else if (c === "contradiccion") contra++;
    }
    const denom = apoyos + contra;
    const pct = denom > 0 ? Math.round((apoyos / denom) * 100) : null;
    let veredicto = "titulares neutrales — sin señal clara";
    if (pct != null) {
      veredicto =
        pct >= 80 ? "las noticias CONFIRMAN la postura"
        : pct >= 60 ? "mayormente alineada con la postura"
        : pct >= 40 ? "señal MIXTA — cautela adicional"
        : "las noticias CONTRADICEN la postura — revisar premisas";
    }
    return { titulos: titulosSet.size, apoyos, contradicciones: contra, pctApoyo: pct, veredicto };
  } catch {
    return vacio;
  }
}
type ValidacionNoticiaS = ValidacionNoticias;

export const getDiagnosticoIntegrado = createServerFn({ method: "GET" }).handler(
  async (): Promise<PosturaIntegradaResult> => {
    try {
      const [monitorRes, ratiosRes] = await Promise.all([
        (getDecouplingMonitor as any)(),
        (getIntermarketRatios as any)(),
      ]);
      const monitor = monitorRes?.data ?? monitorRes;
      const ratios = ratiosRes?.data ?? ratiosRes;

      const stageBase: number | null =
        typeof ratios?.arrows?.stage === "number" ? ratios.arrows.stage : null;
      const creditAlert: CreditAlertLevel = monitor?.creditCycle?.alertLevel ?? "NONE";

      // Modificador crediticio sobre la fase (Murphy: crédito lidera equities)
      let stageInt = stageBase;
      let modificada = false;
      if (creditAlert === "CRITICAL" && stageBase != null && stageBase <= 2) {
        stageInt = Math.min(3, stageBase + 1);
        modificada = true;
      }

      const factores: FactorPostura[] = [];
      let bull = 0;
      let bear = 0;

      // 1) CICLO (peso mayor)
      if (stageInt != null) {
        if (stageInt <= 1) {
          bull += 3;
          factores.push({ direccion: "bull", peso: 3, texto: "Early Recovery → riesgo recompensado" });
        } else if (stageInt === 2) {
          bull += 2;
          factores.push({ direccion: "bull", peso: 2, texto: "Mid Expansion → crecimiento sólido" });
        } else if (stageInt === 3) {
          bull += 1;
          factores.push({ direccion: "bear", peso: 1, texto: "Late Expansion — mercado angosto, precaución" });
        } else {
          bear += 3;
          factores.push({ direccion: "bear", peso: 3, texto: "Contracción — riesgo de recesión" });
        }
      }

      // 2) CRÉDITO (modificador principal)
      const igPct = monitor?.creditCycle?.igPercentil;
      const hyPct = monitor?.creditCycle?.hyPercentil;
      const pctTxt =
        igPct != null && hyPct != null
          ? " (IG " + Math.round(igPct * 100) + "%, HY " + Math.round(hyPct * 100) + "%)"
          : "";
      if (creditAlert === "CRITICAL") {
        bear += 3;
        factores.push({ direccion: "bear", peso: 3, texto: "Crédito en complacencia extrema" + pctTxt + " → spreads extremos = final de ciclo" });
      } else if (creditAlert === "WARNING") {
        bear += 1;
        factores.push({ direccion: "bear", peso: 1, texto: "Crédito elevado — monitorear" });
      }

      // 3) CONSUMIDOR (XLY/XLP)
      const consNivel = monitor?.consumerCyclical?.nivel ?? null;
      if (consNivel === "alto" || consNivel === "critico") {
        bear += 2;
        factores.push({ direccion: "bear", peso: 2, texto: "Defensivos dominan al consumidor (XLY/XLP débil)" });
      } else if (consNivel === "bajo") {
        bull += 1;
        factores.push({ direccion: "bull", peso: 1, texto: "Consumidor fuerte (XLY/XLP competitivo)" });
      }

      // 4) VIX
      const vix = await vixActual();
      if (vix != null && vix > 30) {
        bear += 2;
        factores.push({ direccion: "bear", peso: 2, texto: "VIX=" + Math.round(vix) + " — pánico" });
      } else if (vix != null && vix < 15) {
        bear += 1;
        factores.push({ direccion: "bear", peso: 1, texto: "VIX=" + Math.round(vix) + " — complacencia, riesgo de reversión" });
      }

      // 5) CURVA
      if (monitor?.yieldCurve?.invertida) {
        bear += 2;
        factores.push({ direccion: "bear", peso: 2, texto: "Curva invertida — señal clásica de recesión" });
      }

      // 6) RIESGOS DE RÉGIMEN
      const rr = monitor?.riesgosRegimen;
      if (rr?.flightToQuality) {
        bear += 2;
        factores.push({ direccion: "bear", peso: 2, texto: "Flight to quality HY→TLT activo" });
      }

      const neto = bull - bear;
      const p = posturaPorNeto(neto);
      const meta = POSTURAS[p.key]!;
      const validacion = await validarConNoticias(neto);

      const lineas: string[] = [];
      lineas.push("DIAGNÓSTICO INTEGRADO — ¿dónde posicionarse?");
      lineas.push("");
      const etiquetaFase =
        stageBase != null
          ? ETIQUETAS_STAGE[stageInt ?? 0] + " (" + stageBase + ")"
          : "s/d";
      lineas.push(
        "Fase Murphy-Pring base→integrada: " + etiquetaFase +
          (modificada ? " [AJUSTADA por crédito CRITICAL]" : ""),
      );
      lineas.push("Alerta crediticia: " + creditAlert);
      lineas.push("Balance: bull " + bull + " | bear " + bear + " | NETO " + (neto >= 0 ? "+" : "") + neto);
      lineas.push("");
      if (factores.some((f) => f.direccion === "bull")) {
        lineas.push("A FAVOR:");
        for (const f of factores.filter((x) => x.direccion === "bull")) lineas.push(" + " + f.texto);
      }
      if (factores.some((f) => f.direccion === "bear")) {
        lineas.push("EN CONTRA:");
        for (const f of factores.filter((x) => x.direccion === "bear")) lineas.push(" - " + f.texto);
      }
      lineas.push("");
      lineas.push("POSTURA RECOMENDADA: " + p.nombre);
      lineas.push(meta.desc);
      lineas.push("COMPRAR/SOBREPONDER: " + meta.comprar.join(", "));
      lineas.push("VENDER/INFRAPONDERAR: " + meta.vender.join(", "));
      if (rr?.desacopleDeflacionario) {
        lineas.push("");
        lineas.push("AVISO DE RÉGIMEN: desacople deflacionario (TLT-SPY corr < -0.3) — el modelo intermarket estándar pierde validez.");
      }
      lineas.push("");
      if (validacion.titulos > 0) {
        lineas.push("VALIDACIÓN POR NOTICIAS (" + validacion.titulos + " titulares): " + validacion.veredicto +
          (validacion.pctApoyo != null ? " — " + validacion.pctApoyo + "% apoyan el sesgo" : ""));
        lineas.push("");
      }
      try {
        const sc = leerEstado();
        if (sc && sc.vivo) {
          lineas.push("SCANNER INTERMARKET (vivo, " + (sc.fase?.name ?? "s/d") + " conf " + (sc.fase?.conf ?? "?") + ") — " + sc.senales.length + " señales activas");
          if (sc.credito) lineas.push(" Scanner crédito: IG " + (sc.credito.IG?.pct ?? "?") + "% [" + (sc.credito.IG?.nivel ?? "?") + "] · HY " + (sc.credito.HY?.pct ?? "?") + "% [" + (sc.credito.HY?.nivel ?? "?") + "]");
          lineas.push("");
        }
      } catch { /* scanner opcional */ }
      lineas.push("Educativo — no recomendación personalizada. Fuente: Yahoo Finance + motor intermarket CORONAR.");

      return {
        ok: true,
        faseBaseStage: stageBase,
        faseIntegradaStage: stageInt,
        modificadaPorCredito: modificada,
        creditAlert,
        bull,
        bear,
        neto,
        postura: p.nombre,
        posturaDesc: meta.desc,
        comprar: meta.comprar,
        vender: meta.vender,
        factores,
        validacion,
        riesgosRegimen: rr
          ? { desacopleDeflacionario: rr.desacopleDeflacionario, flightToQuality: rr.flightToQuality }
          : undefined,
        texto: lineas.join("\n"),
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        faseBaseStage: null,
        faseIntegradaStage: null,
        modificadaPorCredito: false,
        creditAlert: "NONE",
        bull: 0,
        bear: 0,
        neto: 0,
        postura: "S/D",
        posturaDesc: "No se pudo calcular la postura integrada.",
        comprar: [],
        vender: [],
        factores: [],
        texto: "SIN RESULTADOS: no se pudo computar el diagnóstico integrado (" + (e instanceof Error ? e.message : String(e)) + ").",
      };
    }
  },
);
