import { createServerFn } from "@tanstack/react-start";
import { buildMarketSnapshot } from "./snapshot.functions";
import { generateInformeMatutino } from "./informe.functions";
import type { MarketContextSnapshot, InformeMatutinoCompleto } from "./types";
import type { InformeMatutinoIA } from "./schema";

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

interface InformePersistido {
  fecha: string;
  snapshot: MarketContextSnapshot;
  informe: InformeMatutinoIA;
  generadoEn: string;
}

async function fs() {
  const [{ readFile, writeFile, readdir }, { existsSync }, { join }] = await Promise.all([
    import("node:fs/promises") as Promise<typeof import("node:fs/promises")>,
    import("node:fs") as Promise<typeof import("node:fs")>,
    import("node:path") as Promise<typeof import("node:path")>,
  ]);
  const DATA_DIR = join(process.cwd(), ".data", "informes");
  return { readFile, writeFile, readdir, existsSync, join, DATA_DIR };
}

function dataPath(fecha: string, dir: string): string {
  return `${dir}/${fecha}.json`;
}

export async function saveInformeDelDia(data: {
  fecha: string;
  snapshot: MarketContextSnapshot;
  informe: InformeMatutinoIA;
  generadoEn: string;
}): Promise<void> {
  const { writeFile, DATA_DIR } = await fs();
  const { mkdir } = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  await writeFile(dataPath(data.fecha, DATA_DIR), JSON.stringify(data, null, 2), "utf-8");
}

export function formatInformeParaTelegram(informe: InformeMatutinoIA, snapshot: MarketContextSnapshot): string {
  const humorEmoji = informe.humorMercado === "risk-on" ? "🟢" : informe.humorMercado === "risk-off" ? "🔴" : "🟡";
  const lines: string[] = [];
  lines.push(`<b>Lo que hay que saber esta mañana — ${informe.fecha}</b> ${humorEmoji} ${informe.humorMercado}`);
  lines.push("");
  lines.push(`<i>${informe.resumenEjecutivo}</i>`);
  lines.push("");
  lines.push(`<b>Internacional — ${informe.radarInternacional.titular}</b>`);
  for (const b of informe.radarInternacional.bullets) lines.push(`• ${b}`);
  lines.push("");
  lines.push(`<b>Local — ${informe.radarLocal.titular}</b>`);
  for (const b of informe.radarLocal.bullets) lines.push(`• ${b}`);
  if (informe.agendaDelDia.length) {
    lines.push("");
    lines.push(`<b>Agenda del día</b>`);
    for (const ev of informe.agendaDelDia) lines.push(`• ${ev.hora !== "00:00" ? ev.hora + " hs — " : ""}${ev.evento} [${ev.relevancia}]`);
  }
  // Fallback: si Gemini no devolvió agenda pero el snapshot tiene calendario real
  if (!informe.agendaDelDia.length && snapshot.calendarioHoy.length) {
    lines.push("");
    lines.push(`<b>Agenda del día (calendario económico)</b>`);
    for (const ev of snapshot.calendarioHoy.slice(0, 6)) {
      lines.push(`• ${ev.hora} — ${ev.evento} (${ev.pais})${ev.consenso ? ` consenso ${ev.consenso}` : ""}${ev.previo ? ` previo ${ev.previo}` : ""} [${ev.relevancia}]`);
    }
  }
  if (informe.oportunidadesDelDia.length) {
    lines.push("");
    lines.push(`<b>Oportunidades del día</b>`);
    for (const o of informe.oportunidadesDelDia) lines.push(`• <b>${o.activo}</b>: ${o.motivo}`);
  }
  lines.push("");
  lines.push(`<b>Recomendación por perfil CNV</b>`);
  for (const r of informe.recomendacionPorPerfil) lines.push(`• ${r.perfil}: ${r.claseActivo} — ${r.motivo}`);
  if (informe.herramientasSugeridas.length) {
    lines.push("");
    lines.push(`<b>Herramientas sugeridas</b>`);
    for (const h of informe.herramientasSugeridas) lines.push(`• ${h.tab}: ${h.motivo}`);
  }
  // Datos duros de referencia (siempre con fuente)
  lines.push("");
  lines.push(`<i>Datos: Dólar oficial $${snapshot.local.dolares.oficial} | Blue $${snapshot.local.dolares.blue} | MEP $${snapshot.local.dolares.mep} | CCL $${snapshot.local.dolares.ccl} | Riesgo país ${snapshot.local.riesgoPais.valor} | Merval ${snapshot.local.merval.puntos} (${snapshot.local.merval.variacionPct}%)</i>`);
  if (snapshot.indec.emae || snapshot.indec.comercioExterior) {
    const e = snapshot.indec.emae;
    const c = snapshot.indec.comercioExterior;
    const extras: string[] = [];
    if (e) extras.push(`EMAE ${e.varMensualPct}% m/m ${e.varInteranualPct}% ia (${e.fechaDato})`);
    if (c) extras.push(`Comercio ext. Exp. USD${c.exportacionesUSD} +${c.varExportacionesInteranualPct}% / Imp. USD${c.importacionesUSD} ${c.varImportacionesInteranualPct}% — saldo USD${c.saldoUSD} (acum. USD${c.saldoAcumuladoAnioUSD})`);
    if (extras.length) lines.push(`<i>${extras.join(" | ")}</i>`);
  }
  lines.push("");
  lines.push(`<i>Informe generado ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })} ART — Fuente: Yahoo Finance, BCRA, ArgentinaDatos, CriptoYa, INDEC, ForexFactory. Información educativa, no recomendación.</i>`);
  return lines.join("\n");
}

