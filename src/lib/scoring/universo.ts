import { BONOS_DB } from "../bonos-data";
import { getFlatTickerList } from "../universos";
import cedearsUniverse from "@/data/cedears-universe.json";
import type { CategoriaMacro, Subtipo } from "./types";

export interface ActivoUniverse {
  ticker: string;
  categoriaMacro: CategoriaMacro;
  subtipo: Subtipo;
  fuente: "IOL" | "Yahoo" | "ArgentinaDatos";
}

export function construirUniversoCompleto(): ActivoUniverse[] {
  const set = new Map<string, ActivoUniverse>();

  // 1. Bonos/ONs desde bonos-data.ts
  for (const [ticker, bono] of Object.entries(BONOS_DB)) {
    const esON = bono.tipo?.startsWith("ON");
    set.set(ticker, {
      ticker,
      categoriaMacro: "RentaFija",
      subtipo: esON ? "ON" : "Bono",
      fuente: "IOL",
    });
  }

  // 2. Acciones locales (.BA) desde universos.ts
  const flat = getFlatTickerList();
  for (const t of flat) {
    if (t.ticker.endsWith(".BA")) {
      set.set(t.ticker, {
        ticker: t.ticker,
        categoriaMacro: "RentaVariable",
        subtipo: "Accion",
        fuente: "Yahoo",
      });
    }
  }

  // 3. CEDEARs desde cedears-universe.json
  const cedears = cedearsUniverse as { ARS: string[]; USD: string[] };
  for (const t of cedears.ARS) {
    const withBA = t + ".BA";
    if (!set.has(withBA)) {
      set.set(withBA, {
        ticker: withBA,
        categoriaMacro: "RentaVariable",
        subtipo: "CEDEAR",
        fuente: "Yahoo",
      });
    }
  }
  for (const t of cedears.USD) {
    if (!set.has(t)) {
      set.set(t, {
        ticker: t,
        categoriaMacro: "RentaVariable",
        subtipo: "CEDEAR",
        fuente: "Yahoo",
      });
    }
  }

  // 4. Acciones US (del flat list, sin .BA)
  for (const t of flat) {
    if (!t.ticker.endsWith(".BA") && /^[A-Z]{1,5}$/.test(t.ticker)) {
      if (!set.has(t.ticker)) {
        set.set(t.ticker, {
          ticker: t.ticker,
          categoriaMacro: "RentaVariable",
          subtipo: "ADR",
          fuente: "Yahoo",
        });
      }
    }
  }

  return [...set.values()];
}
