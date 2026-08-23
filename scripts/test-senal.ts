// Test instrumentado: qué capa del motor se cuelga
process.on("unhandledRejection", (e) => console.error("UNHANDLED:", e));

async function main() {
  const paso = async (nombre: string, fn: () => Promise<unknown>, ms = 25000) => {
    const t0 = Date.now();
    try {
      const r = await Promise.race([
        fn(),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms`)), ms)),
      ]);
      console.log(`OK   ${nombre} (${Date.now() - t0}ms)`);
      return r;
    } catch (e) {
      console.log(`FAIL ${nombre} (${Date.now() - t0}ms): ${e instanceof Error ? e.message : e}`);
      return null;
    }
  };

  const { fetchYahooChart } = await import("../src/lib/yahoo-http");
  await paso("fetchYahooChart TSLA", () => fetchYahooChart("TSLA", "1y", "1d"));

  const { claCiclo, claContextoMacro, claFicha } = await import("../src/lib/clarity-analysis");
  await paso("claCiclo", () => claCiclo());
  await paso("claContextoMacro", () => claContextoMacro());
  await paso("claFicha TSLA", () => claFicha("TSLA"));

  const { analizarSemaforo } = await import("../src/lib/semaforo.server");
  await paso("analizarSemaforo TSLA", () => analizarSemaforo("TSLA"));

  const { analizarRiesgo } = await import("../src/lib/riesgo");
  await paso("analizarRiesgo TSLA", () => (analizarRiesgo as any)("TSLA", "1y"));

  console.log("FIN — matando proceso colgado si algo sigue");
  setTimeout(() => process.exit(0), 1500);
}

main();
setTimeout(() => {
  console.error("PROCESO COLGADO — alguna lib queda con handles abiertos");
  process.exit(99);
}, 120000);
