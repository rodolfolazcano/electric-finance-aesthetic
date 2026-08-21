// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getIOLPortafolio, getIOLEstadoCuenta, getIOLClientes } from "./iol-portfolio.functions";
import type { PortfolioAssetInput, FuentePrecio } from "./diagnostico-types";

//  Tipos de salida 

export interface SyncEstadoCuenta {
  disponibleOperar: number;
  disponibleComprar: number;
  totalCuentaValorizado: number;
  margenDescubierto: number;
  margenGarantia: number;
  saldoCuentaCorriente: number;
  gananciaDelDia: number;
}

export interface IOLSyncResult {
  success: boolean;
  portfolioInputs: PortfolioAssetInput[];
  estadoCuenta: SyncEstadoCuenta | null;
  totalValorizado: number;
  liquidezInmediata: number;
  warning?: string;
  error?: string;
}

export interface IOLClientSummary {
  id: number;
  nombre: string;
  totalValorizado: number;
  perfilInversor: string;
}

//  Normalizar un activo IOL a formato plano 

interface FlatItem {
  simbolo: string;
  cantidad: number;
  ultimoPrecio: number;
  valorizado: number;
  moneda: string;
  tipo: string;
  mercado: string;
}

function normalizarActivo(a: any): FlatItem | null {
  if (!a || a.cantidad <= 0) return null;
  if (a.titulo) {
    return {
      simbolo: a.titulo.simbolo ?? "",
      cantidad: a.cantidad ?? 0,
      ultimoPrecio: a.ultimoPrecio ?? 0,
      valorizado: a.valorizado ?? 0,
      moneda: a.titulo.moneda ?? "",
      tipo: a.titulo.tipo ?? "",
      mercado: a.titulo.mercado ?? "",
    };
  }
  if (a.simbolo) {
    return {
      simbolo: a.simbolo,
      cantidad: a.cantidad ?? 0,
      ultimoPrecio: a.ultimoPrecio ?? 0,
      valorizado: a.valorizado ?? (a.cantidad ?? 0) * (a.ultimoPrecio ?? 0),
      moneda: a.moneda ?? "",
      tipo: a.tipo ?? "",
      mercado: a.mercado ?? "",
    };
  }
  return null;
}

function detectarFuente(tipo: string, mercado: string): FuentePrecio {
  const t = tipo.toUpperCase();
  const m = mercado.toUpperCase();
  if (t.includes("CEDEAR") || t.includes("ACCION") || m === "BCBA" || m === "ROFEX") {
    return "IOL";
  }
  return "Yahoo";
}

//  Server function: sincronizar portafolio IOL 

export const syncIOLPortfolio = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        accessToken: z.string().min(1),
        refreshToken: z.string().nullable(),
        pais: z.string().default("Argentina"),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<IOLSyncResult> => {
    try {
      const [portafolioRes, estadoCuentaRes] = await Promise.allSettled([
        getIOLPortafolio({
          data: { token: data.accessToken, refreshToken: data.refreshToken, pais: data.pais },
        }),
        getIOLEstadoCuenta({
          data: { token: data.accessToken, refreshToken: data.refreshToken },
        }),
      ]);

      const warnings: string[] = [];

      let items: FlatItem[] = [];
      if (portafolioRes.status === "fulfilled") {
        const raw = portafolioRes.value;
        const arr = Array.isArray(raw) ? raw : ((raw as any)?.activos ?? []);
        items = arr.map(normalizarActivo).filter((x): x is FlatItem => x !== null);
        if (items.length === 0 && arr.length > 0) {
          items = arr
            .filter((a: any) => a.cantidad > 0 || a.saldo > 0)
            .map((a: any) => ({
              simbolo: a.simbolo ?? a.ticker ?? a.titulo?.simbolo ?? "",
              cantidad: a.cantidad ?? a.saldo ?? 0,
              ultimoPrecio: a.ultimoPrecio ?? a.precio ?? 0,
              valorizado: a.valorizado ?? a.monto ?? 0,
              moneda: a.moneda ?? a.titulo?.moneda ?? "ARS",
              tipo: a.tipo ?? a.titulo?.tipo ?? "",
              mercado: a.mercado ?? a.titulo?.mercado ?? "",
            }));
        }
      } else {
        warnings.push("No se pudo obtener el portafolio IOL.");
      }

      const ec = estadoCuentaRes.status === "fulfilled" ? estadoCuentaRes.value : null;
      let estadoCuenta: SyncEstadoCuenta | null = null;
      if (ec) {
        const d = ec.data ?? ec;
        estadoCuenta = {
          disponibleOperar: d.disponibleOperar ?? 0,
          disponibleComprar: d.disponibleComprar ?? 0,
          totalCuentaValorizado: d.totalCuentaValorizado ?? 0,
          margenDescubierto: d.margenDescubierto ?? 0,
          margenGarantia: d.margenGarantia ?? 0,
          saldoCuentaCorriente: d.saldoCuentaCorriente ?? 0,
          gananciaDelDia: d.gananciaDelDia ?? 0,
        };
      } else {
        warnings.push("No se pudo obtener el estado de cuenta IOL.");
      }

      const totalValorizado =
        estadoCuenta?.totalCuentaValorizado ?? items.reduce((s, i) => s + i.valorizado, 0);

      const liquidezInmediata =
        estadoCuenta?.disponibleOperar ??
        estadoCuenta?.saldoCuentaCorriente ??
        estadoCuenta?.disponibleComprar ??
        0;

      const portfolioInputs: PortfolioAssetInput[] = items
        .filter((i) => i.simbolo && i.cantidad > 0)
        .map((i) => ({
          id: `iol-${i.simbolo}-${Date.now()}`,
          ticker: i.simbolo.toUpperCase(),
          cantidad: i.cantidad,
          fuente: detectarFuente(i.tipo, i.mercado),
        }));

      return {
        success: true,
        portfolioInputs,
        estadoCuenta,
        totalValorizado,
        liquidezInmediata,
        warning: warnings.length > 0 ? warnings.join(" ") : undefined,
      };
    } catch (err) {
      return {
        success: false,
        portfolioInputs: [],
        estadoCuenta: null,
        totalValorizado: 0,
        liquidezInmediata: 0,
        error: (err as Error).message,
      };
    }
  });

//  Server function: obtener clientes del asesor 

export const syncIOLAdvisorClients = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        accessToken: z.string().min(1),
        refreshToken: z.string().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ clients: IOLClientSummary[]; error?: string }> => {
    try {
      const res = await getIOLClientes({
        data: { token: data.accessToken, refreshToken: data.refreshToken },
      });

      const raw = res.data;
      if (!Array.isArray(raw)) {
        return { clients: [], error: "No se encontraron clientes o la cuenta no es de asesor." };
      }

      return {
        clients: raw.map((c: any) => ({
          id: c.id ?? c.numeroId,
          nombre: `${c.nombre ?? ""} ${c.apellido ?? ""}`.trim() || `Cliente ${c.id}`,
          totalValorizado: c.totalCuentaValorizado ?? 0,
          perfilInversor: c.perfilInversor ?? "",
        })),
      };
    } catch (err) {
      return { clients: [], error: (err as Error).message };
    }
  });
