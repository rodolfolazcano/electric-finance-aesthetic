import { createFileRoute } from "@tanstack/react-router";
import { ESTRATEGIAS } from "@/lib/bot-unificado/estrategias";
import { correrCiclo } from "@/lib/bot-unificado/motor";
import { arrancarBotUnificado, schedulerActivo, ultimoTick } from "@/lib/bot-unificado/scheduler";
import {
  cargarCiclos,
  cargarConfig,
  cargarHistorial,
  guardarConfig,
} from "@/lib/bot-unificado/estado";
import { isTelegramConfigured } from "@/lib/telegram.server";

export const Route = createFileRoute("/api/bot-unificado")({
  server: {
    handlers: {
      /** Estado completo del bot: config, scheduler, últimas señales y ciclos. */
      GET: async () => {
        arrancarBotUnificado();
        const config = await cargarConfig();
        const historial = await cargarHistorial();
        const ciclos = await cargarCiclos();
        return Response.json({
          ok: true,
          activo: config.activo,
          schedulerInterno: schedulerActivo(),
          ultimoTickScheduler: ultimoTick(),
          telegram: isTelegramConfigured(),
          config,
          proximaCorrida: Object.fromEntries(
            ESTRATEGIAS.map((e) => {
              const cfgE = config.estrategias.find((c) => c.id === e.id);
              return [e.id, `${cfgE?.activa ? "cada" : "off"} ${cfgE?.cadaMinutos ?? e.cadaMinutos}min${cfgE?.desde ? ` (${cfgE.desde}-${cfgE.hasta ?? "?"} ART)` : ""}`];
            }),
          ),
          senalesUltimas7d: historial.slice(-20).reverse(),
          ultimosCiclos: ciclos.slice(0, 10),
          ayuda:
            "POST action=correr {estrategias?, forzar?} | action=toggle | action=estrategia {id, activa} | action=config {patch}",
        });
      },

      POST: async ({ request }) => {
        let body: {
          action?: string;
          estrategias?: string[];
          forzar?: boolean;
          id?: string;
          activa?: boolean;
          patch?: Partial<{ activo: boolean; telegramEnviar: boolean; maxSenalesPorCiclo: number; cooldownHoras: number; probMinimaEnvio: number }>;
        };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "JSON invalido" }, { status: 400 });
        }
        const action = (body.action ?? "correr").toLowerCase();

        if (action === "correr") {
          const resultado = await correrCiclo({
            disparo: "manual",
            estrategiasFiltro: body.estrategias,
            forzar: body.forzar !== false,
          });
          return Response.json({ ok: resultado.errores.every((e) => !e.startsWith("agente")), resultado });
        }

        if (action === "toggle") {
          const config = await cargarConfig();
          config.activo = !config.activo;
          await guardarConfig(config);
          if (config.activo) arrancarBotUnificado();
          return Response.json({ ok: true, activo: config.activo });
        }

        if (action === "estrategia") {
          if (!body.id) return Response.json({ error: "Falta id" }, { status: 400 });
          const config = await cargarConfig();
          const objetivo = config.estrategias.find((e) => e.id === body.id);
          if (!objetivo) return Response.json({ error: `Estrategia inexistente: ${body.id}` }, { status: 404 });
          objetivo.activa = body.activa ?? !objetivo.activa;
          await guardarConfig(config);
          return Response.json({ ok: true, estrategia: objetivo });
        }

        if (action === "config" && body.patch) {
          const config = await cargarConfig();
          Object.assign(config, body.patch);
          await guardarConfig(config);
          return Response.json({ ok: true, config });
        }

        return Response.json({ error: "action debe ser correr|toggle|estrategia|config" }, { status: 400 });
      },
    },
  },
});