export function formatInformeParaChat(informe: InformeMatutinoIA, snapshot: MarketContextSnapshot): string {
  // Versión Markdown para el chat lateral (ReactMarkdown)
  const md: string[] = [];
  md.push(`# Lo que hay que saber esta mañana — ${informe.fecha} · ${informe.humorMercado}`);
  md.push("");
  md.push(`> ${informe.resumenEjecutivo}`);
  md.push("");
  md.push(`## Internacional — ${informe.radarInternacional.titular}`);
  for (const b of informe.radarInternacional.bullets) md.push(`- ${b}`);
  md.push("");
  md.push(`## Local — ${informe.radarLocal.titular}`);
  for (const b of informe.radarLocal.bullets) md.push(`- ${b}`);
  md.push("");
  md.push(`## Agenda del día`);
  if (informe.agendaDelDia.length) {
    for (const ev of informe.agendaDelDia) md.push(`- **${ev.hora !== "00:00" ? ev.hora + " hs" : ""}** ${ev.evento} _[${ev.relevancia}]_`);
  } else if (snapshot.calendarioHoy.length) {
    for (const ev of snapshot.calendarioHoy.slice(0, 8)) md.push(`- **${ev.hora}** ${ev.evento} (${ev.pais})${ev.consenso ? ` consenso ${ev.consenso}` : ""}${ev.previo ? ` previo ${ev.previo}` : ""} _[${ev.relevancia}]_`);
  } else {
    md.push(`- Sin eventos programados para hoy`);
  }
  if (informe.oportunidadesDelDia.length) {
    md.push("");
    md.push(`## Oportunidades del día`);
    for (const o of informe.oportunidadesDelDia) md.push(`- **${o.activo}**: ${o.motivo}`);
  }
  md.push("");
  md.push(`## Recomendación por perfil CNV`);
  for (const r of informe.recomendacionPorPerfil) md.push(`- **${r.perfil}**: ${r.claseActivo} — ${r.motivo}`);
  if (informe.herramientasSugeridas.length) {
    md.push("");
    md.push(`## Herramientas sugeridas`);
    for (const h of informe.herramientasSugeridas) md.push(`- **${h.tab}**: ${h.motivo}`);
  }
  md.push("");
  md.push(`---`);
  md.push(`*Dólar: oficial $${snapshot.local.dolares.oficial} | blue $${snapshot.local.dolares.blue} | MEP $${snapshot.local.dolares.mep} | CCL $${snapshot.local.dolares.ccl} | Riesgo ${snapshot.local.riesgoPais.valor} | Merval ${snapshot.local.merval.puntos} (${snapshot.local.merval.variacionPct}%)*`);
  return md.join("\n");
}

