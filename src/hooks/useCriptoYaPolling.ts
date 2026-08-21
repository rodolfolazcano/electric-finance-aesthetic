"use client";
import { useEffect, useState, useRef } from "react";
import type { CriptoYaDolar, UsdtExchange } from "@/lib/cripto.types";

interface CriptoYaState {
  dolar: CriptoYaDolar | null;
  usdtExchanges: UsdtExchange | null;
  loading: boolean;
  error: string | null;
  lastUpdate: number | null;
}

export function useCriptoYaPolling(intervalMs = 30000) {
  const [state, setState] = useState<CriptoYaState>({
    dolar: null,
    usdtExchanges: null,
    loading: true,
    error: null,
    lastUpdate: null,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    async function fetchData() {
      try {
        const [dolarRes, usdtRes] = await Promise.all([
          fetch("https://criptoya.com/api/dolar"),
          fetch("https://criptoya.com/api/usdt/ars/1"),
        ]);
        if (!mountedRef.current) return;
        if (dolarRes.ok && usdtRes.ok) {
          const dolar = (await dolarRes.json()) as CriptoYaDolar;
          const usdtExchanges = (await usdtRes.json()) as UsdtExchange;
          setState({ dolar, usdtExchanges, loading: false, error: null, lastUpdate: Date.now() });
        }
      } catch {
        if (mountedRef.current) {
          setState((s) => ({ ...s, loading: false, error: "Error al consultar CriptoYa" }));
        }
      }
    }
    fetchData();
    const id = setInterval(fetchData, intervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return state;
}
