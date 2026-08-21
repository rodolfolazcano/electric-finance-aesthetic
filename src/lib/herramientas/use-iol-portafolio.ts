// @ts-nocheck
import { useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getIOLClientes, getIOLPortafolio, type IOLCliente } from "./iol-portfolio.functions";
import { useIOLSession } from "./iol-context";

export interface IOLPortfolioRaw {
  pais: string;
  activos: any[];
}

/**
 * Hook compartido para obtener clientes y portafolios de IOL.
 *
 * Tanto el sub-tab de Análisis Técnico como el de Análisis Fundamental
 * (y cualquier otro tab) deben usar ESTE hook para garantizar que:
 *   - se reutilicen las mismas funciones server (`getIOLClientes` / `getIOLPortafolio`)
 *   - el token de sesión se renueve automáticamente (`updateTokens`)
 *   - el estado de asesor/cliente se resuelva de forma idéntica
 */
export function useIOLPortafolio() {
  const { accessToken, refreshToken, updateTokens } = useIOLSession();

  const [clientes, setClientes] = useState<IOLCliente[]>([]);
  const [clienteId, setClienteId] = useState<number>(0);
  const [esAsesor, setEsAsesor] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientesFn = useServerFn(getIOLClientes);
  const portafolioFn = useServerFn(getIOLPortafolio);

  const loadClientes = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await clientesFn({ data: { token: accessToken, refreshToken: refreshToken ?? null } });
      if (res.newToken) updateTokens(res.newToken, res.newRefreshToken ?? "");
      setClientes(res.data ?? []);
      setEsAsesor((res.data ?? []).length > 0);
    } catch (e: any) {
      setEsAsesor(false);
      setClientes([]);
      setError(e?.message || "Error al cargar clientes IOL");
    } finally {
      setLoading(false);
    }
  }, [accessToken, refreshToken, updateTokens, clientesFn]);

  /**
   * Carga los activos del portafolio (cuenta propia o de un cliente asesorado).
   * Devuelve el array crudo de activos para que cada tab lo procese a su manera.
   */
  const loadPortfolio = useCallback(async (cliente?: number): Promise<any[]> => {
    if (!accessToken) return [];
    setLoading(true);
    setError(null);
    try {
      const res = await portafolioFn({
        data: { token: accessToken, refreshToken: refreshToken ?? null, pais: "argentina", clienteId: cliente || undefined },
      });
      if (res.newToken) updateTokens(res.newToken, res.newRefreshToken ?? "");
      const raw: any = res.data;
      const activos: any[] = Array.isArray(raw) ? raw : (raw?.activos ?? []);
      return activos;
    } catch (e: any) {
      setError(e?.message || "Error al cargar portafolio IOL");
      return [];
    } finally {
      setLoading(false);
    }
  }, [accessToken, refreshToken, updateTokens, portafolioFn]);

  return {
    accessToken,
    refreshToken,
    updateTokens,
    clientes,
    clienteId,
    setClienteId,
    esAsesor,
    loading,
    error,
    setError,
    loadClientes,
    loadPortfolio,
  };
}

