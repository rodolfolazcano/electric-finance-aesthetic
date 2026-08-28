/**
 * Script para parsear unificado_completo - copia.json y extraer todos los CEDEARs
 * operables (tipo=cedear, moneda=ARS, mercado=BCBA).
 *
 * Ejecutar: npx tsx scripts/parse-cedears.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const JSON_PATH = resolve(__dirname, "../../unificado_completo - copia.json");
const OUTPUT_PATH = resolve(__dirname, "../src/lib/bot-unificado/cedears-universo.ts");

interface RegistroJSON {
  ticker: string;
  tipo?: string;
  moneda?: string;
  mercado?: string;
  pais?: string;
  nombre?: string;
}

interface SectorData {
  industrias: Record<string, RegistroJSON[]>;
}

interface JSONData {
  sectores: Record<string, SectorData>;
}

function parseJSON(): { cedears: RegistroJSON[]; stats: Record<string, number> } {
  const raw = readFileSync(JSON_PATH, "utf-8");
  const data: JSONData = JSON.parse(raw);

  const cedearsMap = new Map<string, RegistroJSON>();
  const stats: Record<string, number> = { total: 0, cedearsARS: 0, cedearsUSD: 0, duplicados: 0 };

  for (const [sectorName, sector] of Object.entries(data.sectores)) {
    for (const [industriaName, registros] of Object.entries(sector.industrias)) {
      for (const reg of registros) {
        stats.total++;
        // Solo CEDEARs: tipo=cedear, moneda=ARS, mercado=BCBA
        if (
          reg.tipo === "cedear" &&
          reg.moneda === "ARS" &&
          reg.mercado === "BCBA" &&
          !reg.ticker.endsWith(".BA") &&
          !reg.ticker.endsWith("D") // excluir variantes USD
        ) {
          if (cedearsMap.has(reg.ticker)) {
            stats.duplicados++;
          } else {
            cedearsMap.set(reg.ticker, reg);
            stats.cedearsARS++;
          }
        } else if (
          reg.tipo === "cedear" &&
          reg.moneda === "USD" &&
          reg.mercado === "BCBA"
        ) {
          stats.cedearsUSD++;
        }
      }
    }
  }

  return { cedears: [...cedearsMap.values()], stats };
}

function generarTS(cedears: RegistroJSON[], stats: Record<string, number>): string {
  const tickers = cedears.map((c) => `"${c.ticker}"`);
  const tickerToNombre: Record<string, string> = {};
  for (const c of cedears) {
    if (c.nombre) tickerToNombre[c.ticker] = c.nombre;
  }

  const lines = [
    `/**`,
    ` * Universo de CEDEARs extraído de unificado_completo - copia.json`,
    ` * Auto-generado por scripts/parse-cedears.ts`,
    ` * Total: ${cedears.length} CEDEARs ARS (excluidos .BA y variantes USD)`,
    ` * Stats: ${JSON.stringify(stats)}`,
    ` */`,
    ``,
    `export const CEDEARS_JSON: string[] = [`,
    ...tickers.map((t) => `  ${t},`),
    `];`,
    ``,
    `export const CEDEAR_NOMBRES: Record<string, string> = {`,
    ...Object.entries(tickerToNombre).map(([t, n]) => `  "${t}": "${n.replace(/"/g, '\\"')}",`),
    `};`,
    ``,
    `/** Mapeo ticker US -> ticker BCBA (.BA) */`,
    `export function toYahooBCBA(usTicker: string): string {`,
    `  return usTicker + ".BA";`,
    `}`,
    ``,
    `/** Filtra CEDEARs con datos válidos (sin nulls) */`,
    `export function cedearsValidos(): string[] {`,
    `  return CEDEARS_JSON.filter((t) => t && t.length > 0);`,
    `}`,
  ];

  return lines.join("\n");
}

function main() {
  console.log("Parseando JSON...");
  const { cedears, stats } = parseJSON();
  console.log(`Stats:`, stats);
  console.log(`CEDEARs ARS extraídos: ${cedears.length}`);

  const ts = generarTS(cedears, stats);
  writeFileSync(OUTPUT_PATH, ts, "utf-8");
  console.log(`Archivo generado: ${OUTPUT_PATH}`);

  // Mostrar primeros 20
  console.log("\nPrimeros 20 CEDEARs:");
  cedears.slice(0, 20).forEach((c) => {
    console.log(`  ${c.ticker} — ${c.nombre ?? "s/n"}`);
  });
}

main();
