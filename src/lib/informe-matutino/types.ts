import type { SemaforoResult } from "../finance.functions";
import { InformeMatutinoIASchema } from "./schema";
import type { InformeMatutinoIA } from "./schema";
import type { EventoCalendario } from "./calendario-economico.functions";
import type { ResultadoCorporativo } from "./earnings.functions";
import type { IndecDatos } from "./indec.functions";
export type { InformeMatutinoIA };
export type { EventoCalendario, ResultadoCorporativo, IndecDatos };

// ─── Snapshot de datos (Fase 1 — backend, sin IA) ────────────────────────────

export interface Cierre {
  ticker: string;
  precio: number;
  variacionPct: number;
}

export interface Commodity {
  ticker: string;
  nombre: string;
  precio: number;
  variacionPct: number;
}

export interface Tasa {
  nombre: string;
  valor: number;
}

export interface AgendaEvento {
  hora: string;
  evento: string;
  relevancia: "alta" | "media" | "baja";
}

export interface PosicionCliente {
  ticker: string;
  cantidad: number;
  valorizado: number;
  pesoPct: number;
}

export interface ClienteActivo {
  nombre: string;
  perfilCNV: string | null;
  posiciones: PosicionCliente[];
}

export interface NoticiaCruda {
  titulo: string;
  fuente: string;
  resumen: string;
  url: string;
}

export interface MarketContextSnapshot {
  fecha: string;
  generadoEn: string;

  internacional: {
    cierreEEUU: Cierre[];
    asiaEuropa: Cierre[];
    commodities: Commodity[];
    tasas: Tasa[];
  };

  local: {
    dolares: {
      oficial: number;
      blue: number;
      mep: number;
      ccl: number;
      brechaCCLPct: number;
    };
    riesgoPais: { valor: number; variacionPuntos: number };
    reservas: { valorUSD: number; variacionUSD: number };
    inflacion: { mensualPct: number; interanualPct: number; fechaDato: string };
    uva: { valor: number };
    tasaPlazoFijo: { promedioTNA: number };
    merval: { puntos: number; variacionPct: number; enUSD: number };
  };

  agendaDelDia: AgendaEvento[];
  calendarioHoy: EventoCalendario[];
  resultadosCorporativos: ResultadoCorporativo[];
  indec: IndecDatos;
  screeners: import("../daily-opportunities.functions").MarketScreenersResult;
  macroContextoAR: import("../daily-opportunities.functions").MacroContextAR;
  noticiasCrudas: NoticiaCruda[];

  clienteActivo: ClienteActivo | null;
}

// ─── Informe completo (Fase 3 — ensamblado final) ────────────────────────────

export type FuenteDatos = "ia" | "fallback-ayer" | "fallback-vacio";

export interface InformeMatutinoCompleto {
  ia: InformeMatutinoIA;
  miPortafolioHoy: SemaforoResult[] | null;
  fuenteDatos: FuenteDatos;
  generadoEn: string;
}
