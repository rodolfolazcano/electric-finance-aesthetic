import { eventHandler } from "h3";
import { construirPortafoliosDiarios } from "../../../lib/constructor-portafolio";
import { supabase } from "../../../lib/supabase";

export default eventHandler(async () => {
  try {
    const fecha = new Date().toISOString().slice(0, 10);

    // Leer scores del día desde Supabase
    const { data: scoresRaw } = await supabase
      .from("asset_scores_diario")
      .select("*")
      .eq("fecha", fecha);

    if (!scoresRaw || scoresRaw.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, motivo: "No hay scores para la fecha " + fecha }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    const scores = scoresRaw.map((r: any) => ({
      ...r,
      datosRaw: typeof r.datos_raw === "string" ? JSON.parse(r.datos_raw) : r.datos_raw,
    }));

    // Obtener humor de mercado (desde contexto diario)
    const humorMercado: "risk-on" | "risk-off" | "mixto" | null = null;

    const resultados = await construirPortafoliosDiarios(scores, humorMercado);

    return {
      ok: true,
      perfiles: resultados.length,
      fecha,
      timestamp: new Date().toISOString(),
    };
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, motivo: String(e) }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
});
