// Curva de dólar futuro (IOL) + devaluación implícita vs MEP spot.
// Reciclado de clarity-dashboard-main (3)/coronar bases/reporte_cierre_completo.py
// (futuros argentina panel + MEP AL30): convierte la curva de contratos DLR en
// expectativa de devaluación implícita y TNA vs el MEP spot actual.

import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { iolFuturosOperables } from "./iol-cotizaciones";

export interface PuntoCurva {
  simbolo: string;
  vencimiento: string | null;
  dias: number | null;
  precio: number | null;
  tnaImplicitaPct: number | null;
  devaluacionImplicitaPct: number | null;
}

export interface CurvaDolarFuturoResult {
  ok: boolean;
  error?: string;
  mepSpot: number | null;
  puntos: PuntoCurva[];
  devaluacionAnualizada12mPct: number | null;
  fuenteMep: string;
  texto: string;
}

function diasHasta(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.round((d.getTime() - Date.now()) / 86400000));
}

async function mepCriptoYa(): Promise<number | null> {
  try {
    const res = await fetch("https://criptoya.com/api/dolar", {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as any;
    const mep = j?.mep ?? j?.solido ?? null;
    const val = typeof mep === "number" ? mep : Number(mep?.ask ?? mep?.last ?? NaN);
    return isFinite(val) && val > 0 ? val : null;
  } catch {
    return null;
  }
}

export const getCurvaDolarFuturo = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ bearerToken: z.string().optional(), mepOverride: z.number().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<CurvaDolarFuturoResult> => {
    const { z } = await import("zod");
    void z;
    try {
      const futurosRes = await (iolFuturosOperables as any)({ data: { bearerToken: data?.bearerToken } });
      const raw = futurosRes?.data ?? futurosRes;
      const lista: any[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.titulos)
          ? raw.titulos
          : [];
      const mep = data?.mepOverride ?? (await mepCriptoYa());

      // Solo contratos de dólar (DLR/FDI/DO y variantes)
      const dol = lista.filter((f) => /^(DLR|FDI|DO|DOLAR)/i.test(String(f?.simbolo ?? f?.ticker ?? "")));
      const puntos: PuntoCurva[] = [];
      for (const f of dol) {
        const simbolo = String(f.simbolo ?? f.ticker ?? "");
        const precio = Number(f.ultimoPrecio ?? f.ultimo ?? f.cierre ?? NaN);
        const venc = f.vencimiento ?? f.fechaVencimiento ?? null;
        const dias = diasHasta(typeof venc === "string" ? venc.slice(0, 10) : null);
        let tna: number | null = null;
        let dev: number | null = null;
        if (isFinite(precio) && precio > 0 && mep != null && dias != null && dias >= 1) {
          dev = ((precio - mep) / mep) * 100;
          tna = ((precio / mep - 1) * 365) / dias * 100;
        }
        puntos.push({
          simbolo,
          vencimiento: typeof venc === "string" ? venc.slice(0, 10) : null,
          dias,
          precio: isFinite(precio) ? precio : null,
          tnaImplicitaPct: tna != null ? Math.round(tna * 10) / 10 : null,
          devaluacionImplicitaPct: dev != null ? Math.round(dev * 10) / 10 : null,
        });
      }
      puntos.sort((a, b) => (a.dias ?? 9999) - (b.dias ?? 9999));

      // Devaluación anualizada ~12m: interpolación del contrato más cercano a 365d
      let dev12: number | null = null;
      const conDev = puntos.filter((p) => p.devaluacionImplicitaPct != null);
      if (conDev.length) {
        const cercano =
          conDev.reduce((best, p) =>
            Math.abs((p.dias ?? 0) - 365) < Math.abs((best.dias ?? 0) - 365) ? p : best,
          );
        if (cercano.dias != null && cercano.dias > 30) {
          dev12 = Math.round(((cercano.devaluacionImplicitaPct! * 365) / cercano.dias) * 10) / 10;
        }
      }

      const lineas: string[] = ["CURVA DE DÓLAR FUTURO (implícita vs MEP" + (mep != null ? " $" + mep.toFixed(0) : "") + ")"];
      for (const p of puntos) {
        lineas.push(
          `- ${p.simbolo} ${p.vencimiento ?? ""} (${p.dias ?? "?"}d): $${p.precio ?? "?"}` +
            (p.tnaImplicitaPct != null ? ` · TNA ${p.tnaImplicitaPct}% · dev.implícita ${p.devaluacionImplicitaPct}%` : ""),
        );
      }
      if (dev12 != null) lineas.push(`Devaluación implícita anualizada (~12m): ${dev12}%`);
      if (!puntos.length) {
        lineas.push("Sin contratos de dólar disponibles (¿sesión IOL activa? usá iol_login).");
      }

      return {
        ok: puntos.length > 0,
        error: puntos.length ? undefined : "sin datos de futuros",
        mepSpot: mep,
        puntos,
        devaluacionAnualizada12mPct: dev12,
        fuenteMep: "criptoya.com",
        texto: lineas.join("\n"),
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        mepSpot: null,
        puntos: [],
        devaluacionAnualizada12mPct: null,
        fuenteMep: "criptoya.com",
        texto: "SIN RESULTADOS: no se pudo obtener la curva de dólar futuro (" + (e instanceof Error ? e.message : String(e)) + ").",
      };
    }
  });

