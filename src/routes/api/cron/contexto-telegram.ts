// Cron: contexto diario de mercado -> Telegram (@fpxbs777_bot).
//
// Desde la apertura del dia genera el contexto completo (mismos datos y
// narrativa IA que el Informe Matutino de la app: snapshot internacional +
// local + agenda + noticias + analisis IA) y lo envia a los chats autorizados
// del bot agente. Pensado para Vercel Cron (vercel.json) o cualquier scheduler
// externo que pegue a este endpoint.
//
// Disparo manual:
//   GET /api/cron/contexto-telegram?token=<TELEGRAM_WEBHOOK_SECRET>
// Vercel Cron envia header x-vercel-cron (aceptado automaticamente).

import { createFileRoute } from "@tanstack/react-router";
import { buildMarketSnapshot } from "../../../lib/informe-matutino/snapshot.functions";
import { generateInformeMatutino } from "../../../lib/informe-matutino/informe.functions";
import { saveInformeDelDia } from "../../../lib/informe-matutino/persistence.functions";
import type { MarketContextSnapshot, InformeMatutinoIA } from "../../../lib/informe-matutino/types";
import "@/lib/ai/env.server";
import { getAgentBotConfig, sendAgentMessage } from "../../../lib/telegram.server";

const MAX_MSG = 3800;

