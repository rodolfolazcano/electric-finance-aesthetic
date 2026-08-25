// CAPM batch BCBA vs ^MERV con guardrails anti-datos-malos.
// Reciclado de clarity-dashboard-main (3)/coronar bases/
//   "CAPM LOCALES VS MERVAL - FACTORES.PY" (líneas ~366-430, 700-810):
//   screening consolidado de locales + defensas: |β|>5 outlier flag,
//   NaN>20% detector de corrupción, sanity-check de referencia (GGAL R²).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ejecutarCAPM } from "@/lib/agents/ejecutores";

const LIQUIDAS_BCBA = [
  "GGAL", "YPF", "PAMP", "BMA", "VALO", "SUPV", "BBAR", "COME",
  "TGNO4", "ALUA", "MIRG", "CRES", "EDN", "LOMA", "TRAN",
  "BYMA", "CEPU", "CAPU", "DYCA", "IRSA",
];

export interface FilaCapmBcba {
  ticker: string;
  beta: number | null;
  alphaAnualPct: number | null;
  r2: number | null
  significativo95: boolean | null;
  outlierBeta: boolean;
  ok: boolean;
}

export interface CapmBatchBcbaResult {
  ok: boolean;
  error?: string;
  filas: FilaCapmBcba[];
  outliers: string[];
  texto: string;
}

function pct(v: number | null | undefined): string {
  return v == null || !isFinite(v) ? "s/d" : (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}
function n2(v: number | null | undefined): string {
  return v == null || !isFinite(v) ? "s/d" : v.toFixed(2);
}

export const getCapmBatchBcba = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        tickers: z.array(z.string()).max(30).optional(),
        r2SanityMinimo: z.number().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<CapmBatchBcbaResult> => {
    try {
      const tickers = data?.tickers?.length ? data.tickers : LIQUIDAS_BCBA;
      const filas: FilaCapmBcba[] = [];
      const outliers: string[] = [];

      for (const t of tickers) {
        const simbolo = t.toUpperCase().replace(/\.BA$/, "");
        try {
          // Corte duro por ticker: la regresión interna puede colgarse con red inestable.
          const r = await Promise.race([
            ejecutarCAPM(JSON.stringify({ simbolo, benchmark: "^MERV", rango: "1y" })),
            new Promise<null>((res) => setTimeout(() => res(null), 40_000)),
          ]);
          const txt = (r as any)?.texto ?? "";
          // Extraer métricas del texto del executor (formato estable)
          const betaM = txt.match(/beta[^\d-]*(-?\d+[.,]?\d*)/i);
          const alphaM = txt.match(/alfa[^\d-]*(-?\d+[.,]?\d*)/i);
          const r2M = txt.match(/R²?[^\d]*(\d+[.,]?\d*)/i);
          const sig = /significativ/i.test(txt);
          const beta = betaM ? Number(betaM[1]!.replace(",", ".")) : null;
          const r2 = r2M ? Number(r2M[1]!.replace(",", ".")) : null;
          const alphaPct = alphaM ? Number(alphaM[1]!.replace(",", ".")) * 100 : null;
          const outlier = beta != null && Math.abs(beta) > 5;
          if (outlier) outliers.push(simbolo);
          filas.push({
            ticker: simbolo,
            beta,
            alphaAnualPct: alphaPct,
            r2,
            significativo95: sig ? true : null,
            outlierBeta: outlier,
            ok: r?.ok === true && beta != null,
          });
        } catch {
          filas.push({ ticker: simbolo, beta: null, alphaAnualPct: null, r2: null, significativo95: null, outlierBeta: false, ok: false });
        }
      }

      // Guardrails estilo FACTORES.PY
      const ggal = filas.find((f) => f.ticker === "GGAL");
      const sanityMinimo = data?.r2SanityMinimo ?? 0.3;
      const sanityOk =
        !ggal || ggal.r2 == null ? null : ggal.r2 >= sanityMinimo;
      const corruptos = filas.filter((f) => !f.ok).length;

      const lineas: string[] = [
        "CAPM BATCH BCBA vs ^MERV (2y):",
        "Ticker | β | α anual | R² | flags",
        ...filas.map(
          (f) =>
            `- ${f.ticker}: β ${n2(f.beta)} · α ${pct(f.alphaAnualPct)} · R² ${n2(f.r2)}` +
            (f.outlierBeta ? " · ⚠️|β|>5" : "") +
            (f.ok ? "" : " · SIN DATOS"),
        ),
      ];
      if (sanityOk === false)
        lineas.push(`⚠️ SANITY CHECK FALLIDO: GGAL R² < ${sanityMinimo} — revisar calidad de datos antes de usar la tabla.`);
      if (outliers.length)
        lineas.push("⚠️ Outliers |β|>5 (revisar liquidez/fechas): " + outliers.join(", "));
      if (corruptos > tickers.length * 0.2)
        lineas.push(`⚠️ ${corruptos}/${tickers.length} tickers sin datos (>20%) — posible corrupción de fuente.`);
      lineas.push("");
      lineas.push("Educativo — no recomendación.");

      return {
        ok: filas.some((f) => f.ok),
        filas,
        outliers,
        texto: lineas.join("\n"),
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        filas: [],
        outliers: [],
        texto: "SIN RESULTADOS: capm batch falló (" + (e instanceof Error ? e.message : String(e)) + ").",
      };
    }
  });
