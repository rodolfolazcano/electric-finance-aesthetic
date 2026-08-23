// Cron: ALERTAS de publicaciones automáticas CORONAR.
//
// Monitorea el motor unificado (4 capas) y, cada vez que una señal supera el
// umbral de scoring (> 6.0/10 = 60% por defecto), valida con noticias del día,
// genera slide PNG profesional + texto editorial y publica en el bot de
// publicaciones (@coronar_inversiones_bot). Anti-duplicado por ticker+fecha.
//
// Disparo manual:
//   GET /api/cron/alerta-publicaciones?token=<TELEGRAM_WEBHOOK_SECRET>&umbral=6&max=3
// Vercel Cron envía header x-vercel-cron (aceptado automáticamente).

import { createFileRoute } from "@tanstack/react-router";
import { getAgentBotConfig, getTelegramConfig } from "@/lib/telegram.server";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

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

function fechaHoy(): string {
  return new Date().toLocaleDateString("es-AR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

// ── Anti-duplicado persistente (.data/publicaciones/enviadas.json) ─────────

async function leerEnviadas(): Promise<Record<string, unknown>> {
  try {
    const p = path.join(process.cwd(), ".data", "publicaciones", "enviadas.json");
    return JSON.parse(await readFile(p, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function marcarEnviadas(claves: string[]): Promise<void> {
  const dir = path.join(process.cwd(), ".data", "publicaciones");
  await mkdir(dir, { recursive: true });
  const p = path.join(dir, "enviadas.json");
  const data = await leerEnviadas();
  // purga >7 días
  const limite = Date.now() - 7 * 24 * 3600 * 1000;
  for (const [k, v] of Object.entries(data)) {
    const ts = (v as { ts?: number })?.ts ?? 0;
    if (ts < limite) delete data[k];
  }
  for (const k of claves) data[k] = { fecha: fechaHoy(), ts: Date.now() };
  const tmp = `${p}.tmp.${Date.now()}`;
  await writeFile(tmp, JSON.stringify(data), "utf-8");
  const { rename } = await import("node:fs/promises");
  await rename(tmp, p);
}

async function manejar(request: Request): Promise<Response> {
  if (!autorizado(request)) {
    return Response.json({ ok: false, motivo: "no autorizado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const umbral = Math.min(10, Math.max(3, Number(url.searchParams.get("umbral") ?? "6") || 6));
  const maxPub = Math.min(8, Math.max(1, Number(url.searchParams.get("max") ?? "2") || 2));
  const simbolosParam = url.searchParams.get("simbolos") ?? "";
  const simbolos = simbolosParam
    ? simbolosParam.split(/[,\s;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean)
    : [];

  try {
    // 1) Señales del motor unificado (funciones existentes de la app)
    const { generarSenalesUnificadas } = await import("@/lib/senales/motor-unificado");
    const { senales } = await (generarSenalesUnificadas as unknown as (
      s: string[],
      o: { topN: number; filtro: string },
    ) => Promise<{ senales: Array<Record<string, unknown>>; resumen: string }>)(simbolos, {
      topN: 15,
      filtro: "todos",
    });

    if (!senales.length) {
      return Response.json({ ok: true, publicado: 0, motivo: "sin señales del motor" });
    }

    // 2) Filtro scoring > umbral (60%) + confianza mínima
    const candidatas = senales
      .map((s) => s as { ticker?: string; senal?: string; scoreTotal?: number; confianza?: number; motivo?: string; precio?: number })
      .filter(
        (s) =>
          typeof s.scoreTotal === "number" &&
          s.scoreTotal >= umbral &&
          (typeof s.confianza !== "number" || s.confianza >= 0.5),
      )
      .slice(0, maxPub);

    if (!candidatas.length) {
      return Response.json({ ok: true, publicado: 0, motivo: `ninguna señal ≥ ${umbral}/10 hoy` });
    }

    const enviadasPrevias = await leerEnviadas();
    const publicadas: Array<{ ticker: string; score: number; detalle: string }> = [];
    const clavesNuevas: string[] = [];

    for (const s of candidatas) {
      const ticker = String(s.ticker ?? "").toUpperCase();
      if (!ticker || typeof s.scoreTotal !== "number") continue;
      const clave = `pub:${fechaHoy()}:${ticker}`;
      if (enviadasPrevias[clave]) continue; // ya publicada hoy

      // 3) Validación cruzada: noticias del día + fundamentales vía publicacion.server
      const { obtenerDatosPublicacion, armarTextoPublicacion, generarSlidePng } = await import("@/lib/publicacion.server");
      const datos = await obtenerDatosPublicacion(ticker);
      if (!datos.precio) continue; // sin dato real → no publica (anti-fake)

      const png = await generarSlidePng(datos).catch(() => null);
      const texto = armarTextoPublicacion(datos, s.senal, s.motivo);

      // 4) Publicar al bot de publicaciones; fallback agente
      const cfgPub = getTelegramConfig();
      const cfgAgente = getAgentBotConfig();
      let enviado = false;
      const detalle: string[] = [];
      if (cfgPub.token && cfgPub.chatIds.length) {
        const { sendTelegramMessage } = await import("@/lib/telegram.server");
        const { sendSignalsPhotoBuffer } = await import("@/lib/telegram.server");
        for (const cid of cfgPub.chatIds) {
          let fotoOk = false;
          if (png) fotoOk = await sendSignalsPhotoBuffer(cid, png, { caption: `${ticker} · score ${Number(s.scoreTotal).toFixed(1)}/10` });
          const msgOk = await sendTelegramMessage({ text: texto, chatId: cid, parseMode: "HTML" }).then(() => true).catch(() => false);
          detalle.push(`pub→${cid}:foto=${fotoOk ? "ok" : "-"},msg=${msgOk ? "ok" : "fail"}`);
          if (fotoOk || msgOk) enviado = true;
        }
      }
      if (!enviado && cfgAgente.token && cfgAgente.allowedChats.length) {
        const { sendAgentMessage, sendAgentPhotoBuffer } = await import("@/lib/telegram.server");
        for (const cid of cfgAgente.allowedChats) {
          if (png) await sendAgentPhotoBuffer(cid, png, { caption: `${ticker} · ${Number(s.scoreTotal).toFixed(1)}/10` });
          await sendAgentMessage(cid, texto);
          detalle.push(`agente→${cid}`);
          enviado = true;
        }
      }

      if (enviado) {
        publicadas.push({ ticker, score: Number(s.scoreTotal.toFixed(1)), detalle: detalle.join(" ") });
        clavesNuevas.push(clave);
      }
    }

    if (clavesNuevas.length) await marcarEnviadas(clavesNuevas);

    return Response.json({
      ok: true,
      fecha: fechaHoy(),
      umbral,
      evaluadas: senales.length,
      publicadas,
    });
  } catch (e: unknown) {
    const detalle = e instanceof Error ? e.message : String(e);
    console.error("[alerta-publicaciones] error:", detalle);
    return Response.json({ ok: false, motivo: detalle }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/cron/alerta-publicaciones")({
  server: {
    handlers: {
      GET: async ({ request }) => manejar(request),
      POST: async ({ request }) => manejar(request),
    },
  },
});
