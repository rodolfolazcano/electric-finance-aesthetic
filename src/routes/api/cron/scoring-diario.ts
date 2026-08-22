import { eventHandler } from "h3";
import { ejecutarScoringDiario } from "../../../lib/scoring/scoring-engine";

export default eventHandler(async () => {
  try {
    const result = await ejecutarScoringDiario();
    return {
      ok: true,
      total: result.total,
      errores: result.errores,
      timestamp: new Date().toISOString(),
    };
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, motivo: String(e) }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
});
