import { eventHandler } from "h3";
import { generarYGuardarInforme } from "../../../lib/informe-matutino/persistence.functions";

export default eventHandler(async () => {
  const result = await generarYGuardarInforme();

  if (!result.ok) {
    return new Response(
      JSON.stringify({ ok: false, motivo: result.motivo }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  return { ok: true };
});
