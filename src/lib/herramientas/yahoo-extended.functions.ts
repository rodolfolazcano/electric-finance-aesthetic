// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function rawNum(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number") return val;
  if (typeof val === "object" && val != null && "raw" in val && typeof (val as any).raw === "number") return (val as any).raw;
  return null;
}

let _yf: any = null;
async function getYF(): Promise<any> {
  if (_yf) return _yf;
  const mod: any = await import("yahoo-finance2");
  const YF = mod.default ?? mod;
  try {
    _yf = typeof YF === "function" ? new YF() : YF;
  } catch {
    _yf = YF;
  }
  try {
    _yf.suppressNotices?.(["yahooSurvey", "ripHistorical"]);
  } catch { /* noop */ }
  return _yf;
}

export interface EarningsHistoryEntry {
  fecha: string;
  estimado: number;
  real: number;
  sorpresa: number;
  sorpresaPct: number;
}

export interface EarningsTrendEntry {
  periodo: string;
  estimadoActual: number;
  estimadoAnterior: number;
  cambioPct: number;
}

export interface ConsensusAnalistas {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  total: number;
  fechaActualizacion: string;
}

export interface InstitutionOwnership {
  porcentajeInstitucional: number | null;
  porcentajeInsiders: number | null;
  totalInstituciones: number | null;
  comprasRecientesInsiders: number | null;
  ventasRecientesInsiders: number | null;
}

export interface SemaforoExtendido {
  earningsHistory?: EarningsHistoryEntry[];
  earningsTrend?: EarningsTrendEntry[];
  consensoAnalistas?: ConsensusAnalistas;
  ownership?: InstitutionOwnership;
  fechaProximoEarnings?: string;
  sorpresaPromedioPct?: number;
  fcfYield?: number | null;
}

export const getExtendedSemaforoData = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ ticker: z.string().min(1).max(20) }).parse(input))
  .handler(async ({ data }): Promise<SemaforoExtendido> => {
    const { ticker } = data;
    const yf = await getYF();

    let earningsHistory: EarningsHistoryEntry[] | undefined;
    let earningsTrend: EarningsTrendEntry[] | undefined;
    let consensoAnalistas: ConsensusAnalistas | undefined;
    let ownership: InstitutionOwnership | undefined;
    let fechaProximoEarnings: string | undefined;
    let sorpresaPromedioPct: number | undefined;

    try {
      const qs = await yf.quoteSummary(ticker, {
        modules: ["earningsHistory", "earningsTrend", "recommendationTrend", "institutionOwnership", "majorHoldersBreakdown", "insiderTransactions", "calendarEvents"],
      });

      if (qs?.earningsHistory?.history) {
        earningsHistory = qs.earningsHistory.history.map((e: any) => {
          const estimado = rawNum(e.epsEstimate) ?? 0;
          const real = rawNum(e.epsActual) ?? 0;
          return {
            fecha: e.epsActual?.fmt ?? e.quarter ?? "",
            estimado,
            real,
            sorpresa: real - estimado,
            sorpresaPct: estimado !== 0
              ? +(((real - estimado) / Math.abs(estimado)) * 100).toFixed(2)
              : 0,
          };
        });
        const sorpresas = (earningsHistory ?? []).filter((e) => e.estimado !== 0);
        if (sorpresas.length > 0) {
          sorpresaPromedioPct = +(
            sorpresas.reduce((s, e) => s + e.sorpresaPct, 0) / sorpresas.length
          ).toFixed(2);
        }
      }

      if (qs?.earningsTrend?.trend) {
        earningsTrend = qs.earningsTrend.trend.map((t: any) => ({
          periodo: t.period ?? "",
          estimadoActual: rawNum(t.epsEstimate) ?? 0,
          estimadoAnterior: rawNum(t.epsEstimate) ?? 0,
          cambioPct: 0,
        }));
      }

      if (qs?.recommendationTrend?.trend) {
        const last = qs.recommendationTrend.trend[qs.recommendationTrend.trend.length - 1];
        if (last) {
          consensoAnalistas = {
            strongBuy: last.strongBuy ?? 0,
            buy: last.buy ?? 0,
            hold: last.hold ?? 0,
            sell: last.sell ?? 0,
            strongSell: last.strongSell ?? 0,
            total: (last.strongBuy ?? 0) + (last.buy ?? 0) + (last.hold ?? 0) + (last.sell ?? 0) + (last.strongSell ?? 0),
            fechaActualizacion: new Date().toISOString().slice(0, 10),
          };
        }
      }

      if (qs?.majorHoldersBreakdown) {
        const mhb = qs.majorHoldersBreakdown;
        const instPct = rawNum(mhb.percentageHeldByInstitutions);
        const insiderPct = rawNum(mhb.percentageHeldByInsiders);
        // Solo devolver ownership si al menos un dato real existe (>0 no null)
        if (instPct != null || insiderPct != null) {
          ownership = {
            porcentajeInstitucional: instPct != null ? instPct * 100 : null,
            porcentajeInsiders: insiderPct != null ? insiderPct * 100 : null,
            totalInstituciones: rawNum(mhb.institutionsCount) ?? null,
            comprasRecientesInsiders: qs?.insiderTransactions?.transactions?.filter(
              (t: any) => t.transactionDescription?.includes("Purchase") ||
                            t.transactionDescription?.includes("Buy"),
            ).length ?? null,
            ventasRecientesInsiders: qs?.insiderTransactions?.transactions?.filter(
              (t: any) => t.transactionDescription?.includes("Sale") ||
                            t.transactionDescription?.includes("Sell"),
            ).length ?? null,
          };
        }
      }

      if (qs?.calendarEvents?.earnings) {
        const e = qs.calendarEvents.earnings;
        fechaProximoEarnings =
          e.earningsDate?.[0]?.fmt ??
          e.earningsDate?.raw?.toString() ??
          undefined;
      }
    } catch { /* extended data is optional; silent fail */ }

    return {
      earningsHistory,
      earningsTrend,
      consensoAnalistas,
      ownership,
      fechaProximoEarnings,
      sorpresaPromedioPct,
    };
  });
