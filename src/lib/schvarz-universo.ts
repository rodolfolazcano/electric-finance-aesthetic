// src/lib/schvarz-universo.ts
// Universo expandido para la metodología Schvarz, alimentado desde
// unificado_completo.json (master source). Incluye metadatos completos
// (sector, industria, tipo, moneda, mercado, país) para:
//   1. Expandir el universo de análisis manteniendo la metodología Schvarz.
//   2. Clasificación por sector/industria para diversificación.
//   3. Soporte de ambos mercados (AR + EE.UU.).
//   4. Asignación de perfil de riesgo por tipo de activo.

import { getFlatTickerList, type TickerInfo } from "./universos";

export interface SchvarzActivo {
  ticker: string;
  nombre: string;
  sector: string;
  industria: string;
  tipo: "accion" | "cedear" | "accion_us";
  moneda: "ARS" | "USD";
  mercado: "BCBA" | "NYSE/NASDAQ";
  pais: string;
}

export type PerfilTipoActivo = "conservador" | "moderado" | "agresivo";

// Sectores que agrupan activos no accionarios (se excluyen del universo equity)
const SECTORES_NO_EQUITY = new Set(["Renta Fija", "Fondos y ETFs"]);

// Sectores con sesgo defensivo / de valor estable
const SECTORES_CONSERVADORES = new Set(["Defensiva del Consumidor", "Utilidades", "Bienes Raíces"]);

// Sectores con sesgo de crecimiento / mayor volatilidad fundamental
const SECTORES_AGRESIVOS = new Set(["Tecnología", "Consumo Cíclico", "Materiales Básicos"]);

function inferirTipo(t: TickerInfo): SchvarzActivo["tipo"] {
  const tk = String(t.ticker ?? "").toUpperCase();
  if (t.tipo === "cedear") return "cedear";
  if (t.tipo === "accion") return tk.endsWith(".BA") ? "accion" : "accion_us";
  // Entradas sin tipo declarado: se infiere por símbolo
  return tk.endsWith(".BA") ? "accion" : "accion_us";
}

function inferirMoneda(t: TickerInfo): "ARS" | "USD" {
  if (t.moneda === "ARS") return "ARS";
  if (t.moneda === "USD") return "USD";
  return String(t.ticker ?? "")
    .toUpperCase()
    .endsWith(".BA")
    ? "ARS"
    : "USD";
}

function inferirMercado(t: TickerInfo): "BCBA" | "NYSE/NASDAQ" {
  if (t.mercado === "BCBA") return "BCBA";
  if (t.mercado === "NYSE/NASDAQ") return "NYSE/NASDAQ";
  return String(t.ticker ?? "")
    .toUpperCase()
    .endsWith(".BA")
    ? "BCBA"
    : "NYSE/NASDAQ";
}

function inferirPais(t: TickerInfo): string {
  if (t.pais) return t.pais;
  return String(t.ticker ?? "")
    .toUpperCase()
    .endsWith(".BA")
    ? "Argentina"
    : "EE.UU.";
}

// Patrón de bonos/títulos para descartar residuos en el universo flat
const BONO_PATRON = /^(AL|GD|AE|PR|TX|TV|TZV|S|P|T)\d+[A-Z]?[0-9]*$/i;

let universeCache: SchvarzActivo[] | null = null;

function buildUniverso(): SchvarzActivo[] {
  const flat = getFlatTickerList();
  const seen = new Set<string>();
  const out: SchvarzActivo[] = [];

  for (const t of flat) {
    if (!t.ticker) continue;
    const tk = String(t.ticker).toUpperCase();

    // Excluir sectores no-accionarios (bonos, ETFs, etc.)
    if (SECTORES_NO_EQUITY.has(t.sector)) continue;
    // Excluir patrones de títulos de renta fija sueltos
    if (BONO_PATRON.test(tk)) continue;

    // Solo equity: tipo declarado accion/cedear, o no-accionario dejado afuera.
    // Entradas sin tipo pero con sector/industria clasificados = equity (US/local).
    const tipo = inferirTipo(t);

    if (seen.has(tk)) continue;
    seen.add(tk);

    out.push({
      ticker: tk,
      nombre: t.nombre ?? tk,
      sector: t.sector,
      industria: t.industria,
      tipo,
      moneda: inferirMoneda(t),
      mercado: inferirMercado(t),
      pais: inferirPais(t),
    });
  }

  // Orden estable por sector → ticker para consistencia de cache
  out.sort((a, b) => a.sector.localeCompare(b.sector) || a.ticker.localeCompare(b.ticker));

  return out;
}

/** Universo expandido de equity (acciones AR + US + CEDEARs), con metadata completa. */
export function getUniversoSchvarz(): SchvarzActivo[] {
  if (!universeCache) universeCache = buildUniverso();
  return universeCache;
}

/** Tickers del universo Schvarz (para semaforo/fundamentales en lotes). */
export function getTickersSchvarz(): string[] {
  return getUniversoSchvarz().map((a) => a.ticker);
}

/**
 * Perfil de riesgo sugerido por tipo de activo.
 * Primero por sector (defensivo vs crecimiento), luego por tipo de instrumento
 * y por mercado/moneda. Es el punto de partida; el motor lo combina con beta,
 * moat y margen de seguridad del análisis fundamental.
 */
export function perfilPorTipoDeActivo(a: SchvarzActivo): PerfilTipoActivo {
  if (SECTORES_CONSERVADORES.has(a.sector)) return "conservador";
  if (SECTORES_AGRESIVOS.has(a.sector)) return "agresivo";

  // Cuidado de la Salud y Financieros suelen ser neutros-especulativos según beta.
  if (a.sector === "Cuidado de la Salud") {
    // Farmacéutica de dividendos vs biotecnología sin ganancias no se distingue aquí;
    // se resuelve con moat/beta en el motor. Default moderado.
    return "moderado";
  }

  // Por instrumento:
  if (a.tipo === "cedear") {
    // CEDEAR de gran cap EE.UU. en ARS: diversificador internacional → moderado.
    return a.moneda === "USD" ? "moderado" : "moderado";
  }
  if (a.tipo === "accion_us") return "moderado";

  // Acción local argentina: mayor riesgo país/volatilidad → agresivo por defecto
  // salvo que el análisis fundamental disponga otra cosa.
  return "agresivo";
}

/** Dato de un ticker del universo, si existe. */
export function getSchvarzActivo(ticker: string): SchvarzActivo | undefined {
  const tk = ticker.toUpperCase();
  return getUniversoSchvarz().find((a) => a.ticker === tk);
}
