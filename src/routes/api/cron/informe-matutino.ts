import { eventHandler } from "h3";
import { generarYGuardarInforme, broadcastInformeATelegram } from "../../../lib/informe-matutino/persistence.functions";

export default eventHandler(async (event: any) => {
  const rawUrl: string = event?.node?.req?.url ?? event?.req?.url ?? event?.context?.url ?? "/api/cron/informe-matutino";
  const url = new URL(rawUrl, "http://localhost");
  const broadcast = url.searchParams.get("broadcast") !== "false"; // default true
  const dryRun = url.searchParams.get("dryRun") === "true";

  if (dryRun) {
    const { buildMarketSnapshot } = await import("../../../lib/informe-matutino/snapshot.functions");
    const snap = await buildMarketSnapshot();
    return { ok: true, dryRun: true, fecha: snap.fecha, calendarioHoy: snap.calendarioHoy.length, noticias: snap.noticiasCrudas.length };
  }

  const result = await generarYGuardarInforme({ broadcast: false });

  if (!result.ok || !result.informe || !result.snapshot) {
    return new Response(
      JSON.stringify({ ok: false, motivo: result.motivo }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  let broadcastRes: string | null = null;
  if (broadcast) {
    broadcastRes = await broadcastInformeATelegram(result.informe, result.snapshot);
  }

  return { ok: true, fecha: result.informe.fecha, humor: result.informe.humorMercado, broadcast: broadcastRes?.slice(0, 600) ?? "skip" };
});
