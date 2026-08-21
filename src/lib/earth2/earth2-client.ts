// Earth2Studio API Client — Weather Forecast for Financial Analysis

import type {
  Earth2Status,
  Earth2Model,
  Hotspot,
  WeatherVariable,
  Earth2ForecastRequest,
  Earth2ForecastResponse,
} from "./earth2-types";

const API_BASE = "http://localhost:5000";

export async function fetchEarth2Status(): Promise<Earth2Status> {
  const res = await fetch(`${API_BASE}/api/earth2/status`);
  if (!res.ok) throw new Error(`Earth2 status error: ${res.status}`);
  return res.json();
}

export async function fetchEarth2Models(): Promise<{
  available: boolean;
  models: Earth2Model[];
  hotspots: Record<string, Hotspot>;
  variables: Record<string, WeatherVariable>;
}> {
  const res = await fetch(`${API_BASE}/api/earth2/models`);
  if (!res.ok) throw new Error(`Earth2 models error: ${res.status}`);
  return res.json();
}

export async function fetchEarth2Forecast(
  req: Earth2ForecastRequest,
): Promise<Earth2ForecastResponse> {
  const res = await fetch(`${API_BASE}/api/earth2/forecast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Earth2 forecast error: ${res.status}`);
  }
  return res.json();
}
