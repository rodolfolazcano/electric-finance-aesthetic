// src/lib/monitor-macro.functions.ts
// Monitor de Riesgo País y Macro Argentina (Herramienta 6)

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface MacroKPI {
  key: string;
  label: string;
  value: number | null;
  valueFormatted: string;
  variation30d: number | null;
  variationPct: string;
  trend: "up" | "down" | "stable";
  semaforo: "verde" | "amarillo" | "rojo";
  sparkline: number[];
  unit: string;
}

export interface TipoCambioItem {
  casa: string;
  compra: number | null;
  venta: number | null;
  variacion: number | null;
  brecha: number | null;
}

export interface MonitorMacroResult {
  kpis: MacroKPI[];
  tiposCambio: TipoCambioItem[];
  inflacionMensual: { fecha: string; valor: number }[];
  timestamp: string;
}

async function fetchJson(url: string, timeout = 8000): Promise<any | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const r = await fetch(url, { cache: "no-store", signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function semaforoRiesgoPais(valor: number): "verde" | "amarillo" | "rojo" {
  if (valor < 800) return "verde";
  if (valor < 1500) return "amarillo";
  return "rojo";
}

function semaforoInflacion(valor: number): "verde" | "amarillo" | "rojo" {
  if (valor < 60) return "verde";
  if (valor < 100) return "amarillo";
  return "rojo";
}

function semaforoBrecha(valor: number): "verde" | "amarillo" | "rojo" {
  if (valor < 20) return "verde";
  if (valor < 50) return "amarillo";
  return "rojo";
}

function trend(arr: number[]): "up" | "down" | "stable" {
  if (arr.length < 2) return "stable";
  const first = arr[0];
  const last = arr[arr.length - 1];
  if (first === 0) return "stable";
  const change = (last - first) / first;
  if (change > 0.005) return "up";
  if (change < -0.005) return "down";
  return "stable";
}

export const getMonitorMacro = createServerFn({ method: "GET" })
  .validator(z.object({}))
  .handler(async (): Promise<MonitorMacroResult> => {
    const AD = "https://api.argentinadatos.com";
    const kpis: MacroKPI[] = [];
    const tiposCambio: TipoCambioItem[] = [];
    let inflacionMensual: { fecha: string; valor: number }[] = [];

    // 1. Riesgo País
    let rpData: any[] | null = null;
    try {
      const [ultimo, historico] = await Promise.all([
        fetchJson(`${AD}/v1/finanzas/indices/riesgo-pais/ultimo`),
        fetchJson(`${AD}/v1/finanzas/indices/riesgo-pais`),
      ]);
      if (Array.isArray(ultimo) && ultimo.length) rpData = ultimo;
      if (Array.isArray(historico) && historico.length) {
        const ultimos90 = historico.slice(-90);
        const sparkline = ultimos90.map((d: any) => d.valor ?? 0).filter((v: number) => v > 0);
        const ultimo = sparkline[sparkline.length - 1];
        const hace30 = sparkline[Math.max(0, sparkline.length - 30)];
        const var30 = hace30 > 0 ? ((ultimo - hace30) / hace30) * 100 : null;
        kpis.push({
          key: "riesgo_pais",
          label: "Riesgo País",
          value: ultimo,
          valueFormatted: ultimo != null ? Math.round(ultimo).toLocaleString("es-AR") : "—",
          variation30d: var30,
          variationPct: var30 != null ? `${var30 >= 0 ? "+" : ""}${var30.toFixed(1)}%` : "—",
          trend: trend(sparkline),
          semaforo: ultimo != null ? semaforoRiesgoPais(ultimo) : "amarillo",
          sparkline,
          unit: "pts",
        });
      }
    } catch {
      /* noop */
    }

    // 2. Inflación interanual
    try {
      const arr = await fetchJson(`${AD}/v1/finanzas/indices/inflacionInteranual`);
      if (Array.isArray(arr) && arr.length) {
        const ultimo = arr[arr.length - 1];
        const valor = ultimo?.valor ?? null;
        inflacionMensual = (await fetchJson(`${AD}/v1/finanzas/indices/inflacion`)) ?? [];
        const ultimos12 = inflacionMensual.slice(-12);
        const acumulada12m =
          ultimos12.reduce((acc: number, m: any) => acc * (1 + (m.valor ?? 0) / 100), 1) - 1;
        const acumuladaPct = acumulada12m * 100;
        kpis.push({
          key: "inflacion",
          label: "Inflación interanual",
          value: valor,
          valueFormatted: valor != null ? `${valor.toFixed(1)}%` : "—",
          variation30d: null,
          variationPct: `Acum. 12m: ${acumuladaPct.toFixed(1)}%`,
          trend: valor != null && valor > 50 ? "down" : "stable",
          semaforo: valor != null ? semaforoInflacion(valor) : "amarillo",
          sparkline: inflacionMensual.slice(-12).map((d: any) => d.valor ?? 0),
          unit: "%",
        });
      }
    } catch {
      /* noop */
    }

    // 3. Tipos de cambio + Brecha
    let oficialVenta = 0;
    try {
      const dolares = await fetchJson(`${AD}/v1/cotizaciones/dolares`);
      if (Array.isArray(dolares)) {
        const casas = [
          "oficial",
          "blue",
          "bolsa",
          "contadoconliqui",
          "cripto",
          "mayorista",
          "solidario",
          "turista",
        ];
        const grouped: Record<string, any[]> = {};
        for (const d of dolares) {
          if (!grouped[d.casa]) grouped[d.casa] = [];
          grouped[d.casa].push(d);
        }
        for (const casa of casas) {
          const items = grouped[casa] ?? [];
          if (items.length === 0) continue;
          const sorted = items.sort(
            (a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
          );
          const ultimo = sorted[0];
          const ayer = sorted.length > 1 ? sorted[1] : null;
          const venta = ultimo?.venta ?? null;
          const compra = ultimo?.compra ?? null;
          if (casa === "oficial" && venta) oficialVenta = venta;
          const variacion = ayer?.venta && venta ? ((venta - ayer.venta) / ayer.venta) * 100 : null;
          const brecha = oficialVenta > 0 && venta ? (venta / oficialVenta - 1) * 100 : null;
          tiposCambio.push({
            casa: casa.charAt(0).toUpperCase() + casa.slice(1),
            compra,
            venta,
            variacion,
            brecha,
          });
        }
      }
    } catch {
      /* noop */
    }

    // 4. Brecha cambiaria KPI
    const blueTC = tiposCambio.find((t) => t.casa === "Blue");
    if (blueTC && blueTC.brecha != null) {
      kpis.push({
        key: "brecha",
        label: "Brecha cambiaria",
        value: blueTC.brecha,
        valueFormatted: `${blueTC.brecha.toFixed(1)}%`,
        variation30d: null,
        variationPct: `Blue: $${blueTC.venta ?? "?"} / Oficial: $${oficialVenta || "?"}`,
        trend: blueTC.brecha > 30 ? "up" : "stable",
        semaforo: semaforoBrecha(blueTC.brecha),
        sparkline: [],
        unit: "%",
      });
    }

    // 5. Merval (proxy via BCRA if available, else skip)
    // Using ArgentinaDatos doesn't have Merval, so we skip or use placeholder

    // 6. Reservas (BCRA)
    try {
      const arr = await fetchJson("https://api.estadisticasbcra.com/reservas");
      if (Array.isArray(arr) && arr.length) {
        const ultimos30 = arr.slice(-30);
        const sparkline = ultimos30.map((d: any) => d.v ?? 0);
        const ultimo = sparkline[sparkline.length - 1] / 1000; // Convert to billions
        const hace30 = sparkline[0] / 1000;
        const var30 = hace30 > 0 ? ((ultimo - hace30) / hace30) * 100 : null;
        kpis.push({
          key: "reservas",
          label: "Reservas BCRA",
          value: ultimo,
          valueFormatted: `USD ${ultimo.toFixed(1)}B`,
          variation30d: var30,
          variationPct: var30 != null ? `${var30 >= 0 ? "+" : ""}${var30.toFixed(1)}%` : "—",
          trend: trend(sparkline),
          semaforo: ultimo > 30 ? "verde" : ultimo > 20 ? "amarillo" : "rojo",
          sparkline,
          unit: "USD B",
        });
      }
    } catch {
      /* noop */
    }

    return { kpis, tiposCambio, inflacionMensual, timestamp: new Date().toISOString() };
  });
