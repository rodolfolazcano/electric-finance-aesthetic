import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCicloEconomico, getIntermarketAnalysis } from "@/lib/intermarket-analysis.functions";
import { getMatrizCAPM } from "@/lib/capm.functions";
import { getSectorPeers } from "@/lib/fundamental-af.functions";
import { filtrarPorCicloEconomico } from "@/lib/score-sectorial.functions";
import { getYahooQuoteServer } from "@/lib/market-data.functions";

// â”€â”€â”€ Esquemas Zod â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ClienteSchema = z.object({
  nombre: z.string().min(1).max(100),
  apellido: z.string().max(100).optional().default(""),
  email: z.string().max(200).optional().default(""),
  telefono: z.string().max(50).optional().default(""),
  direccion: z.string().max(500).optional().default(""),
  notas: z.string().max(5000).optional().default(""),
  perfil_inversor: z.string().max(50).optional().default("moderado"),
  activos: z.array(z.string()).optional().default([]),
});

const FundamentoSnapshotSchema = z.object({
  score: z.number(),
  peTrailing: z.number().nullable(),
  roe: z.number().nullable(),
  fcfYield: z.number().nullable(),
  upsideAnalistas: z.number().nullable(),
  senal: z.string(),
  origen: z.literal("snapshot_original"),
});

const RecomendacionSchema = z.object({
  clienteId: z.string().optional(),
  tickerIol: z.string().min(1).max(20),
  tickerYf: z.string().max(20).nullable().optional(),
  tipoInstrumento: z.enum(["accion", "cedear", "bono", "on", "letra", "fci"]),
  fechaRecomendacion: z.string(),
  precioRecomendado: z.number().positive(),
  monedaRecomendada: z.enum(["ARS", "USD"]),
  fundamentoSnapshot: FundamentoSnapshotSchema,
  precioObjetivo: z.number().nullable().optional(),
  horizonteDias: z.number().int().positive().nullable().optional(),
  tesis: z.string(),
  ratioCedearAlMomento: z.number().nullable().optional(),
});

// â”€â”€â”€ Tipos exportados â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type Cliente = z.infer<typeof ClienteSchema> & {
  id: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
};

export type FundamentoSnapshot = z.infer<typeof FundamentoSnapshotSchema>;

/** Tipo amplio para la respuesta de la API â€” permite nulls donde el form exige datos */
export type RecomendacionBacktest = z.infer<typeof RecomendacionSchema> & {
  id: string;
  created_at: string;
  updated_at: string;
  // Los campos que vuelven de Supabase pueden ser null en el JSON raw
  clienteId?: string;
  tickerIol?: string;
  tickerYf?: string | null;
  tipoInstrumento?: string;
  fechaRecomendacion?: string;
  precioRecomendado?: number;
  monedaRecomendada?: string;
  fundamentoSnapshot?: FundamentoSnapshot | null;
  precioObjetivo?: number | null;
  horizonteDias?: number | null;
  tesis?: string;
  ratioCedearAlMomento?: number | null;
  precioActual?: number | null;
  retorno?: number | null;
  retornoVsTarget?: number | null;
  diasTranscurridos?: number;
  cumplioTarget?: boolean | null;
};

export type DecisionActivo = {
  ticker: string;
  sector: string | null;
  decision: "comprar" | "mantener" | "vender";
  scoreFundamental: number | null;
  cicloPermiteSector: boolean;
  cicloLabel: string;
  motivo: string;
};

// â”€â”€â”€ IOL â†” Yahoo Finance Ticker Mapping â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CEDEAR_MAP: Record<string, string> = {
  "GGALD": "GGAL", "BMAD": "BMA", "BBARD": "BBAR", "SUPVD": "SUPV",
  "YPFDD": "YPF", "PAMPD": "PAMP", "CRESD": "CRESY", "IRSAD": "IRS",
  "TECO2D": "TEO", "CEPUD": "CEPU", "LOMAD": "LOMA", "EDND": "EDN",
  "TXARD": "TX", "TRAND": "TRA", "ALUAD": "ARNC",
  "AAPLD": "AAPL", "MSFTD": "MSFT", "NVDAD": "NVDA", "METAD": "META",
  "AMZD": "AMZN", "GOGLD": "GOOGL", "TSLAD": "TSLA",
  "SPYD": "SPY", "QQQD": "QQQ", "DIAD": "DIA",
};

export function mapearTickerIOLaYahoo(iolTicker: string): string {
  const tk = iolTicker.trim().toUpperCase();
  if (CEDEAR_MAP[tk]) return CEDEAR_MAP[tk];
  if (tk.endsWith("D")) return tk.slice(0, -1);
  return tk;
}

export function mapearTickerYahooaIOL(yahooTicker: string): string {
  const rev = Object.entries(CEDEAR_MAP).find(([, v]) => v === yahooTicker);
  if (rev) return rev[0];
  if (/^[A-Z]{1,5}$/.test(yahooTicker)) return yahooTicker;
  return yahooTicker;
}

