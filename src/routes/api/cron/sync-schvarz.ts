import { eventHandler } from "h3";
import { sincronizarUniversoSchvarz } from "../../../lib/schvarz-sync.functions";

export default eventHandler(async () => {
  try {
    const result = await sincronizarUniversoSchvarz();
    return {
      ok: true,
      total: result.totalTicketers,
      semaforoObtenidos: result.semaforoObtenidos,
      semaforoPendientes: result.semaforoPendientes,
      fundamentalObtenidos: result.fundamentalObtenidos,
      fundamentalPendientes: result.fundamentalPendientes,
      errores: result.errores,
      timestamp: new Date().toISOString(),
    };
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, motivo: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
