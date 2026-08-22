/**
 * Motor del ciclo híbrido:
 *   estrategias vencidas → scanners cuantitativos → dedupe + cooldown →
 *   agente de razonamiento (valida/redacta) → Telegram → persistencia.
 */

import { validarYRedactar } from "./agente";
import { ESTRATEGIAS } from "./estrategias";
import {
  cargarConfig,
  cargarUltimaCorrida,
  fueraDeCooldown,
  guardarUltimaCorrida,
  registrarResultadoCompleto,
} from "./estado";
import type { CandidatoSenal, ResultadoCiclo, SenalFinal } from "./tipos";
import { sendTelegramMessage, sendTelegramSignal } from "@/lib/telegram.server";

/** Hora actual en Argentina como "HH:MM". */
function horaART(): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function dentroDeVentana(cfg: { desde?: string | null; hasta?: string | null }): boolean {
  if (!cfg.desde && !cfg.hasta) return true;
  const h = horaART();
  if (cfg.desde && h < cfg.desde) return false;
  if (cfg.hasta && h > cfg.hasta) return false;
  return true;
}

const lock = globalThis as unknown as { __botUnificadoCorriendo?: boolean };

export async function correrCiclo(opts: {
  disparo: ResultadoCiclo["disparo"];
  estrategiasFiltro?: string[];
  forzar?: boolean;
}): Promise<ResultadoCiclo> {
  const { disparo } = opts;
  const iniciadoEn = new Date().toISOString();
  const t0 = Date.now();
  const errores: string[] = [];

  if (lock.__botUnificadoCorriendo) {
    return {
      iniciadoEn,
      duracionMs: 0,
      disparo,
      estrategiasCorridas: [],
      candidatos: 0,
      senales: [],
      resumenAgente: null,
      enviadasTelegram: 0,
      errores: ["ya hay un ciclo corriendo"],
    };
  }
  lock.__botUnificadoCorriendo = true;
  try {
    const config = await cargarConfig();
    if (!config.activo && !opts.forzar) {
      return {
        iniciadoEn,
        duracionMs: Date.now() - t0,
        disparo,
        estrategiasCorridas: [],
        candidatos: 0,
        senales: [],
        resumenAgente: null,
        enviadasTelegram: 0,
        errores: ["bot desactivado en config"],
      };
    }

    // 1) Estrategias vencidas
    const ultimas = await cargarUltimaCorrida();
    const ahora = Date.now();
    const vencidas = ESTRATEGIAS.filter((e) => {
      if (opts.estrategiasFiltro?.length && !opts.estrategiasFiltro.includes(e.id)) return false;
      const cfgEstrategia = config.estrategias.find((c) => c.id === e.id);
      if (cfgEstrategia && !cfgEstrategia.activa && !opts.forzar) return false;
      if (disparo === "scheduler" && !dentroDeVentana(cfgEstrategia ?? {})) return false;
      const ultimaStr = ultimas[e.id];
      if (!ultimaStr || opts.forzar) return true;
      return ahora - new Date(ultimaStr).getTime() >= cfgEstrategia!.cadaMinutos * 60_000;
    });

    // 2) Scanners cuantitativos
    let candidatos: CandidatoSenal[] = [];
    for (const estrategia of vencidas) {
      try {
        const producidos = await estrategia.escanear();
        candidatos.push(...producidos);
      } catch (e) {
        errores.push(`${estrategia.id}: ${e instanceof Error ? e.message : "fallo scanner"}`);
      }
    }

    // Dedupe por ticker+dirección (mejor prob gana)
    const mejores = new Map<string, CandidatoSenal>();
    for (const c of candidatos) {
      const clave = `${c.tickerBCBA}|${c.direccion}`;
      const previo = mejores.get(clave);
      if (!previo || c.prob > previo.prob) mejores.set(clave, c);
    }
    candidatos = [...mejores.values()].sort((a, b) => b.prob - a.prob).slice(0, 10);

    // Cooldown anti-spam
    const frescos: CandidatoSenal[] = [];
    for (const c of candidatos) {
      const ok = await fueraDeCooldown(c.tickerBCBA, c.direccion, c.estrategia, config.cooldownHoras);
      if (ok) frescos.push(c);
    }

    if (!vencidas.length) {
      return {
        iniciadoEn,
        duracionMs: Date.now() - t0,
        disparo,
        estrategiasCorridas: [],
        candidatos: 0,
        senales: [],
        resumenAgente: null,
        enviadasTelegram: 0,
        errores,
      };
    }

    // 3) Agente de razonamiento valida y redacta
    let senales: SenalFinal[] = [];
    let resumenAgente: string | null = null;
    if (frescos.length) {
      const resultado = await validarYRedactar(frescos);
      senales = resultado.senales;
      resumenAgente = resultado.resumen;
      if (!resultado.usoAgente) errores.push("agente no disponible: señales determinísticas");
    }
    senales = senales.sort((a, b) => b.confianza - a.confianza).slice(0, config.maxSenalesPorCiclo);

    // 4) Telegram
    let enviadasTelegram = 0;
    if (config.telegramEnviar && senales.length) {
      try {
        const fuertes = senales.filter((s) => s.confianza >= config.probMinimaEnvio);
        const aEnviar = fuertes.length ? fuertes : senales.filter((s) => s.senal.startsWith("COMPRA")).slice(0, 2);
        for (const s of aEnviar.slice(0, 4)) {
          await sendTelegramSignal({
            ticker: s.tickerBCBA,
            senal: s.senal,
            precio: s.precio ?? undefined,
            variacion1d: s.variacion1d ?? undefined,
            motivo: s.motivo.slice(0, 300),
            nivel: s.nivel ?? undefined,
            fuente: `bot-unificado · ${s.estrategia} · ${s.fuente}`,
          });
          enviadasTelegram++;
        }
        if (resumenAgente) {
          await sendTelegramMessage({ text: `CORONAR Bot Unificado — ${new Date().toLocaleString("es-AR")}\n${resumenAgente}` });
        }
      } catch (e) {
        errores.push(`telegram: ${e instanceof Error ? e.message : "fallo envío"}`);
      }
    }

    // 5) Persistencia
    await registrarResultadoCompleto(
      {
        iniciadoEn,
        duracionMs: Date.now() - t0,
        disparo,
        estrategiasCorridas: vencidas.map((e) => e.id),
        candidatos: candidatos.length,
        senales,
        resumenAgente,
        enviadasTelegram,
        errores,
      },
      enviadasTelegram,
    );
    const nuevoMapa = { ...ultimas };
    for (const e of vencidas) nuevoMapa[e.id] = new Date().toISOString();
    await guardarUltimaCorrida(nuevoMapa);

    return {
      iniciadoEn,
      duracionMs: Date.now() - t0,
      disparo,
      estrategiasCorridas: vencidas.map((e) => e.id),
      candidatos: candidatos.length,
      senales,
      resumenAgente,
      enviadasTelegram,
      errores,
    };
  } finally {
    lock.__botUnificadoCorriendo = false;
  }
}
