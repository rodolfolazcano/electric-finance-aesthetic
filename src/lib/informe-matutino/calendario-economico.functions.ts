// Calendario económico del día CON consenso y dato previo.
//
// Fuente: feed JSON semanal de Forex Factory (nfs.faireconomy.media),
// gratuito y sin key. Se actualiza cada pocos minutos en el origen.
//
//   GET https://nfs.faireconomy.media/ff_calendar_thisweek.json
//
// Cada evento trae: title, country (moneda), date (ISO con offset -04:00),
// impact (High/Medium/Low/Holiday), forecast (consenso) y previous.
//
// Las horas se convierten a hora Argentina (ART, America/Argentina/Buenos_Aires)
// porque todo el informe se publica en horario local. Si el feed falla,
// devuelve [] y el informe usa la agenda estática curada (agenda-economica.ts)
// como respaldo — nunca rompe la corrida.

import { getCached, setCache } from "../cache";

export interface EventoCalendario {
  hora: string; // "11:45" hora ART ("--" si no tiene)
  evento: string;
  pais: string;
  consenso: string | null;
  previo: string | null;
  relevancia: "alta" | "media" | "baja";
}

const CACHE_KEY = "calendario-economico-hoy";
const CACHE_TTL = 30 * 60 * 1000;

const FEED_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

interface FeedEvento {
  title?: string;
  country?: string;
  date?: string;
  impact?: string;
  forecast?: string;
  previous?: string;
}

const PAIS: Record<string, string> = {
  USD: "EE.UU.",
  EUR: "Eurozona",
  GBP: "Reino Unido",
  JPY: "Japón",
  CNY: "China",
  BRL: "Brasil",
  CAD: "Canadá",
  MXN: "México",
  AUD: "Australia",
  NZD: "Nueva Zelanda",
  CHF: "Suiza",
  ALL: "Global",
};

function relevanciaDe(impact: string | undefined): EventoCalendario["relevancia"] | null {
  const i = (impact ?? "").toLowerCase();
  if (i === "high") return "alta";
  if (i === "medium") return "media";
  if (i === "low") return "baja";
  return null; // holidays u otros: fuera
}

function horaART(fechaISO: string): string {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(fechaISO));
  } catch {
    return "--";
  }
}

/** Fecha de hoy en ART como YYYY-MM-DD. */
export function hoyART(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function esHoyEnART(fechaISO: string): boolean {
  try {
    return (
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Argentina/Buenos_Aires",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(fechaISO)) === hoyART()
    );
  } catch {
    return false;
  }
}

function limpiar(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

/** Devuelve los eventos de HOY (ART) con consenso y previo, ordenados por hora. */
export async function getCalendarioEconomicoHoy(): Promise<EventoCalendario[]> {
  const cached = getCached<EventoCalendario[]>(CACHE_KEY, CACHE_TTL);
  if (cached) return cached;

  let eventos: EventoCalendario[] = [];
  try {
    const res = await fetch(FEED_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const feed = (await res.json()) as FeedEvento[];
    if (!Array.isArray(feed)) throw new Error("feed invalido");

    eventos = feed
      .filter((e) => e.title && e.date && esHoyEnART(e.date))
      .map((e): EventoCalendario => ({
        hora: horaART(e.date!),
        evento: String(e.title).trim(),
        pais: PAIS[e.country ?? ""] ?? (e.country || ""),
        consenso: limpiar(e.forecast),
        previo: limpiar(e.previous),
        relevancia: relevanciaDe(e.impact) ?? "baja",
      }))
      .filter((e) => e.relevancia !== null);

    // Orden: primero por relevancia-weight para recorte, luego por hora.
    const peso = { alta: 0, media: 1, baja: 2 } as const;
    eventos.sort((a, b) => a.hora.localeCompare(b.hora) || peso[a.relevancia] - peso[b.relevancia]);
    // Máximo 14 eventos: prioriza alta/media pero mantiene orden cronológico.
    if (eventos.length > 14) {
      const importantes = eventos.filter((e) => e.relevancia !== "baja").slice(0, 14);
      eventos = importantes.length >= 4 ? importantes : eventos.slice(0, 14);
    }
    setCache(CACHE_KEY, eventos);
  } catch {
    // Feed caído: devolvemos lo que haya (vacío) sin romper la corrida.
  }
  return eventos;
}
