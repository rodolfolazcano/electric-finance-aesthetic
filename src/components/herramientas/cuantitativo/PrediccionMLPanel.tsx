import { useState } from "react";

type PrediccionResp = {
  probabilidad: number;
  umbral_optimo?: number;
  cv_accuracy?: number;
  test_accuracy?: number;
  walk_forward?: { accuracy: number };
  wf_acc?: number;
  regla_oro_ok?: boolean;
  feature_importance?: Record<string, number>;
  decision?: string;
  strike_sugerido?: string;
  confianza?: number;
  error?: string;
};

export function PrediccionMLPanel() {
  const [ticker, setTicker] = useState("GGAL.BA");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PrediccionResp | null>(null);
  const [error, setError] = useState("");

  const buscar = async () => {
    setLoading(true); setError(""); setData(null);
    try {
      const res = await fetch("http://localhost:5000/api/prediccion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setData(j);
    } catch (e:any) {
      setError(e.message ?? String(e) + " — ¿python server/server.py corriendo en :5000?");
    } finally { setLoading(false); }
  };

  const wfAcc = data?.walk_forward?.accuracy ?? data?.wf_acc ?? 0;
  const reglaOro = data?.regla_oro_ok ?? true;
  const sinVentaja = wfAcc < 0.55 || reglaOro === false;

  return (
    <div className="space-y-5">
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-sm text-muted-foreground">Ticker BCBA/CEDEAR</label>
          <input value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())} className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background font-mono" placeholder="GGAL.BA" />
        </div>
        <button onClick={buscar} disabled={loading} className="px-6 py-2.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50">
          {loading ? "..." : "Predecir"}
        </button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {data && (
        <div className="space-y-4">
          {sinVentaja && <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-sm">Modelo sin ventaja predictiva verificada — wf_acc {(wfAcc*100).toFixed(1)}% regla_oro {String(reglaOro)}</div>}
          {/* Gauge probabilidad */}
          <div className="p-4 rounded-lg border border-border/40 bg-card">
            <p className="text-sm text-muted-foreground">Probabilidad dirección alcista</p>
            <div className="mt-2 h-4 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${Math.round((data.probabilidad ?? 0.5)*100)}%` }} />
            </div>
            <p className="mt-2 font-mono text-2xl">{((data.probabilidad ?? 0.5)*100).toFixed(1)}% <span className="text-sm text-muted-foreground">umbral {(data.umbral_optimo!=null?(data.umbral_optimo*100).toFixed(0):50)}%</span></p>
          </div>
          {/* Métricas */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-md border text-center"><p className="text-xs text-muted-foreground">CV</p><p className="font-mono text-lg">{((data.cv_accuracy??0)*100).toFixed(1)}%</p></div>
            <div className="p-3 rounded-md border text-center"><p className="text-xs text-muted-foreground">Test</p><p className="font-mono text-lg">{((data.test_accuracy??0)*100).toFixed(1)}%</p></div>
            <div className="p-3 rounded-md border text-center"><p className="text-xs text-muted-foreground">Walk-Fwd</p><p className="font-mono text-lg">{(wfAcc*100).toFixed(1)}%</p></div>
          </div>
          {/* Feature importance */}
          {data.feature_importance && (
            <div className="p-4 rounded-lg border">
              <p className="text-sm font-medium mb-2">Feature importance</p>
              <div className="space-y-1.5">
                {Object.entries(data.feature_importance).slice(0,6).map(([k,v])=>(
                  <div key={k} className="flex items-center gap-2">
                    <span className="w-28 text-xs font-mono">{k}</span>
                    <div className="flex-1 h-3 bg-muted rounded overflow-hidden"><div className="h-full bg-sky-500" style={{ width: `${Math.min(100, Math.abs(v as number)*100)}%` }} /></div>
                    <span className="text-xs font-mono w-12 text-right">{(v as number).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Decisión */}
          {data.decision && (
            <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
              <p className="text-sm">Decisión <span className="font-bold">{data.decision}</span> {data.strike_sugerido && `· Strike ${data.strike_sugerido}`} {data.confianza!=null && `· Conf ${(data.confianza*100).toFixed(0)}%`}</p>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Backend: POST localhost:5000/api/prediccion (server/prediccion_service.py). Walk-forward Labadie 05.</p>
    </div>
  );
}