// â”€â”€â”€ Precio actual de un ticker (Yahoo via server fn) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function fetchPrecioActual(ticker: string): Promise<number | null> {
  try {
    const q = await getYahooQuoteServer({ data: { symbol: ticker } });
    if (q?.precio != null) return q.precio;
    return null;
  } catch {
    return null;
  }
}

// â”€â”€â”€ CRUD Clientes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const listClientes = createServerFn({ method: "GET" })
  .handler(async () => {
    if (!supabaseAdmin?.from) return [] as Cliente[];
    const { data, error } = await supabaseAdmin
      .from("clientes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return [] as Cliente[];
    return (data ?? []) as Cliente[];
  });

export const getCliente = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    if (!supabaseAdmin?.from) return null;
    const { data: row, error } = await supabaseAdmin
      .from("clientes")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) return null;
    return row as Cliente;
  });

export const saveCliente = createServerFn({ method: "POST" })
  .validator((input: unknown) => ClienteSchema.parse(input))
  .handler(async ({ data }) => {
    if (!supabaseAdmin?.from) return null;
    const { data: row, error } = await supabaseAdmin
      .from("clientes")
      .insert({
        nombre: data.nombre,
        apellido: data.apellido ?? "",
        email: data.email ?? "",
        telefono: data.telefono ?? "",
        direccion: data.direccion ?? "",
        notas: data.notas ?? "",
        perfil_inversor: data.perfil_inversor ?? "moderado",
        activos: data.activos ?? [],
        metadata: {},
      })
      .select()
      .single();
    if (error) return null;
    return row as Cliente;
  });

export const updateCliente = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const schema = z.object({ id: z.string(), data: ClienteSchema });
    return schema.parse(input);
  })
  .handler(async ({ data }) => {
    if (!supabaseAdmin?.from) return null;
    const { data: row, error } = await supabaseAdmin
      .from("clientes")
      .update({ ...data.data, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select()
      .single();
    if (error) return null;
    return row as Cliente;
  });

export const deleteCliente = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    if (!supabaseAdmin?.from) return false;
    const { error } = await supabaseAdmin.from("clientes").delete().eq("id", data.id);
    return !error;
  });

// â”€â”€â”€ CRUD Recomendaciones â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const saveRecomendacion = createServerFn({ method: "POST" })
  .validator((input: unknown) => RecomendacionSchema.parse(input))
  .handler(async ({ data }) => {
    if (!supabaseAdmin?.from) return null;
    const row = {
      cliente_id: data.clienteId ?? null,
      ticker_iol: data.tickerIol.toUpperCase(),
      ticker_yf: data.tickerYf?.toUpperCase() ?? null,
      tipo_instrumento: data.tipoInstrumento,
      fecha_recomendacion: data.fechaRecomendacion,
      precio_recomendado: data.precioRecomendado,
      moneda_recomendada: data.monedaRecomendada,
      fundamento_snapshot: data.fundamentoSnapshot,
      precio_objetivo: data.precioObjetivo ?? null,
      horizonte_dias: data.horizonteDias ?? null,
      tesis: data.tesis,
      ratio_cedear_al_momento: data.ratioCedearAlMomento ?? null,
    };
    const { data: inserted, error } = await supabaseAdmin
      .from("recomendaciones")
      .insert(row)
      .select()
      .single();
    if (error) return null;
    return inserted as unknown as RecomendacionBacktest;
  });

export const listRecomendaciones = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ clienteId: z.string().optional() }).parse(input))
  .handler(async ({ data }) => {
    if (!supabaseAdmin?.from) return [] as RecomendacionBacktest[];
    let query = supabaseAdmin
      .from("recomendaciones")
      .select("*")
      .order("fecha_recomendacion", { ascending: false });
    if (data.clienteId) {
      query = query.eq("cliente_id", data.clienteId);
    }
    const { data: rows, error } = await query;
    if (error) return [] as RecomendacionBacktest[];
    return (rows ?? []) as unknown as RecomendacionBacktest[];
  });

export const getRecomendacion = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    if (!supabaseAdmin?.from) return null;
    const { data: row, error } = await supabaseAdmin
      .from("recomendaciones")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) return null;
    return row as unknown as RecomendacionBacktest;
  });

export const deleteRecomendacion = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    if (!supabaseAdmin?.from) return false;
    const { error } = await supabaseAdmin.from("recomendaciones").delete().eq("id", data.id);
    return !error;
  });

