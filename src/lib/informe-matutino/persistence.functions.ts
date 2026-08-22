import { createServerFn } from "@tanstack/react-start";
import { buildMarketSnapshot } from "./snapshot.functions";
import { generateInformeMatutino } from "./gemini.functions";
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
  await writeFile(dataPath(data.fecha, DATA_DIR), JSON.stringify(data, null, 2), "utf-8");
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

export async function generarYGuardarInforme(): Promise<{ ok: boolean; motivo?: string }> {
  const hoy = obtenerFechaART();
  const nowISO = new Date().toISOString();

  const snapshot = await buildMarketSnapshot();
  const informe = await generateInformeMatutino(snapshot);

  if (!informe) {
    return { ok: false, motivo: "Gemini no devolvió informe válido" };
  }

  await saveInformeDelDia({ fecha: hoy, snapshot, informe, generadoEn: nowISO });
  return { ok: true };
}