function obtenerFechaART(): string {
  const formatter = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pct(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return "--";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function num(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return "--";
  return v.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function horaART(): number {
  return Number(
    new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
}

function autorizado(req: Request): boolean {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const { secret } = getAgentBotConfig();
  const cronSecret = process.env["CRON_SECRET"];
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (req.headers.get("x-vercel-cron")) return true;
  if (token && token === secret) return true;
  if (bearer && bearer === secret) return true;
  if (cronSecret && (token === cronSecret || bearer === cronSecret)) return true;
  return false;
}

type Seccion = { titulo: string; lineas: string[] };

function armarMensaje(snapshot: MarketContextSnapshot, ia: InformeMatutinoIA): string {
  const momento = horaART() >= 12 ? "Cierre" : "Apertura";
  const S: Seccion[] = [];

  const tituloInforme =
    momento === "Apertura" ? "Lo que hay que saber esta mañana" : "Lo que hay que saber del cierre";

  S.push({
    titulo: tituloInforme,
    lineas: [`Humor de mercado: <b>${ia.humorMercado}</b>`, ia.resumenEjecutivo],
  });

  S.push({
    titulo: "Radar internacional",
    lineas: [
      `<b>${escapeHtml(ia.radarInternacional.titular)}</b>`,
      ...ia.radarInternacional.bullets.map((b) => `- ${escapeHtml(b)}`),
    ],
  });

  S.push({
    titulo: "Radar local",
    lineas: [
      `<b>${escapeHtml(ia.radarLocal.titular)}</b>`,
      ...ia.radarLocal.bullets.map((b) => `- ${escapeHtml(b)}`),
    ],
  });

  const int = snapshot.internacional;
  const eeuu = (int?.cierreEEUU ?? []).map((c) => `${c.ticker} ${pct(c.variacionPct)}`).join(" | ");
  const asiaEu = (int?.asiaEuropa ?? [])
    .map((c) => `${c.ticker} ${pct(c.variacionPct)}`)
    .join(" | ");
  const comm = (int?.commodities ?? [])
    .map((c) => `${c.nombre} ${pct(c.variacionPct)}`)
    .join(" | ");
  const tasas = (int?.tasas ?? []).map((t) => `${t.nombre} ${num(t.valor)}`).join(" | ");
  S.push({
    titulo: "Internacional en numeros",
    lineas: [
      eeuu ? `EE.UU.: ${eeuu}` : "EE.UU.: --",
      asiaEu ? `Asia/Europa: ${asiaEu}` : "",
      comm ? `Commodities: ${comm}` : "",
      tasas ? `Tasas: ${tasas}` : "",
    ].filter(Boolean),
  });

  const L = snapshot.local;
  const dol = L?.dolares;
  const merval = L?.merval;
  S.push({
    titulo: "Local en numeros",
    lineas: [
      merval
        ? `MERVAL: ${num(merval.puntos)} (${pct(merval.variacionPct)}) · USD ${num(merval.enUSD)}`
        : "MERVAL: --",
      dol
        ? `Dolares — oficial $${num(dol.oficial)} | blue $${num(dol.blue)} | MEP $${num(dol.mep)} | CCL $${num(dol.ccl)} | brecha ${num(dol.brechaCCLPct)}%`
        : "Dolares: --",
      L?.riesgoPais
        ? `Riesgo pais: ${num(L.riesgoPais.valor)} pts (${L.riesgoPais.variacionPuntos >= 0 ? "+" : ""}${num(L.riesgoPais.variacionPuntos)})`
        : "",
      L?.reservas ? `Reservas BCRA: USD ${num(L.reservas.valorUSD)}` : "",
      L?.inflacion
        ? `Inflacion: ${num(L.inflacion.mensualPct)}% mensual / ${num(L.inflacion.interanualPct)}% interanual`
        : "",
      L?.tasaPlazoFijo ? `Plazo fijo TNA promedio: ${num(L.tasaPlazoFijo.promedioTNA)}%` : "",
      L?.uva ? `UVA: $${num(L.uva.valor)}` : "",
    ].filter(Boolean),
  });

  const noticias = (snapshot.noticiasCrudas ?? []).slice(0, 5);
  if (noticias.length) {
    S.push({
      titulo: "Noticias del dia",
      lineas: noticias.map(
        (n) => `- <a href="${n.url}">${escapeHtml(n.titulo)}</a> (${escapeHtml(n.fuente)})`,
      ),
    });
  }

  // Resultados corporativos que reportan hoy (con consenso si hay).
  const earnings = snapshot.resultadosCorporativos ?? [];
  if (earnings.length) {
    S.push({
      titulo: "Resultados de hoy",
      lineas: earnings.slice(0, 6).map((e) => {
        const eps = e.epsConsenso != null ? ` | EPS cons. ${num(e.epsConsenso)}` : "";
        const hora = e.hora !== "--" ? ` (${escapeHtml(e.hora)})` : "";
        return `- <b>${escapeHtml(e.ticker)}</b>${hora}${eps}`;
      }),
    });
  }

  // Agenda del día: prioriza el calendario con consenso/previo; cae a la
  // estática curada si el feed no trajo eventos.
  const cal = (snapshot.calendarioHoy ?? []).slice(0, 8);
  if (cal.length) {
    S.push({
      titulo: "Agenda economica de hoy",
      lineas: cal.map((c) => {
        const extra = [
          c.consenso != null ? `cons. ${c.consenso}` : null,
          c.previo != null ? `ant. ${c.previo}` : null,
          c.pais || null,
        ]
          .filter(Boolean)
          .join(" | ");
        return `${c.relevancia === "alta" ? "[!] " : ""}${c.hora} ${escapeHtml(c.evento)}${extra ? ` — ${escapeHtml(extra)}` : ""}`;
      }),
    });
  } else {
    const agenda = [...(ia.agendaDelDia ?? [])]
      .sort((a, b) => (a.relevancia === "alta" ? -1 : b.relevancia === "alta" ? 1 : 0))
      .slice(0, 6);
    if (agenda.length) {
      S.push({
        titulo: "Agenda economica",
        lineas: agenda.map(
          (a) => `${a.relevancia === "alta" ? "[!] " : ""}${a.hora} ${escapeHtml(a.evento)}`,
        ),
      });
    }
  }

  // Datos INDEC: actividad y sector externo.
  const indec = snapshot.indec;
  const indecLineas: string[] = [];
  if (indec?.emae) {
    indecLineas.push(
      `EMAE (${escapeHtml(indec.emae.fechaDato)}): var mensual ${pct(indec.emae.varMensualPct)} / interanual ${pct(indec.emae.varInteranualPct)}`,
    );
  }
  if (indec?.comercioExterior) {
    const ce = indec.comercioExterior;
    indecLineas.push(
      `Comercio exterior (${escapeHtml(ce.fechaDato)}): expo USD ${num(ce.exportacionesUSD)} (${pct(ce.varExportacionesInteranualPct)}) | impo USD ${num(ce.importacionesUSD)} (${pct(ce.varImportacionesInteranualPct)}) | saldo USD ${num(ce.saldoUSD)} | acumulado año USD ${num(ce.saldoAcumuladoAnioUSD)}`,
    );
  }
  if (indecLineas.length) S.push({ titulo: "Sector real (INDEC)", lineas: indecLineas });

  const opps = ia.oportunidadesDelDia ?? [];
  if (opps.length) {
    S.push({
      titulo: "Oportunidades observadas",
      lineas: opps.map((o) => `- <b>${escapeHtml(o.activo)}</b>: ${escapeHtml(o.motivo)}`),
    });
  }

  const perfiles = (ia.recomendacionPorPerfil ?? [])
    .map((r) => `${r.perfil}: ${r.claseActivo}`)
    .join(" | ");
  if (perfiles) S.push({ titulo: "Enfoque por perfil", lineas: [perfiles] });

  const bloques = S.map((sec) => `<b>${sec.titulo}</b>\n${sec.lineas.join("\n")}`);
  const cuerpo = bloques.join("\n\n");
  return (
    `<b>Contexto de mercado — ${momento} ${escapeHtml(snapshot.fecha)}</b>\n\n` +
    cuerpo +
    `\n\n<i>Aviso: informacion educativa, no es recomendacion de inversion. Verifica en tu broker.</i>` +
    `\n<i>Podes preguntarme lo que quieras sobre estos datos: respondé en el chat.</i>`
  ).slice(0, MAX_MSG * 4);
}

async function generarContexto(): Promise<{ texto: string; fecha: string }> {
  const snapshot = await buildMarketSnapshot();
  const informe = await generateInformeMatutino(snapshot);
  let ia: InformeMatutinoIA;

  if (informe) {
    ia = informe;
    await saveInformeDelDia({
      fecha: obtenerFechaART(),
      snapshot,
      informe,
      generadoEn: new Date().toISOString(),
    }).catch(() => undefined);
  } else {
    // Fallback sin narrativa IA: solo datos duros del snapshot.
    ia = {
      fecha: snapshot.fecha,
      humorMercado: "mixto",
      resumenEjecutivo: "Narrativa IA no disponible esta corrida; datos de mercado abajo.",
      radarInternacional: { titular: "Sin narrativa", bullets: [] },
      radarLocal: { titular: "Sin narrativa", bullets: [] },
      agendaDelDia: [],
      oportunidadesDelDia: [],
      recomendacionPorPerfil: [],
      herramientasSugeridas: [],
    };
  }
  return { texto: armarMensaje(snapshot, ia), fecha: snapshot.fecha };
}

async function manejar(request: Request): Promise<Response> {
  if (!autorizado(request)) {
    return new Response(JSON.stringify({ ok: false, motivo: "no autorizado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const { texto, fecha } = await generarContexto();
    const { allowedChats } = getAgentBotConfig();
    if (!allowedChats.length) {
      return new Response(JSON.stringify({ ok: false, motivo: "sin chats autorizados" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    for (const chatId of allowedChats) {
      await sendAgentMessage(chatId, texto);
    }
    return Response.json({ ok: true, fecha, enviados: allowedChats, caracteres: texto.length });
  } catch (e: unknown) {
    const detalle = e instanceof Error ? e.message : String(e);
    console.error("[contexto-telegram] error:", detalle);
    return new Response(JSON.stringify({ ok: false, motivo: detalle }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/cron/contexto-telegram")({
  server: {
    handlers: {
      GET: async ({ request }) => manejar(request),
      POST: async ({ request }) => manejar(request),
    },
  },
});
