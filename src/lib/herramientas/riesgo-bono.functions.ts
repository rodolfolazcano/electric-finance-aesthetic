// src/lib/herramientas/riesgo-bono.functions.ts
// Semáforo de riesgos por bono — 6 factores Elbaum U4
// Tasa, Reinversión, Downgrade/Calificadora, Iliquidez, FX, Inflación
// FREE, sin GPU — usa BONOS_DB unificada + precios IOL + volumen + duración

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { BONOS_DB } from "./bonos-data";
import { calcularRendimientosBono } from "./renta-fija.functions";

type Nivel = 1 | 2 | 3 | 4 | 5; // 1 verde bajo, 5 rojo alto
type Factor = { nombre: string; nivel: Nivel; score: number; justificacion: string; valor?: string };

function clampNivel(v: number): Nivel {
  if (v <= 1.5) return 1;
  if (v <= 2.5) return 2;
  if (v <= 3.5) return 3;
  if (v <= 4.5) return 4;
  return 5;
}

export const getSemaforoRiesgoBono = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ticker: z.string().min(2),
      sessionId: z.string().optional(),
      precioPorCada100VN: z.number().positive().optional(),
      horizonteDias: z.number().int().min(1).max(3650).optional(),
    })
  )
  .handler(async ({ data }) => {
    const ticker = data.ticker.toUpperCase();
    const bono: any = (BONOS_DB as any)[ticker];
    if (!bono) throw new Error(`Bono ${ticker} no encontrado`);

    // Rendimientos vivos para duration/convexidad/intereses
    let rend: any = null;
    try {
      rend = await (calcularRendimientosBono as any)({
        data: {
          ticker,
          precioPorCada100VN: data.precioPorCada100VN,
          sessionId: data.sessionId,
        },
      });
      // createServerFn en este contexto puede devolver Response; si es así, intentar parse
      if (rend && typeof rend.json === "function") rend = await rend.json();
      if (rend && rend.tir == null && rend.data) rend = rend.data;
    } catch (e) {
      rend = null;
    }
    // Fallback si no se pudo calcular
    const durationMod = rend?.durationModificada ?? rend?.durationMacaulay ?? 5;
    const tir = rend?.tir ?? rend?.tea ?? 0.15;
    const convexity = rend?.convexity ?? 0;
    const precio = data.precioPorCada100VN ?? rend?.precio ?? 55;
    const tipo = (bono.tipo as string) ?? "Hard Dollar";
    const ajuste = bono.ajuste as string | null;
    const ley = bono.ley as string;
    const cuponAnual = bono.cuponAnual ?? 0;
    const volumenPesos = (bono as any).volumen_diario_pesos ?? bono.montoEmision ?? 0;
    const vencimiento = bono.vencimiento as string;
    const diasAlVto = Math.max(1, (new Date(vencimiento).getTime() - Date.now()) / 86400000);

    const factores: Factor[] = [];

    // 1) Riesgo tasa — duration modificada + convexidad
    // Nivel 1: <2, 2:2-4, 3:4-7, 4:7-10, 5:>10 o convexidad alta
    {
      const d = Math.abs(durationMod ?? 5);
      let nivel = d < 2 ? 1 : d < 4 ? 2 : d < 7 ? 3 : d < 10 ? 4 : 5;
      if (convexity > 80) nivel = Math.min(5, nivel + 1) as Nivel;
      factores.push({
        nombre: "Tasa",
        nivel: nivel as Nivel,
        score: d,
        valor: `Dur.Mod ${d.toFixed(2)}y Convex ${convexity?.toFixed(0) ?? "N/D"}`,
        justificacion: d < 2 ? "Corta — baja sensibilidad a suba de tasas" : d > 7 ? "Larga — alta sensibilidad, cae fuerte si sube TIR" : "Media — sensibilidad moderada",
      });
    }

    // 2) Reinversión — cupón alto + tasa alta = alto reinversión; bullet con cupón bajo = bajo
    {
      const cupon = cuponAnual ?? 0;
      const reinvScore = cupon * (tir > 0 ? tir : 0.15) * 10;
      const nivel = cupon < 2 ? 1 : cupon < 4 ? 2 : cupon < 6 ? 3 : cupon < 8 ? 4 : 5;
      factores.push({
        nombre: "Reinversión",
        nivel: nivel as Nivel,
        score: reinvScore,
        valor: `Cupón ${cupon.toFixed(2)}% TIR ${(tir*100).toFixed(1)}%`,
        justificacion: cupon < 2 ? "Cero/LECAP — nulo" : cupon > 6 ? "Cupón alto — si baja tasa, reinviertes más barato" : "Medio",
      });
    }

    // 3) Downgrade / Calificadora — proxy por ley + liquidez + ajuste
    {
      const esNY = ley === "Nueva_York" || ley === "extranjera";
      const califBase = esNY ? 2 : 3; // NY más seguro
      const ajustePenal = ajuste === "CER" ? 0 : 0; // CER no penaliza
      const nivel = clampNivel(califBase + ajustePenal + (tipo === "LECAP" ? -0.5 : 0));
      factores.push({
        nombre: "Downgrade/Calif.",
        nivel,
        score: califBase,
        valor: `Ley ${ley} ${bono.calificacion ?? ""}`.trim(),
        justificacion: esNY ? "Ley NY — menor riesgo jurisdiccional" : "Ley Argentina — prima soberana",
      });
    }

    // 4) Iliquidez — volumen diario + tipo
    {
      const vol = Number(volumenPesos) || 0;
      let nivel: Nivel = 5;
      if (vol > 80000000000) nivel = 1;
      else if (vol > 40000000000) nivel = 2;
      else if (vol > 15000000000) nivel = 3;
      else if (vol > 5000000000) nivel = 4;
      else nivel = 5;
      // Ajuste por tipo: soberano Hard Dollar es más líquido que ON
      if (tipo.includes("ON")) nivel = Math.min(5, nivel + 1) as Nivel;
      factores.push({
        nombre: "Iliquidez",
        nivel,
        score: vol,
        valor: vol > 0 ? `$${(vol/1e9).toFixed(1)}B/día` : "N/D",
        justificacion: nivel <= 2 ? "Alta liquidez — spread bajo" : nivel >= 4 ? "Baja — spread/ejecución peor" : "Media",
      });
    }

    // 5) FX — Hard Dollar / Dollar-Linked vs ARS
    {
      const esUSD = bono.moneda === "USD" || bono.monedaFlujos === "USD";
      const esLinked = ajuste === "DolarOficial";
      let nivel: Nivel = 3;
      let valor = esUSD ? "USD" : "ARS";
      if (esLinked) { nivel = 4; valor = "USD Linked"; }
      else if (!esUSD) { nivel = 2; valor = "ARS"; }
      else { nivel = 4; valor = "USD Hard"; }
      factores.push({
        nombre: "FX",
        nivel,
        score: esUSD ? 1 : 0,
        valor,
        justificacion: esUSD ? "Expuesto a devaluación/cepo si cobrás en ARS" : "Sin FX directo, pero expuesto a inflación",
      });
    }

    // 6) Inflación — CER vs nominal
    {
      const esCER = ajuste === "CER";
      const nivel: Nivel = esCER ? 2 : 4;
      factores.push({
        nombre: "Inflación",
        nivel,
        score: esCER ? 0 : 1,
        valor: esCER ? "CER ajustado" : `Nominal ${cuponAnual.toFixed(2)}%`,
        justificacion: esCER ? "Cubierto CER — protege poder adquisitivo" : "Nominal — pierde si inflación > TNA",
      });
    }

    const scoreProm = factores.reduce((a, f) => a + f.nivel, 0) / factores.length;
    const nivelGlobal = clampNivel(scoreProm);
    const semaforo = nivelGlobal <= 2 ? "VERDE" : nivelGlobal <= 3 ? "AMARILLO" : nivelGlobal <= 4 ? "NARANJA" : "ROJO";

    return {
      ticker,
      descripcion: bono.descripcion ?? bono.nombre ?? ticker,
      vencimiento,
      precio,
      tir: tir != null ? tir : null,
      durationMod,
      factores,
      scoreProm: Number(scoreProm.toFixed(2)),
      nivelGlobal,
      semaforo,
      timestamp: new Date().toISOString(),
    };
  });
