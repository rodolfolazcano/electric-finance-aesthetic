// src/lib/herramientas/portafolio-tir.functions.ts
// TIR / Total Return agregada de portafolio RF — Elbaum U4
// Pondera TIR/TEA/duration de cada bono por valorMercado USD/ARS
// Usa renta-fija.functions calcularRendimientosBono + BONOS_DB unificada

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { BONOS_DB } from "./bonos-data";
import { calcularRendimientosBono } from "./renta-fija.functions";

export type PosicionTIR = {
  ticker: string;
  cantidad: number; // nominal VN
  precioPorCada100VN?: number; // opcional, si no usa vivo IOL
};

export const calcularTIRPortafolio = createServerFn({ method: "POST" })
  .validator(
    z.object({
      posiciones: z.array(
        z.object({
          ticker: z.string().min(2),
          cantidad: z.number().positive(),
          precioPorCada100VN: z.number().positive().optional(),
        })
      ).min(1).max(50),
      sessionId: z.string().optional(),
      horizonteDias: z.number().int().min(1).max(3650).optional(),
      tasaReinversionTEA: z.number().min(-0.9).max(5).optional(),
    })
  )
  .handler(async ({ data }) => {
    const detalles: Array<{
      ticker: string;
      descripcion: string;
      vencimiento: string;
      cantidad: number;
      precio: number;
      valorMercado: number;
      peso: number;
      tir: number | null;
      tea: number | null;
      tna: number | null;
      durationMod: number | null;
      convexity: number | null;
      error?: string;
    }> = [];

    let totalValor = 0;
    const rendCache = new Map<string, any>();

    for (const p of data.posiciones) {
      const ticker = p.ticker.toUpperCase();
      const bono: any = (BONOS_DB as any)[ticker];
      if (!bono) {
        detalles.push({
          ticker,
          descripcion: "No encontrado",
          vencimiento: "",
          cantidad: p.cantidad,
          precio: p.precioPorCada100VN ?? 0,
          valorMercado: 0,
          peso: 0,
          tir: null,
          tea: null,
          tna: null,
          durationMod: null,
          convexity: null,
          error: "Ticker no en BONOS_DB unificada",
        });
        continue;
      }
      let rend: any = null;
      try {
        rend = await (calcularRendimientosBono as any)({
          data: { ticker, precioPorCada100VN: p.precioPorCada100VN, sessionId: data.sessionId },
        });
        if (rend && typeof rend.json === "function") rend = await rend.json();
        if (rend?.data) rend = rend.data;
      } catch (e) {
        rend = { error: String(e).slice(0, 120) };
      }
      const precio = p.precioPorCada100VN ?? rend?.precio ?? 55;
      const valorMercado = (p.cantidad * precio) / 100;
      totalValor += valorMercado;
      rendCache.set(ticker, rend);
      detalles.push({
        ticker,
        descripcion: bono.descripcion ?? bono.nombre ?? ticker,
        vencimiento: bono.vencimiento,
        cantidad: p.cantidad,
        precio,
        valorMercado,
        peso: 0, // se calcula luego
        tir: rend?.tir ?? null,
        tea: rend?.tea ?? null,
        tna: rend?.tna ?? null,
        durationMod: rend?.durationModificada ?? rend?.durationMacaulay ?? null,
        convexity: rend?.convexity ?? null,
        error: rend?.error,
      });
    }

    // Pesos
    for (const d of detalles) d.peso = totalValor > 0 ? d.valorMercado / totalValor : 0;

    // Agregados ponderados (solo donde hay tir)
    const conTIR = detalles.filter((d) => d.tir != null && d.tea != null);
    const pctConTIR = totalValor > 0 ? conTIR.reduce((a, d) => a + d.valorMercado, 0) / totalValor : 0;
    const tirPond = conTIR.reduce((a, d) => a + (d.tir as number) * d.peso, 0);
    const teaPond = conTIR.reduce((a, d) => a + (d.tea as number) * d.peso, 0);
    const tnaPond = conTIR.reduce((a, d) => a + (d.tna as number) * (d.peso ?? 0), 0);
    const durationPond = conTIR.reduce((a, d) => a + (d.durationMod ?? 0) * d.peso, 0);
    const convexityPond = conTIR.reduce((a, d) => a + (d.convexity ?? 0) * d.peso, 0);

    // Total Return agregado con horizonte (opcional)
    let trAgregado: { valorTotal: number; tr: number | null; trAnual: number | null } | null = null;
    if (data.horizonteDias && data.tasaReinversionTEA != null) {
      // Aproximación: TR agregado = Σ peso * TR individual (si tuviéramos TR por bono)
      // Para MVP usamos TEA ponderada * horizonte como proxy
      const anos = data.horizonteDias / 365;
      const trProxy = teaPond != null ? Math.pow(1 + teaPond, anos) - 1 : null;
      trAgregado = {
        valorTotal: totalValor * (trProxy != null ? 1 + trProxy : 1),
        tr: trProxy,
        trAnual: teaPond,
      };
    }

    const porTipo = new Map<string, number>();
    const porMoneda = new Map<string, number>();
    for (const d of detalles) {
      const bono: any = (BONOS_DB as any)[d.ticker];
      const tipo = bono?.tipo ?? "Desconocido";
      const moneda = bono?.moneda ?? "ARS";
      porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + d.peso);
      porMoneda.set(moneda, (porMoneda.get(moneda) ?? 0) + d.peso);
    }

    return {
      posiciones: detalles,
      totalValor,
      pctConTIR,
      agregados: {
        tirPonderada: conTIR.length ? tirPond : null,
        teaPonderada: conTIR.length ? teaPond : null,
        tnaPonderada: conTIR.length ? tnaPond : null,
        durationPonderada: conTIR.length ? durationPond : null,
        convexityPonderada: conTIR.length ? convexityPond : null,
        trAgregado,
      },
      composicion: {
        porTipo: [...porTipo.entries()].map(([nombre, pct]) => ({ nombre, pct })),
        porMoneda: [...porMoneda.entries()].map(([moneda, pct]) => ({ moneda, pct })),
      },
      timestamp: new Date().toISOString(),
    };
  });
