import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchDolares, type CotizacionDolar } from "./criptoya";
import { fetchRiesgoPais, fetchLetras, type RiesgoPaisData, type LetraData } from "./argentinadatos";
import { iolCotizarMultiples, iolFuturosOperables, type IOLCotizacionSimple } from "./iol-cotizaciones";
import { calcularRendimientosBono, fetchTamarRate } from "@/lib/renta-fija.functions";
import { BONOS_DB } from "@/lib/bonos-data";

// ─── Ticker lists ──────────────────────────────────────────────────────────

const LECAP_TICKERS = ["S31L6", "S14G6", "S31G6", "S15S6", "TTS26_TF", "S30S6", "T026", "S3006", "S30N6", "T15E7", "TTD26_TF", "T30A7", "T31Y7", "T30J7", "TY30P"];
const TAMAR_TICKERS = ["M31G6", "TTS26_TAM", "TTD26_TAM", "TMF27", "TMG27", "TMF28", "TXMJ8_TAM", "TMG28", "TXMD8_TAM", "TXMJ9_TAM", "TXMD9_TAM", "TXMJ0_TAM"];
const BONARES_GLOBALES_TICKERS = ["AO27D", "AL29D", "GD29D", "AO28D", "AL30D", "GD30D", "AN29D", "AE38D", "GD38D", "AL35D", "GD35D", "AL41D", "GD41D", "GD46D"];
const BONOS_CER_TICKERS = ["X31L6", "X30S6", "TZX06", "TX26", "X30N6", "TZXD6", "TZXM7", "TZXA7", "TZXY7", "TZX27", "TZXS7", "TX28", "TZXD7", "TZXM8", "TZX28", "TXJ8_CER", "TZXS8", "TXMD8_CER", "TZXM9", "TXMJ9_CER", "TX31", "TXMD9_CER", "DICP", "DIP0", "TXMJ0_CER", "PARP", "PAP0", "CUAP"];
const BOPREAL_TICKERS = ["BPA7D", "BPD7D", "BPC7D", "BPB7D", "BPB8D", "BPA8D"];
const DOLAR_LINKED_TICKERS = ["D31L6", "D31G6", "D30S6", "D31M7", "TZV27", "TZV28", "TZVD8"];
const PANEL_LIDER_TICKERS = ["ALUA", "BBAR", "BMA", "BYMA", "CEPU", "COME", "CRES", "EDN", "GGAL", "LOMA", "METR", "MIRG", "PAMP", "SUPV", "TECO2", "TGNO4", "TGSU2", "TRAN", "TXAR", "VALO", "YPFD"];

const FUTUROS_CONTRATOS = ["DLR/JUL26", "DLR/AGO26", "DLR/SEP26", "DLR/OCT26", "DLR/NOV26", "DLR/DIC26", "DLR/ENE27", "DLR/FEB27", "DLR/MAR27", "DLR/ABR27"];

// ─── Data types ────────────────────────────────────────────────────────────

export interface MonitorMercadoData {
  timestamp: string;
  mercadoAbierto: boolean;

  // Panel 1
  dolares: CotizacionDolar[];
  riesgoPais: RiesgoPaisData;
  reservas: { valor: number | null; variacion: number | null } | null;
  tamarTna: number | null;

  // Panel 2
  lecaps: LecapRow[];

  // Panel 3
  tamar: BonoRow[];

  // Panel 4
  bonaresGlobales: BonoRow[];

  // Panel 5
  bonosCER: BonoRow[];

  // Panel 6
  futuros: FuturoRow[];

  // Panel 7
  bopreales: BonoRow[];

  // Panel 8
  panelLider: AccionRow[];

  // Panel 9
  dolarLinked: BonoRow[];

  // Panel 10 (derivado)
  pares: ParRow[];

  // Panel 11 (derivado)
  senderoMensual: SenderoRow[];
}

export interface LecapRow {
  ticker: string;
  fechaEmision: string;
  fechaVencimiento: string;
  vpv: number;
  dias: number;
  precio: number | null;
  tna: number | null;
  tem: number | null;
  variacion: number | null;
}

export interface BonoRow {
  ticker: string;
  tipo: string;
  vencimiento: string;
  precio: number | null;
  tir: number | null;
  tea: number | null;
  tna: number | null;
  duration: number | null;
  paridad: number | null;
  variacion: number | null;
  moneda: string;
}

export interface FuturoRow {
  contrato: string;
  vencimiento: string | null;
  ultimo: number | null;
  variacion: number | null;
  volumen: number | null;
  tna: number | null;
  openInterest: number | null;
}

