import { eventHandler } from "h3";
import { generarSenalesCedear, guardarSenalesDelDia } from "../../../lib/senales-cedear.functions";

function fechaART(): string {
  const f = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = f.find((p) => p.type === "year")!.value;
  const m = f.find((p) => p.type === "month")!.value;
  const d = f.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

export default eventHandler(async () => {
  const fecha = fechaART();
  try {
    // generar mix todos top 6 (liquidos+movers+noticias)
    const res: any = await (generarSenalesCedear as any)({ data: { filtro: "todos", topN: 6 } });
    const payload = {
      fecha,
      senales: res.senales ?? [],
      criterio: res.criterio ?? "todos",
      generadoEn: res.generadoEn ?? new Date().toISOString(),
    };
    const path = await guardarSenalesDelDia(fecha, payload);
    // enviar a Telegram: usa telegram.server.ts (sendTelegramSignal / sendTelegramMessage)
    const fuertes = payload.senales.filter((s: any) => (s.senal === "COMPRA" || s.senal === "VENTA") && (s.prob ?? 0) >= 0.50);
    const aEnviar = fuertes.length > 0 ? fuertes : payload.senales.filter((s: any) => s.senal === "COMPRA").slice(0, 3);
    if (aEnviar.length > 0) {
      try {
        const { sendTelegramSignal, sendTelegramMessage } = await import("../../../lib/telegram.server");
        // enviar 1 mensaje por señal fuerte (evita spam: max 4)
        for (const s of aEnviar.slice(0, 4)) {
          await sendTelegramSignal({
            ticker: s.tickerBCBA,
            senal: s.senal,
            precio: s.precioUS ?? s.precioBCBA ?? undefined,
            variacion1d: s.variacionUS ?? s.variacionBCBA ?? undefined,
            motivo: s.motivo.slice(0, 180),
            fuente: "yfinance + senales-cedear cron",
          });
        }
        // si no hubo fuertes, enviar resumen
        if (fuertes.length === 0) {
          const txt = `Señales CEDEAR/BCBA ${fecha} (${payload.criterio}):\n` + payload.senales.slice(0, 4).map((s: any) => `${s.senal} ${s.tickerBCBA} (${s.tickerUS} ${s.variacionUS?.toFixed(2) ?? "--"}%)`).join("\n") + `\nVer detalle en /herramientas?tab=contexto`;
          await sendTelegramMessage({ text: txt });
        }
      } catch (e) {
        console.error("[cron senales-cedear] telegram error", e);
      }
    }
    return { ok: true, fecha, path, count: payload.senales.length };
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, motivo: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
