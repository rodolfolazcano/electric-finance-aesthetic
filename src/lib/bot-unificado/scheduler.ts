/**
 * Scheduler siempre-encendido del Bot Unificado.
 *
 * Arranca un loop interno (setInterval de 60s) cuando el proceso del servidor
 * está vivo (dev Node / VPS / Render). En serverless (Cloudflare) el intervalo
 * no sobrevive entre invocaciones: ahí cubre el endpoint
 * /api/cron/bot-unificado con un disparador externo.
 *
 * Guardas:
 *  - BOT_UNIFICADO_AUTO=false desactiva el arranque automático.
 *  - Flag en globalThis para no duplicar el timer (HMR / doble import).
 *  - El motor tiene su propio lock anti-solapamiento.
 */

const g = globalThis as unknown as {
  __botUnificadoTimer?: ReturnType<typeof setInterval>;
  __botUnificadoArrancado?: boolean;
  __botUnificadoUltimoTick?: string;
};

export function schedulerActivo(): boolean {
  return Boolean(g.__botUnificadoTimer);
}

export function ultimoTick(): string | null {
  return g.__botUnificadoUltimoTick ?? null;
}

async function tick(): Promise<void> {
  try {
    g.__botUnificadoUltimoTick = new Date().toISOString();
    const { cargarConfig } = await import("./estado");
    const config = await cargarConfig();
    if (!config.activo) return;
    const { correrCiclo } = await import("./motor");
    await correrCiclo({ disparo: "scheduler" });
  } catch (e) {
    console.error("[bot-unificado] tick falló:", e instanceof Error ? e.message : e);
  }
}

/** Idempotente: arranca el loop si corresponde y aún no está corriendo. */
export function arrancarBotUnificado(): boolean {
  if (g.__botUnificadoTimer || g.__botUnificadoArrancado) return false;
  if ((process.env.BOT_UNIFICADO_AUTO ?? "true").toLowerCase() === "false") return false;

  g.__botUnificadoArrancado = true;
  // Primer chequeo diferido: deja terminar el boot sin competir por recursos.
  setTimeout(() => void tick(), 20_000);
  g.__botUnificadoTimer = setInterval(() => void tick(), 60_000);
  console.log("[bot-unificado] scheduler interno activo (chequeo cada 60s)");
  return true;
}
