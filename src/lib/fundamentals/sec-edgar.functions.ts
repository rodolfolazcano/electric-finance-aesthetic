/**
 * SEC EDGAR API Functions for Coronar Inversiones
 * 
 * NOTAS SOBRE FUENTES DESCARTADAS:
 * - Google Finance: No tiene API oficial pública. El scraping de su HTML viola sus Términos de Servicio (ToS).
 * - Seeking Alpha: No tiene API oficial gratuita. El scraping de su HTML viola sus ToS y requiere autenticación.
 * - SEC EDGAR (HTML): El scraping de páginas HTML de EDGAR (ej: 10-K, 10-Q) es frágil, las URLs no son estables,
 *   y viola los Términos de Uso de la SEC, que exigen usar sus APIs oficiales (como Company Facts).
 * 
 * FUENTES USADAS:
 * - SEC EDGAR Company Facts API: API oficial de la SEC para datos XBRL estructurados.
 *   URL: https://data.sec.gov/api/xbrl/companyfacts/CIK{10-digit-CIK}.json
 *   Requiere: User-Agent header con contacto válido (según ToS de la SEC).
 * - SEC Company Tickers JSON: Archivo público mantenido por la SEC para mapear ticker → CIK.
 *   URL: https://www.sec.gov/files/company_tickers.json
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// =============================================================================
// 1. TIPO DE DATOS PARA COMPANY TICKERS JSON (SEC)
// =============================================================================

// El JSON de company_tickers.json es un objeto donde las claves son números (CIK)
// y los valores son objetos con ticker y title
// Nota: El campo CIK en el JSON se llaman "cik_str" (string) o "cik" (number)
interface SecCompanyTickerValue {
  cik: number | string;
  cik_str?: string;
  ticker: string;
  title: string;
}

// Tipo para el JSON completo: { [cik: string]: SecCompanyTickerValue }
interface SecCompanyTickersJson {
  [cik: string]: SecCompanyTickerValue;
}

// Cache local para el JSON de company_tickers
let companyTickersCache: SecCompanyTickersJson | null = null;

// =============================================================================
// 2. OBTENER CIK PARA UN TICKER (USANDO COMPANY_TICKERS.JSON)
// =============================================================================

/**
 * Descarga (o usa cache local) el archivo company_tickers.json de la SEC
 * y busca el CIK para el ticker dado (case-insensitive).
 * Devuelve el CIK como string de 10 dígitos (con padding de ceros a la izquierda).
 */