export async function broadcastInformeATelegram(informe: InformeMatutinoIA, snapshot: MarketContextSnapshot): Promise<string> {
  try {
    const { sendAgentMessage, getAgentBotConfig } = await import("../telegram.server");
    const { getTelegramConfig, sendTelegramMessage } = await import("../telegram.server");
    const html = formatInformeParaTelegram(informe, snapshot);
    const results: string[] = [];
    // 1) Bot agente @fpxbs777_bot -> chats permitidos (Cintia + extensible)
    const agentCfg = getAgentBotConfig();
    for (const chatId of agentCfg.allowedChats) {
      try {
        await sendAgentMessage(chatId, html);
        results.push(`[AGENTE ${chatId}] OK`);
      } catch (e) {
        results.push(`[AGENTE ${chatId}] FAIL ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // 2) Canal CORONAR @coronar_inversiones_bot si está configurado
    const tgCfg = getTelegramConfig();
    if (tgCfg.token && tgCfg.chatIds.length) {
      const r = await sendTelegramMessage({ text: html, parseMode: "HTML" });
      results.push(r);
    } else {
      results.push("[CANAL CORONAR] skip — sin TELEGRAM_BOT_TOKEN/CHAT_ID");
    }
    return results.join("\n");
  } catch (e) {
    return `[BROADCAST ERROR] ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function buscarPorFecha(fecha: string): Promise<InformePersistido | null> {
  const { readFile, existsSync, DATA_DIR } = await fs();
  const path = dataPath(fecha, DATA_DIR);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf-8")) as InformePersistido;
  } catch {
    return null;
  }
}

async function buscarUltimoDisponible(): Promise<InformePersistido | null> {
  const { readFile, readdir, existsSync, DATA_DIR } = await fs();
  if (!existsSync(DATA_DIR)) return null;
  const files = (await readdir(DATA_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  try {
    return JSON.parse(await readFile(`${DATA_DIR}/${files[0]}`, "utf-8")) as InformePersistido;
  } catch {
    return null;
  }
}

async function calcularMiPortafolioHoy(): Promise<null> {
  return null;
}

export const getInformeDelDia = createServerFn({ method: "GET" }).handler(
  async (): Promise<InformeMatutinoCompleto> => {
    const hoy = obtenerFechaART();
    const informeHoy = await buscarPorFecha(hoy);

    if (informeHoy) {
      const miPortafolioHoy = await calcularMiPortafolioHoy();
      return {
        ia: informeHoy.informe,
        miPortafolioHoy,
        fuenteDatos: "ia",
        generadoEn: informeHoy.generadoEn,
      };
    }

    const ultimoDisponible = await buscarUltimoDisponible();
    if (ultimoDisponible) {
      return {
        ia: ultimoDisponible.informe,
        miPortafolioHoy: null,
        fuenteDatos: "fallback-ayer",
        generadoEn: ultimoDisponible.generadoEn,
      };
    }

    // Fallback vacío: evita que SSR falle cuando no hay informes generados.
    return {
      ia: {
        fecha: obtenerFechaART(),
        humorMercado: "mixto",
        resumenEjecutivo: "El informe matutino aún no está disponible. Volvé a intentar más tarde.",
        radarInternacional: { titular: "Sin datos", bullets: [] },
        radarLocal: { titular: "Sin datos", bullets: [] },
        agendaDelDia: [],
        oportunidadesDelDia: [],
        recomendacionPorPerfil: [
          { perfil: "Conservador", claseActivo: "—", motivo: "Esperar el informe del día" },
          { perfil: "Moderado", claseActivo: "—", motivo: "Esperar el informe del día" },
          { perfil: "Agresivo", claseActivo: "—", motivo: "Esperar el informe del día" },
          { perfil: "Jubilatorio", claseActivo: "—", motivo: "Esperar el informe del día" },
          { perfil: "Diversificador", claseActivo: "—", motivo: "Esperar el informe del día" },
          { perfil: "Trading", claseActivo: "—", motivo: "Esperar el informe del día" },
          { perfil: "Ahorro", claseActivo: "—", motivo: "Esperar el informe del día" },
        ],
        herramientasSugeridas: [],
      },
      miPortafolioHoy: null,
      fuenteDatos: "fallback-vacio",
      generadoEn: new Date().toISOString(),
    };
  },
);

export async function generarYGuardarInforme(opts?: { broadcast?: boolean }): Promise<{ ok: boolean; motivo?: string; informe?: InformeMatutinoIA; snapshot?: MarketContextSnapshot }> {
  const hoy = obtenerFechaART();
  const nowISO = new Date().toISOString();

  const snapshot = await buildMarketSnapshot();
  const informe = await generateInformeMatutino(snapshot);

  if (!informe) {
    return { ok: false, motivo: "Gemini no devolvió informe válido" };
  }

  await saveInformeDelDia({ fecha: hoy, snapshot, informe, generadoEn: nowISO });

  if (opts?.broadcast) {
    const res = await broadcastInformeATelegram(informe, snapshot);
    console.log("[INFORME] broadcast resultado:", res);
  }

  return { ok: true, informe, snapshot };
}
