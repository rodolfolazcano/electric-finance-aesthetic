import { eventHandler } from "h3";
import { backtestearEstrategia } from "../../../lib/backtest-estrategia";
import { supabase } from "../../../lib/supabase";
import { SCORING_VERSION } from "../../../lib/scoring/types";

const PERFILES = [
  "Conservador", "Moderado-Conservador", "Moderado",
  "Moderado-Agresivo", "Agresivo", "Muy Agresivo", "Especulativo",
] as const;

export default eventHandler(async () => {
  const fechaCorrida = new Date().toISOString().slice(0, 10);
  const fechaInicio = "2023-01-01";
  const fechaFin = fechaCorrida;
  const resultados = [];

  for (const perfil of PERFILES) {
    try {
      const result = await backtestearEstrategia(
        perfil,
        fechaInicio,
        fechaFin,
        "mensual",
        SCORING_VERSION,
      );
      await supabase.from("backtest_resultados").insert({
        perfil: result.perfil,
        scoring_version: result.scoringVersion,
        fecha_corrida: result.fechaCorrida,
        fecha_inicio: result.fechaInicio,
        fecha_fin: result.fechaFin,
        frecuencia: result.frecuenciaRebalanceo,
        equity_curve: JSON.stringify(result.equityCurve),
        metricas: JSON.stringify(result.metricas),
        notas: result.notas,
      });
      resultados.push({ perfil, ok: true });
    } catch (e) {
      resultados.push({ perfil, ok: false, error: String(e) });
    }
  }

  return {
    ok: true,
    fechaCorrida,
    perfiles: resultados,
  };
});