// â”€â”€â”€ Evaluar recomendaciones con precio real â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const evaluarRecomendaciones = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({
      tickers: z.array(z.string()).min(1).max(50),
      fechasRecomendacion: z.array(z.string()).optional(),
      preciosReferencia: z.array(z.number().nullable()).optional(),
      tickersIOL: z.array(z.string().nullable()).optional(),
      tiposInstrumento: z.array(z.string().nullable()).optional(),
    }).parse(input))
  .handler(async ({ data }) => {
    try {
      const cicloData = await getCicloEconomico();
      const analysisData = await getIntermarketAnalysis();
      const regimen = analysisData?.lecturaIntermarket?.regimen ?? "desconocido";

      const result: RecomendacionBacktest[] = [];
      for (let i = 0; i < data.tickers.length; i++) {
        const ticker = data.tickers[i];
        const fechaRec = data.fechasRecomendacion?.[i];
        const precioRef = data.preciosReferencia?.[i] ?? null;
        const tickerIOL = data.tickersIOL?.[i] ?? null;
        const tipoInst = data.tiposInstrumento?.[i] ?? null;

        try {
          const peers = await getSectorPeers({ data: { ticker } });
          const sector = peers?.sector ?? null;
          let r2ConSector: number | null = null;
          if (peers?.sector && peers.tickers.length > 0) {
            const todos = [ticker, ...peers.tickers.slice(0, 5)];
            const matriz = await getMatrizCAPM({ data: { tickers: todos } });
            if (matriz && matriz.rSquared && matriz.rSquared[0]) {
              r2ConSector = matriz.rSquared[0].slice(1).reduce((a, b) => Math.max(a, b), 0);
            }
          }

          const precioActual = await fetchPrecioActual(ticker);
          let retorno: number | null = null;
          let retornoVsTarget: number | null = null;
          let diasTranscurridos = 0;
          let cumplioTarget: boolean | null = null;

          if (precioRef != null && precioRef > 0 && precioActual != null) {
            retorno = ((precioActual - precioRef) / precioRef) * 100;
          }
          if (fechaRec) {
            const recDate = new Date(fechaRec);
            const now = new Date();
            diasTranscurridos = Math.floor((now.getTime() - recDate.getTime()) / (1000 * 60 * 60 * 24));
          }

          result.push({
            id: "",
            ticker,
            tickerIOL,
            tipoInstrumento: tipoInst ?? "OTRO",
            sector,
            fechaRecomendacion: fechaRec ?? new Date().toISOString().slice(0, 10),
            precioReferencia: precioRef,
            monedaReferencia: "USD",
            targetPrecio: null,
            horizonteTemporal: null,
            stopLoss: null,
            criterioSalida: null,
            motivos: [`Ciclo: ${cicloData?.ciclo?.label ?? "N/A"}`, `RÃ©gimen: ${regimen}`],
            scoreRecomendacion: 0,
            precioActual,
            retorno,
            retornoVsTarget,
            diasTranscurridos,
            cumplioTarget,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as unknown as RecomendacionBacktest);
        } catch {
          result.push({
            id: "",
            ticker,
            tickerIOL,
            tipoInstrumento: tipoInst ?? "OTRO",
            sector: null,
            fechaRecomendacion: fechaRec ?? new Date().toISOString().slice(0, 10),
            precioReferencia: precioRef,
            monedaReferencia: "USD",
            targetPrecio: null,
            horizonteTemporal: null,
            stopLoss: null,
            criterioSalida: null,
            motivos: ["Error al evaluar"],
            scoreRecomendacion: 0,
            precioActual: null,
            retorno: null,
            retornoVsTarget: null,
            diasTranscurridos: 0,
            cumplioTarget: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as unknown as RecomendacionBacktest);
        }
      }
      return result;
    } catch {
      return [] as RecomendacionBacktest[];
    }
  });

// â”€â”€â”€ Evaluar decisiones V/M/C â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const evaluarDecisiones = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ tickers: z.array(z.string()).min(1).max(50) }).parse(input))
  .handler(async ({ data }) => {
    try {
      const cicloData = await getCicloEconomico();
      const ciclo = cicloData?.ciclo;
      const cicloLabel = ciclo?.label ?? "Desconocido";

      const result: DecisionActivo[] = [];
      for (const ticker of data.tickers) {
        try {
          const peers = await getSectorPeers({ data: { ticker } });
          const sector = peers?.sector ?? null;
          const sectorEn = peers?.sector ?? "";
          const filtro = filtrarPorCicloEconomico(sectorEn, ciclo!);
          const cicloPermiteSector = filtro?.permitido ?? true;

          const decision: DecisionActivo = {
            ticker,
            sector,
            decision: "mantener",
            scoreFundamental: null,
            cicloPermiteSector,
            cicloLabel,
            motivo: "",
          };

          if (!cicloPermiteSector) {
            decision.decision = "vender";
            decision.motivo = `Sector ${sector ?? "N/A"} no favorecido por ciclo actual (${cicloLabel})`;
          } else {
            decision.decision = "mantener";
            decision.motivo = `Ciclo ${cicloLabel} â€” sector ${sector} permitido, score fundamental pendiente`;
          }

          result.push(decision);
        } catch {
          result.push({
            ticker,
            sector: null,
            decision: "mantener",
            scoreFundamental: null,
            cicloPermiteSector: true,
            cicloLabel,
            motivo: "Error al evaluar â€” mantener por precauciÃ³n",
          });
        }
      }
      return result;
    } catch {
      return [] as DecisionActivo[];
    }
  });
