// src/lib/iol-advisor-portfolio.functions.ts
// Server functions para consultar portafolios de clientes via IOL API (asesores)

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getValidToken } from "./iol-auth";

const IOL_BASE = "https://api.invertironline.com";

// ============================================================================
// TIPOS DE DATOS
// ============================================================================

export interface ClientSummary {
  id: number;
  name: string;
  totalValorized: number;
  investorProfile: string;
}

export interface PortfolioPosition {
  ticker: string;
  description: string;
  quantity: number;
  lastPrice: number;
  valorized: number;
  weightPct: number;
  gainPct: number;
  currency: string;
}

export interface ClientPortfolioResult {
  clientName: string;
  clientId: number;
  investorProfile: string;
  totalValorized: number;
  cedears: PortfolioPosition[];
  acciones: PortfolioPosition[];
  otherPositions: PortfolioPosition[];
  suggestedTickers: string[];
  error?: string;
}

export interface AdvisorClientsResult {
  clients: ClientSummary[];
  isAdvisor: boolean;
  error?: string;
}

export interface EstadoCuentaResult {
  clienteId: number;
  nombre: string;
  totalCuentaValorizado: number;
  disponible: number;
  posiciones: any[];
  error?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

async function iolFetch(path: string, token: string): Promise<any> {
  const res = await fetch(`${IOL_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

// ============================================================================
// SERVER FUNCTIONS
// ============================================================================

/**
 * Obtener lista de clientes del asesor
 */
export const getAdvisorClients = createServerFn({ method: "POST" })
  .validator(
    z.object({
      sessionId: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const token = getValidToken(data.sessionId);
    if (!token) {
      return {
        clients: [],
        isAdvisor: false,
        error: "Sesión inválida o expirada. Iniciá sesión en IOL.",
      } as AdvisorClientsResult;
    }

    try {
      const lista = await iolFetch("/api/v2/Asesores/Clientes", token.token);
      if (!lista || !Array.isArray(lista)) {
        return {
          clients: [],
          isAdvisor: false,
          error: "No se encontraron clientes o la cuenta no es de asesor.",
        } as AdvisorClientsResult;
      }

      const clients: ClientSummary[] = lista.map((c: any) => ({
        id: c.id ?? c.numeroId,
        name: c.nombre ?? c.nombreCompleto ?? `Cliente ${c.id}`,
        totalValorized: c.totalCuentaValorizado ?? 0,
        investorProfile: c.perfilInversor ?? "",
      }));

      return { clients, isAdvisor: true } as AdvisorClientsResult;
    } catch (err) {
      return {
        clients: [],
        isAdvisor: false,
        error: (err as Error).message,
      } as AdvisorClientsResult;
    }
  });

/**
 * Obtener estado de cuenta de un cliente
 */
export const getEstadoCuenta = createServerFn({ method: "POST" })
  .validator(
    z.object({
      sessionId: z.string(),
      clientId: z.number(),
    }),
  )
  .handler(async ({ data }) => {
    const token = getValidToken(data.sessionId);
    if (!token)
      return {
        clienteId: data.clientId,
        error: "Sesión inválida. Iniciá sesión IOL.",
      } as EstadoCuentaResult;

    try {
      const cuenta = await iolFetch(
        `/api/v2/Asesores/EstadoDeCuenta/${data.clientId}`,
        token.token,
      );
      if (!cuenta)
        return {
          clienteId: data.clientId,
          error: "Error al obtener estado de cuenta.",
        } as EstadoCuentaResult;

      return {
        clienteId: data.clientId,
        nombre: cuenta.nombre ?? "",
        totalCuentaValorizado: cuenta.totalCuentaValorizado ?? 0,
        disponible: cuenta.disponible ?? 0,
        posiciones: cuenta.posiciones ?? [],
      } as EstadoCuentaResult;
    } catch (err) {
      return { clienteId: data.clientId, error: (err as Error).message } as EstadoCuentaResult;
    }
  });

/**
 * Obtener composición del portafolio de un cliente (Argentina)
 */
export const getClientPortfolioComposition = createServerFn({ method: "POST" })
  .validator(
    z.object({
      sessionId: z.string(),
      clientId: z.number(),
      country: z.enum(["Argentina", "estados_Unidos"]),
    }),
  )
  .handler(async ({ data }) => {
    const token = getValidToken(data.sessionId);
    if (!token) {
      return {
        clientName: "",
        clientId: data.clientId,
        investorProfile: "",
        totalValorized: 0,
        cedears: [],
        acciones: [],
        otherPositions: [],
        suggestedTickers: [],
        error: "Sesión inválida. Iniciá sesión IOL.",
      } as ClientPortfolioResult;
    }

    try {
      const cartera = await iolFetch(
        `/api/v2/Asesores/Portafolio/${data.clientId}/${data.country}`,
        token.token,
      );

      if (!cartera || !Array.isArray(cartera)) {
        return {
          clientName: "",
          clientId: data.clientId,
          investorProfile: "",
          totalValorized: 0,
          cedears: [],
          acciones: [],
          otherPositions: [],
          suggestedTickers: [],
          error: "Error al obtener portafolio del cliente.",
        } as ClientPortfolioResult;
      }

      const posiciones: PortfolioPosition[] = cartera.map((p: any) => {
        const tipo = (p.tipo ?? p.tipoTitulo ?? "").toUpperCase();
        const isCEDEAR = tipo.includes("CEDEAR");
        const isAccion = tipo.includes("ACCION");
        return {
          ticker: p.simbolo ?? p.ticker ?? "",
          description: p.descripcion ?? p.nombre ?? "",
          quantity: p.cantidad ?? 0,
          lastPrice: p.ultimoPrecio ?? p.precio ?? 0,
          valorized: p.valorizado ?? (p.cantidad ?? 0) * (p.ultimoPrecio ?? 0),
          weightPct: 0,
          gainPct: p.gananciaPorcentaje ?? 0,
          currency: isAccion ? "ARS" : "USD",
          _tipo: tipo,
          _isCEDEAR: isCEDEAR,
          _isAccion: isAccion,
        } as PortfolioPosition & { _tipo: string; _isCEDEAR: boolean; _isAccion: boolean };
      });

      // Filtrar por tipo
      const raw = posiciones as (PortfolioPosition & {
        _tipo: string;
        _isCEDEAR: boolean;
        _isAccion: boolean;
      })[];
      const totalVal = raw.reduce((s, p) => s + p.valorized, 0);
      raw.forEach(
        (p) => (p.weightPct = totalVal > 0 ? +((p.valorized / totalVal) * 100).toFixed(2) : 0),
      );

      const cedears = raw
        .filter((p) => p._isCEDEAR)
        .map(({ _tipo, _isCEDEAR, _isAccion, ...r }) => r);
      const acciones = raw
        .filter((p) => p._isAccion)
        .map(({ _tipo, _isCEDEAR, _isAccion, ...r }) => r);
      const otros = raw
        .filter((p) => !p._isCEDEAR && !p._isAccion)
        .map(({ _tipo, _isCEDEAR, _isAccion, ...r }) => r);
      const suggestedTickers = [...cedears, ...acciones].slice(0, 15).map((p) => p.ticker);

      return {
        clientName: "",
        clientId: data.clientId,
        investorProfile: "",
        totalValorized: totalVal,
        cedears,
        acciones,
        otherPositions: otros,
        suggestedTickers,
      } as ClientPortfolioResult;
    } catch (err) {
      return {
        clientName: "",
        clientId: data.clientId,
        investorProfile: "",
        totalValorized: 0,
        cedears: [],
        acciones: [],
        otherPositions: [],
        suggestedTickers: [],
        error: (err as Error).message,
      } as ClientPortfolioResult;
    }
  });