export async function getCikForTicker(ticker: string): Promise<string | null> {
  // Normalizar el ticker a mayúsculas
  const normalizedTicker = ticker.toUpperCase().trim();

  // Si el cache está vacío, descargar el JSON de la SEC
  if (!companyTickersCache) {
    try {
      const response = await fetch("https://www.sec.gov/files/company_tickers.json", {
        headers: {
          "User-Agent": "Coronar Inversiones contacto@coronarinversiones.com",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        console.error(
          `Error al descargar company_tickers.json: ${response.status} ${response.statusText}`
        );
        return null;
      }

      const data = (await response.json()) as SecCompanyTickersJson;
      companyTickersCache = data;
    } catch (error) {
      console.error("Error al descargar company_tickers.json:", error);
      return null;
    }
  }

  // Buscar el ticker en el cache (case-insensitive)
  // El JSON es un objeto { cik: { cik, ticker, title } }
  const company = Object.values(companyTickersCache).find(
    (c: SecCompanyTickerValue) => c.ticker?.toUpperCase() === normalizedTicker
  );

  if (!company) {
    console.log(`No se encontró el ticker ${normalizedTicker} en company_tickers.json`);
    return null;
  }

  // Obtener el CIK (puede estar en cik o cik_str)
  const cikValue = company.cik_str || company.cik;
  if (!cikValue) {
    console.log(`No se encontró CIK para el ticker ${normalizedTicker}`);
    return null;
  }

  // Convertir CIK a string de 10 dígitos (con padding de ceros a la izquierda)
  return String(cikValue).padStart(10, "0");
}

// =============================================================================
// 3. OBTENER COMPANY FACTS DESDE LA API DE LA SEC
// =============================================================================

/**
 * Tipos para la respuesta de Company Facts API (XBRL)
 */
interface SecCompanyFactValue {
  val: number;
  form: string;
  fy: number;
  fp: string;
  frame: string;
}

interface SecCompanyFactUnit {
  units: {
    [unit: string]: SecCompanyFactValue[];
  };
}

interface SecCompanyFactsResponse {
  cik: number;
  entityName: string;
  facts: {
    "us-gaap": {
      [concept: string]: SecCompanyFactUnit;
    };
  };
}

/**
 * Conceptos XBRL de interés (us-gaap)
 * Nota: En la API de Company Facts, las claves son solo el nombre del concepto (ej: "Assets"),
 * NO "us-gaap:Assets". El prefijo "us-gaap:" se usa en el namespace XBRL, pero no en las claves del JSON.
 */
const XBRL_CONCEPTS = {
  ASSETS: "Assets",
  LIABILITIES: "Liabilities",
  STOCKHOLDERS_EQUITY: "StockholdersEquity",
  REVENUES: "Revenues",
  NET_INCOME_LOSS: "NetIncomeLoss",
  OPERATING_CASH_FLOW: "NetCashProvidedByUsedInOperatingActivities",
} as const;

/**
 * Obtiene los datos de Company Facts para un CIK dado.
 * Requiere User-Agent header con contacto (según ToS de la SEC).
 */
export async function getCompanyFactsFromSEC(
  cik: string
): Promise<Record<string, unknown> | null> {
  if (!cik || cik.length !== 10 || !/^\d+$/.test(cik)) {
    console.error(`CIK inválido: ${cik}. Debe ser un string de 10 dígitos.`);
    return null;
  }

  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Coronar Inversiones contacto@coronarinversiones.com",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(
        `Error al obtener Company Facts para CIK ${cik}: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const data = (await response.json()) as SecCompanyFactsResponse;
    console.log(`Company Facts obtenidos para CIK ${cik}: ${data.entityName}`);
    return data;
  } catch (error) {
    console.error(`Error al obtener Company Facts para CIK ${cik}:`, error);
    return null;
  }
}

// =============================================================================
// 4. EXTRACCIÓN DE CONCEPTOS XBRL (FALLBACK PARA YAHOO FINANCE)
// =============================================================================

/**
 * Extrae el valor más reciente de un concepto XBRL (us-gaap) de los Company Facts.
 * Devuelve el valor en el formato original (ej: miles, millones) o null si no existe.
 */
function extractLatestXbrlValue(
  facts: SecCompanyFactsResponse["facts"] | undefined,
  concept: string
): number | null {
  if (!facts?.["us-gaap"]?.[concept]) {
    console.log(`Concepto ${concept} no encontrado en us-gaap`);
    return null;
  }

  const conceptData = facts["us-gaap"][concept];
  const units = Object.keys(conceptData.units);

  // Tomar la primera unidad disponible (normalmente "USD" o "shares")
  const unit = units[0];
  if (!unit) {
    console.log(`No se encontraron unidades para el concepto ${concept}`);
    return null;
  }

  const values = conceptData.units[unit];
  if (!values || values.length === 0) {
    console.log(`No se encontraron valores para el concepto ${concept} en unidad ${unit}`);
    return null;
  }

  // Ordenar por año fiscal (fy) descendente, luego por fecha de fin (end) descendente
  const sortedValues = [...values].sort((a: SecCompanyFactValue, b: SecCompanyFactValue) => {
    if (b.fy !== a.fy) return b.fy - a.fy;
    return b.end.localeCompare(a.end);
  });
  
  const latest = sortedValues[0];
  console.log(`Valor más reciente para ${concept}:`, latest);
  return latest?.val ?? null;
}

/**
 * Extrae métricas clave de los Company Facts como fallback para Yahoo Finance.
 * Devuelve un objeto con los valores numéricos o null si no están disponibles.
 */
export interface SecFinancialMetrics {
  assets: number | null;
  liabilities: number | null;
  stockholdersEquity: number | null;
  revenues: number | null;
  netIncomeLoss: number | null;
  operatingCashFlow: number | null;
}

export function extractSecFinancialMetrics(
  facts: SecCompanyFactsResponse | null
): SecFinancialMetrics {
  if (!facts) {
    return {
      assets: null,
      liabilities: null,
      stockholdersEquity: null,
      revenues: null,
      netIncomeLoss: null,
      operatingCashFlow: null,
    };
  }

  return {
    assets: extractLatestXbrlValue(facts.facts, XBRL_CONCEPTS.ASSETS),
    liabilities: extractLatestXbrlValue(facts.facts, XBRL_CONCEPTS.LIABILITIES),
    stockholdersEquity: extractLatestXbrlValue(
      facts.facts,
      XBRL_CONCEPTS.STOCKHOLDERS_EQUITY
    ),
    revenues: extractLatestXbrlValue(facts.facts, XBRL_CONCEPTS.REVENUES),
    netIncomeLoss: extractLatestXbrlValue(
      facts.facts,
      XBRL_CONCEPTS.NET_INCOME_LOSS
    ),
    operatingCashFlow: extractLatestXbrlValue(
      facts.facts,
      XBRL_CONCEPTS.OPERATING_CASH_FLOW
    ),
  };
}

// =============================================================================
// 5. FUNCIÓN DE ALTO NIVEL PARA OBTENER DATOS DE LA SEC (FALLBACK)
// =============================================================================

/**
 * Obtiene métricas financieras de la SEC para un ticker dado.
 * Usa el CIK para buscar en Company Facts API y extrae los conceptos XBRL.
 * Devuelve null si no se pueden obtener los datos.
 */
export async function getSecFinancialMetrics(
  ticker: string
): Promise<SecFinancialMetrics | null> {
  const cik = await getCikForTicker(ticker);
  if (!cik) {
    console.error(`No se encontró CIK para el ticker: ${ticker}`);
    return null;
  }

  const companyFacts = await getCompanyFactsFromSEC(cik);
  if (!companyFacts) {
    console.error(`No se obtuvieron Company Facts para CIK: ${cik}`);
    return null;
  }

  return extractSecFinancialMetrics(companyFacts);
}

// =============================================================================
// 6. SERVER FUNCTION PARA USO EN EL FRONTEND (TANSTACK START)
// =============================================================================

/**
 * Server function para obtener métricas financieras de la SEC (fallback para Yahoo Finance).
 * Input: { ticker: string }
 * Output: SecFinancialMetrics | null
 */
export const fetchSecFinancialMetrics = createServerFn({ method: "GET" })
  .inputValidator((input: { ticker: string }) => {
    const ticker = input.ticker?.trim().toUpperCase();
    if (!ticker || !/^[A-Z0-9\.\-]+$/.test(ticker)) {
      throw new Error("Ticker inválido. Debe ser un símbolo válido (ej: AAPL).");
    }
    return { ticker };
  })
  .handler(async ({ data }): Promise<SecFinancialMetrics | null> => {
    try {
      return await getSecFinancialMetrics(data.ticker);
    } catch (error) {
      console.error(
        `Error al obtener métricas de la SEC para ${data.ticker}:`,
        error
      );
      return null;
    }
  });

// =============================================================================
// 7. EJEMPLO DE USO (PRUEBA CON AAPL)
// =============================================================================

/**
 * Ejemplo de cómo probar el flujo completo con AAPL:
 * 1. Obtener CIK para AAPL
 * 2. Obtener Company Facts desde la SEC
 * 3. Extraer Assets y NetIncomeLoss
 * 
 * Ejemplo de uso en un entorno async:
 * ```typescript
 * async function testAAPL() {
 *   const cik = await getCikForTicker("AAPL");
 *   console.log("CIK para AAPL:", cik); // Ejemplo: "0000320193"
 * 
 *   const companyFacts = await getCompanyFactsFromSEC(cik!);
 *   console.log("Company Facts para AAPL:", companyFacts);
 * 
 *   const metrics = extractSecFinancialMetrics(companyFacts);
 *   console.log("Assets:", metrics.assets);
 *   console.log("NetIncomeLoss:", metrics.netIncomeLoss);
 * }
 * ```
 */
