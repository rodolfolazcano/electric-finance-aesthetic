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
          const raw = (await dolarRes.json()) as any;
          // Normalizar CriptoYa /api/dolar a CriptoYaDolar (compatibilidad con cripto ya api.txt)
          const dolar: CriptoYaDolar = {
            mayorista: { compra: raw.mayorista?.price ?? raw.mayorista?.bid ?? 0, venta: raw.mayorista?.price ?? raw.mayorista?.ask ?? 0 },
            oficial: { compra: raw.oficial?.bid ?? raw.oficial?.price ?? 0, venta: raw.oficial?.ask ?? raw.oficial?.price ?? 0 },
            ahorro: { compra: raw.ahorro?.bid ?? raw.ahorro?.price ?? 0, venta: raw.ahorro?.ask ?? raw.ahorro?.price ?? 0 },
            tarjeta: { compra: raw.tarjeta?.price ?? raw.tarjeta?.bid ?? 0, venta: raw.tarjeta?.price ?? raw.tarjeta?.ask ?? 0 },
            blue: { compra: raw.blue?.bid ?? 0, venta: raw.blue?.ask ?? 0 },
            cripto: { compra: raw.cripto?.usdt?.bid ?? raw.cripto?.price ?? 0, venta: raw.cripto?.usdt?.ask ?? raw.cripto?.price ?? 0 },
            mep: raw.mep?.al30?.ci?.price ?? raw.mep?.al30?.["24hs"]?.price ?? raw.mep?.price ?? (typeof raw.mep === "number" ? raw.mep : 0),
            ccl: raw.ccl?.al30?.ci?.price ?? raw.ccl?.al30?.["24hs"]?.price ?? raw.ccl?.price ?? (typeof raw.ccl === "number" ? raw.ccl : 0),
            raw,
          };
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
