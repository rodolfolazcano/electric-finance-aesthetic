// src/lib/risk-free-rate.server.ts
// Server functions para obtener tasa libre de riesgo desde APIs reales (sin CORS).

import { createServerFn } from "@tanstack/react-start";
import { getRiskFreeRateSync, refreshRiskFreeRate } from "./risk-free-rate";

// Server function: actualiza la tasa desde el servidor (sin CORS)
export const fetchRiskFreeRateServer = createServerFn({ method: "GET" })
  .handler(async () => {
    const tasa = await refreshRiskFreeRate();
    return { tasaUSD: tasa, timestamp: new Date().toISOString() };
  });

// Server function: obtiene la tasa actual (cached o default)
export const getRiskFreeRateServer = createServerFn({ method: "GET" })
  .handler(async () => {
    return { tasaUSD: getRiskFreeRateSync("USD"), tasaARS: getRiskFreeRateSync("ARS") };
  });