export interface AccionRow {
  ticker: string;
  compra: number | null;
  venta: number | null;
  ultimo: number | null;
  variacion: number | null;
  volumen: number | null;
  treintaDias: number | null;
}

export interface ParRow {
  par: string;
  delta: number | null;
  inflacionImplícita: number | null;
}

export interface SenderoRow {
  mes: string;
  bei: number | null;
  rem: number | null;
}

// ─── Server function ───────────────────────────────────────────────────────

export const getMonitorMercadoData = createServerFn({ method: "POST" })
  .validator(z.object({ bearerToken: z.string().optional() }))
  .handler(async ({ data }): Promise<MonitorMercadoData> => {
    const now = new Date();
    const dia = now.getDay();
    const horaART = now.getHours();
    const minART = now.getMinutes();
    const horaMin = horaART * 60 + minART;
    const mercadoAbierto = dia >= 1 && dia <= 5 && horaMin >= 660 && horaMin < 1020;

    const token = data.bearerToken;

    // ── Panel 1: Dólares & Macro ─────────────────────────────────────
    const [dolares, riesgoPais, tamarRate] = await Promise.allSettled([
      fetchDolares(),
      fetchRiesgoPais(),
      fetchTamarRate(),
    ]);

    // Reservas BCRA
    let reservas: { valor: number | null; variacion: number | null } | null = null;
    try {
      const bcraToken = process.env.BCRA_API_TOKEN;
      if (bcraToken) {
        const r = await fetch("https://api.estadisticasbcra.com/reservas", {
          headers: { Authorization: `BEARER ${bcraToken}`, Accept: "application/json" },
          cache: "no-store",
        });
        if (r.ok) {
          const json: { d: string; v: number }[] = await r.json();
          if (json.length > 0) {
            const ultimo = json[json.length - 1].v;
            const prev = json.length > 1 ? json[json.length - 2].v : ultimo;
            reservas = { valor: ultimo / 1000, variacion: (ultimo - prev) / 1000 };
          }
        }
      }
    } catch { /* ignore */ }

    // ── Panel 2: LECAPs ──────────────────────────────────────────────
    const letras = await fetchLetras();
    const lecapMap = new Map(letras.filter((l) => LECAP_TICKERS.includes(l.ticker)).map((l) => [l.ticker, l]));

    let lecapPrecios: Record<string, IOLCotizacionSimple> = {};
    try {
      lecapPrecios = await iolCotizarMultiples({ data: { bearerToken: token ?? undefined, simbolos: LECAP_TICKERS } });
    } catch { /* ignore */ }

    const lecaps: LecapRow[] = LECAP_TICKERS.map((ticker) => {
      const info = lecapMap.get(ticker);
      const cotiz = lecapPrecios[ticker];
      const precio = cotiz?.ultimoPrecio ?? null;
      const vpv = info?.vpv ?? 0;
      const dias = info?.dias ?? 0;
      let tem: number | null = null;
      let tna: number | null = null;
      if (precio != null && precio > 0 && vpv > 0 && dias > 0) {
        tem = Math.pow(vpv / precio, 30 / dias) - 1;
        tna = tem * 12;
      }
      const variacion =
        cotiz?.cierre != null && cotiz.cierre > 0 && cotiz.ultimoPrecio != null
          ? ((cotiz.ultimoPrecio - cotiz.cierre) / cotiz.cierre) * 100
          : null;
      return {
        ticker,
        fechaEmision: info?.fechaEmision ?? "",
        fechaVencimiento: info?.fechaVencimiento ?? "",
        vpv,
        dias,
        precio,
        tna: tna != null ? tna * 100 : null,
        tem: tem != null ? tem * 100 : null,
        variacion,
      };
    });

    // ── Helper: calcular bonos ────────────────────────────────────────
    async function calcBonos(tickers: string[], tipoLabel: string): Promise<BonoRow[]> {
      const rows: BonoRow[] = [];
      let precios: Record<string, IOLCotizacionSimple> = {};
      try {
        precios = await iolCotizarMultiples({ data: { bearerToken: token ?? undefined, simbolos: tickers } });
      } catch { /* ignore */ }
      for (const ticker of tickers) {
        const cotiz = precios[ticker];
        const precioIOL = cotiz?.ultimoPrecio ?? null;
        const bonoConfig = BONOS_DB[ticker];
        // IOL devuelve precios por 1000 VN para bonos → dividir por 10
        const escala = bonoConfig?.escalaPrecioIOL ?? 10;
        const precioPor100VN = precioIOL != null && escala > 0 ? precioIOL / escala : null;
        let tir: number | null = null;
        let tea: number | null = null;
        let tna: number | null = null;
        let duration: number | null = null;
        let paridad: number | null = null;

        if (precioPor100VN != null && precioPor100VN > 0 && bonoConfig) {
          try {
            const r = await calcularRendimientosBono({
              data: { ticker, precioPorCada100VN: precioPor100VN },
            });
            if (r && !("error" in r)) {
              tir = r.tir != null ? r.tir * 100 : null;
              tea = r.tea != null ? r.tea * 100 : null;
              tna = r.tna != null ? r.tna * 100 : null;
              duration = r.durationModificada ?? null;
              paridad = r.paridad ?? null;
            }
          } catch { /* ignore */ }
        }

        const variacion =
          cotiz?.cierre != null && cotiz.cierre > 0 && cotiz.ultimoPrecio != null
            ? ((cotiz.ultimoPrecio - cotiz.cierre) / cotiz.cierre) * 100
            : null;

        rows.push({
          ticker,
          tipo: tipoLabel,
          vencimiento: bonoConfig?.vencimiento ?? "",
          precio: precioPor100VN,
          tir,
          tea,
          tna,
          duration,
          paridad,
          variacion,
          moneda: bonoConfig?.monedaFlujos ?? "ARS",
        });
      }
      return rows;
    }

    // ── Panel 6: Futuros ──────────────────────────────────────────────
    let futuros: FuturoRow[] = [];
    try {
      const futurosRaw = await iolFuturosOperables({ data: { bearerToken: token ?? undefined } });
      const futurosMap = new Map(futurosRaw.map((f) => [f.simbolo.toUpperCase(), f]));
      futuros = FUTUROS_CONTRATOS.map((contrato) => {
        const key = contrato.replace("/", "");
        const f = futurosMap.get(key) ?? futurosMap.get(contrato);
        return {
          contrato,
          vencimiento: f?.fechaVencimiento ?? null,
          ultimo: f?.ultimoPrecio ?? null,
          variacion: f?.variacionPorcentual ?? null,
          volumen: f?.volumen ?? null,
          tna: null,
          openInterest: null,
        };
      });
    } catch { /* ignore */ }

    // ── Panel 8: Panel Líder ──────────────────────────────────────────
    let panelLider: AccionRow[] = [];
    try {
      const accPrecios = await iolCotizarMultiples({ data: { bearerToken: token ?? undefined, simbolos: PANEL_LIDER_TICKERS } });
      panelLider = PANEL_LIDER_TICKERS.map((ticker) => {
        const c = accPrecios[ticker];
        return {
          ticker,
          compra: c?.compra ?? null,
          venta: c?.venta ?? null,
          ultimo: c?.ultimoPrecio ?? null,
          variacion: c?.variacionPorcentual ?? null,
          volumen: c?.volumen ?? null,
          treintaDias: null,
        };
      });
    } catch { /* ignore */ }

    // ── Panels 3, 4, 5, 7, 9 ──────────────────────────────────────────
    const [tamarBonos, bonares, bonosCER, boprealesBonos, dolarLinkedBonos] = await Promise.all([
      calcBonos(TAMAR_TICKERS, "TAMAR"),
      calcBonos(BONARES_GLOBALES_TICKERS, "Bonar/Global"),
      calcBonos(BONOS_CER_TICKERS, "CER"),
      calcBonos(BOPREAL_TICKERS, "BOPREAL"),
      calcBonos(DOLAR_LINKED_TICKERS, "Dollar-Linked"),
    ]);

    // ── Panel 10: Pares (derivado) ────────────────────────────────────
    const pares: ParRow[] = [];

    // ── Panel 11: Sendero Mensual (derivado) ──────────────────────────
    const senderoMensual: SenderoRow[] = [];

    const tamarTna =
      tamarRate.status === "fulfilled" && tamarRate.value != null ? tamarRate.value : null;

    return {
      timestamp: now.toISOString(),
      mercadoAbierto,
      dolares: dolares.status === "fulfilled" ? dolares.value : [],
      riesgoPais: riesgoPais.status === "fulfilled" ? riesgoPais.value : { valor: null, variacion: null, variacionPorcentual: null, fecha: null },
      reservas,
      tamarTna,
      lecaps,
      tamar: tamarBonos,
      bonaresGlobales: bonares,
      bonosCER,
      futuros,
      bopreales: boprealesBonos,
      panelLider,
      dolarLinked: dolarLinkedBonos,
      pares,
      senderoMensual,
    };
  });
