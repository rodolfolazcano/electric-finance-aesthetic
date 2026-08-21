// @ts-nocheck
import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchEarth2Status,
  fetchEarth2Models,
  fetchEarth2Forecast,
} from "@/lib/earth2/earth2-client";
import { analyzeAssetCorrelations, generateMarketOutlook } from "@/lib/earth2/earth2-analysis";
import type {
  Earth2ForecastResponse,
  Earth2Model,
  Hotspot,
  WeatherVariable,
  Earth2Status,
} from "@/lib/earth2/earth2-types";

const HOTSPOT_KEYS = [
  "argentina",
  "brazil",
  "us_midwest",
  "us_gulf",
  "china",
  "europe",
  "patagonia",
  "nordic",
];

export function ClimateForecastPanel() {
  const [status, setStatus] = useState<Earth2Status | null>(null);
  const [models, setModels] = useState<Earth2Model[]>([]);
  const [hotspots, setHotspots] = useState<Record<string, Hotspot>>({});
  const [variables, setVariables] = useState<Record<string, WeatherVariable>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Earth2ForecastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("pangu");
  const [selectedHotspot, setSelectedHotspot] = useState("argentina");
  const [selectedVars, setSelectedVars] = useState<string[]>(["t2m", "tp", "u10m", "v10m"]);
  const [forecastHours, setForecastHours] = useState(120);

  // Initialize: fetch status + models
  const init = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, m] = await Promise.all([
        fetchEarth2Status(),
        fetchEarth2Models().catch(() => null),
      ]);
      setStatus(s);
      if (m) {
        setModels(m.models);
        setHotspots(m.hotspots);
        setVariables(m.variables);
      }
    } catch (e) {
      setError("No se pudo conectar con el servicio Earth2 en localhost:5000");
    } finally {
      setLoading(false);
    }
  }, []);

  const runForecast = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetchEarth2Forecast({
        model: selectedModel,
        variables: selectedVars,
        forecast_hours: forecastHours,
        hotspot: selectedHotspot,
      });
      setResult(res);
    } catch (e: any) {
      setError(e.message || "Error ejecutando pronóstico");
    } finally {
      setLoading(false);
    }
  }, [selectedModel, selectedVars, forecastHours, selectedHotspot]);

  const toggleVar = (v: string) => {
    setSelectedVars((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>🌦️ Earth2Studio — Pronóstico Climático Determinista</span>
          <div className="flex gap-1">
            {status && (
              <Badge
                variant={status.earth2_available ? "default" : "secondary"}
                className="text-[10px]"
              >
                {status.earth2_available ? "CUDA ✅" : "Simulado 📡"}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={init}
              disabled={loading}
            >
              {status ? "Actualizar" : "Conectar"}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-3 rounded bg-red-500/10 p-2 text-xs text-red-500">{error}</div>
        )}

        {!status ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Hacé clic en "Conectar" para inicializar el servicio Earth2Studio
          </p>
        ) : (
          <div className="space-y-3">
            {/* Controls */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <label className="text-[10px] text-muted-foreground">Modelo</label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">
                        {m.name} ({m.step_hours}h, {m.max_lead}h lead)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Hotspot</label>
                <Select value={selectedHotspot} onValueChange={setSelectedHotspot}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOTSPOT_KEYS.map((k) => (
                      <SelectItem key={k} value={k} className="text-xs">
                        {hotspots[k]?.label ?? k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Horas</label>
                <Select
                  value={String(forecastHours)}
                  onValueChange={(v) => setForecastHours(Number(v))}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[24, 48, 72, 120, 168, 240].map((h) => (
                      <SelectItem key={h} value={String(h)} className="text-xs">
                        {h}h
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  size="sm"
                  className="h-7 w-full text-xs"
                  onClick={runForecast}
                  disabled={loading}
                >
                  {loading ? "Ejecutando..." : "Ejecutar pronóstico"}
                </Button>
              </div>
            </div>

            {/* Variable selector */}
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] text-muted-foreground mr-1 leading-6">Variables:</span>
              {Object.entries(variables).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => toggleVar(k)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                    selectedVars.includes(k)
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-transparent border-border text-muted-foreground"
                  }`}
                >
                  {v.label} ({v.unit})
                </button>
              ))}
            </div>

            {/* Results */}
            {result && (
              <Tabs defaultValue="forecast" className="w-full">
                <TabsList className="grid grid-cols-3 h-7">
                  <TabsTrigger value="forecast" className="text-xs">
                    📊 Pronóstico
                  </TabsTrigger>
                  <TabsTrigger value="analysis" className="text-xs">
                    🔍 Análisis
                  </TabsTrigger>
                  <TabsTrigger value="assets" className="text-xs">
                    💼 Activos
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="forecast" className="mt-2">
                  <div className="bg-muted/20 rounded-md p-2 max-h-80 overflow-y-auto">
                    <p className="text-[10px] text-muted-foreground mb-2">
                      Modelo: {result.forecast.model} | Inicio: {result.forecast.init_time} | Pasos:{" "}
                      {result.forecast.total_steps} | Horizonte: {result.forecast.total_hours}h
                      {!result.earth2_available && (
                        <span className="text-yellow-500 ml-2">📡 Simulado</span>
                      )}
                    </p>
                    <table className="w-full text-[10px] font-mono">
                      <thead>
                        <tr className="text-muted-foreground border-b border-border">
                          <th className="text-left py-1">Paso</th>
                          <th className="text-left py-1">Tiempo</th>
                          <th className="text-left py-1">Lead</th>
                          {selectedVars.map((v) => (
                            <th key={v} className="text-right py-1">
                              {variables[v]?.label ?? v}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.forecast.steps.map((s) => (
                          <tr key={s.step} className="border-b border-border/30">
                            <td className="py-0.5">{s.step}</td>
                            <td className="py-0.5">{s.time.slice(11, 16)}</td>
                            <td className="py-0.5">{s.lead_hours}h</td>
                            {selectedVars.map((v) => (
                              <td key={v} className="text-right py-0.5">
                                {s.data[v]?.toFixed(1) ?? "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                <TabsContent value="analysis" className="mt-2">
                  <div className="space-y-2">
                    {result.analysis.summary.map((s, i) => (
                      <p key={s.substring(0, 20) + i} className="text-xs">
                        {s}
                      </p>
                    ))}
                    {result.analysis.alerts.length > 0 && (
                      <div className="rounded bg-yellow-500/10 p-2">
                        <p className="text-[10px] font-semibold mb-1">Alertas</p>
                        {result.analysis.alerts.map((a, i) => (
                          <p key={i} className="text-[10px] font-mono">
                            {a}
                          </p>
                        ))}
                      </div>
                    )}
                    {Object.entries(result.analysis.sector_impacts).length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold mb-1">Impacto por Sector</p>
                        {Object.entries(result.analysis.sector_impacts).map(([sector, info]) => (
                          <div key={sector} className="rounded bg-muted/20 p-2 mb-1">
                            <p className="text-[10px] font-semibold capitalize">{sector}</p>
                            <p className="text-[10px] text-muted-foreground">{info.detail}</p>
                            {info.assets.length > 0 && (
                              <p className="text-[10px] text-muted-foreground">
                                Activos: {info.assets.join(", ")}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {result.analysis.trading_implications.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold mb-1">Implicancias Trading</p>
                        {result.analysis.trading_implications.map((t, i) => (
                          <p key={i} className="text-[10px] text-muted-foreground">
                            • {t}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="assets" className="mt-2">
                  {(() => {
                    const correlations = analyzeAssetCorrelations(result.forecast.steps);
                    const outlook = generateMarketOutlook(correlations);
                    return (
                      <div className="space-y-2">
                        {outlook.map((l, i) => (
                          <p key={i} className="text-xs">
                            {l}
                          </p>
                        ))}
                        <div className="max-h-60 overflow-y-auto space-y-1 mt-2">
                          {correlations.map((c) => (
                            <div
                              key={c.ticker}
                              className="flex items-center justify-between rounded bg-muted/20 p-1.5"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-semibold">{c.ticker}</span>
                                <span className="text-[10px] text-muted-foreground">{c.name}</span>
                                <Badge variant="outline" className="text-[8px] px-1 h-4">
                                  {c.sector}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">
                                  {c.weatherSensitivity}
                                </span>
                                <Badge
                                  className={`text-[8px] px-1.5 h-4 ${
                                    c.forecastImpact === "positivo"
                                      ? "bg-green-500"
                                      : c.forecastImpact === "negativo"
                                        ? "bg-red-500"
                                        : "bg-yellow-500"
                                  } text-white`}
                                >
                                  {c.forecastImpact}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </TabsContent>
              </Tabs>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
