// Earth2Studio Type Definitions — Deterministic Weather Forecast

export interface Earth2Status {
  earth2_available: boolean;
  service_loaded: boolean;
  simulation_mode: boolean;
  note: string;
}

export interface Earth2Model {
  id: string;
  name: string;
  cls: string;
  step_hours: number;
  max_lead: number;
  variables: string[];
  region: string;
  vram_gb: number;
  available: boolean;
}

export interface Hotspot {
  lat: number;
  lon: number;
  label: string;
}

export interface WeatherVariable {
  label: string;
  unit: string;
  impact: string;
}

export interface ForecastStep {
  step: number;
  time: string;
  lead_hours: number;
  data: Record<string, number>;
}

export interface ForecastResult {
  status: "success" | "simulated" | "failed";
  model: string;
  init_time: string;
  total_steps: number;
  total_hours: number;
  steps: ForecastStep[];
}

export interface SectorImpact {
  impact: string;
  detail: string;
  assets: string[];
}

export interface FinancialAnalysis {
  hotspot: string | null;
  summary: string[];
  sector_impacts: Record<string, SectorImpact>;
  alerts: string[];
  trading_implications: string[];
}

export interface Earth2ForecastResponse {
  forecast: ForecastResult;
  analysis: FinancialAnalysis;
  earth2_available: boolean;
}

export interface Earth2ForecastRequest {
  model?: string;
  variables?: string[];
  forecast_hours?: number;
  init_time?: string;
  hotspot?: string;
}
