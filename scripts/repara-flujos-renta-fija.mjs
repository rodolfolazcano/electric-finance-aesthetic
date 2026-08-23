/**
 * Repara los flujos de fondos y metadata de las series soberanas USD (canje 2020)
 * en RENTA_FIJA_COMPLETA.json (raíz + copia src/data) y src/data/bonos.json,
 * usando los términos oficiales de src/lib/renta-fija/flujos-oficiales.ts.
 *
 * Uso: npx tsx scripts/repara-flujos-renta-fija.mjs
 * Idempotente. No toca GD46, AA37 (bonos.json), LECAPs ni ONs.
 */
import fs from "node:fs";
import path from "node:path";
import {
  SERIES_OFICIALES,
  ESPECIE_POR_SERIE,
  generarFlujosSerie,
  residualAPct,
  tasaVigente,
  validarSerie,
} from "../src/lib/renta-fija/flujos-oficiales.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
const RFC_ROOT = path.join(RAIZ, "RENTA_FIJA_COMPLETA.json");
const RFC_COPY = path.join(RAIZ, "src", "data", "RENTA_FIJA_COMPLETA.json");
const BONOS = path.join(RAIZ, "src", "data", "bonos.json");

const HOY = new Date().toISOString().slice(0, 10);

// tickers que se AGREGAN a RFC (no existen como entrada propia)
const ALTAS_RFC = [
  { ticker: "GD35D", base: "GD35", especie: "Cable", nombre: "Global 2035 D", hermana: { Pesos: "GD35" } },
  { ticker: "GD41D", base: "GD41", especie: "Cable", nombre: "Global 2041 D", hermana: { Pesos: "GD41" } },
  { ticker: "AA37", base: null, especie: "Pesos", nombre: "Argentine Republic 5% 2037", hermana: { D: "AA37D" } },
  { ticker: "AA37D", base: null, especie: "Dolar", nombre: "Argentine Republic 5% 2037 D", hermana: { Pesos: "AA37" } },
];

function leerJson(p) {
  const raw = fs.readFileSync(p, "utf8");
  return { data: JSON.parse(raw), raw };
}
function escribirJson(p, data, rawPrevio, indent) {
  let out = JSON.stringify(data, null, indent);
  if (rawPrevio.endsWith("\n")) out += "\n";
  fs.writeFileSync(p, out, "utf8");
}

function cuponRfc(serie) {
  const t = SERIES_OFICIALES[serie];
  const tramos = t.tasas.filter((x) => x.hastaPagoInclusive < "2099");
  return {
    tasa: tasaVigente(serie, HOY),
    tipo: tramos.length > 1 ? "Step-up" : "Fija",
    detalle: t.cuponDetalle,
    frecuencia: "Semestral",
    dias_cupon: 182,
    convencion: "30/360",
  };
}

// ── RENTA_FIJA_COMPLETA.json ────────────────────────────────────────────────
function repararRfc() {
  const { data, raw } = leerJson(RFC_ROOT);
  let tocados = 0;
  const log = [];

  const subcats = [];
  for (const cat of data.categorias ?? []) {
    for (const sub of cat.subcategorias ?? []) subcats.push(sub);
  }

  // 1) actualizar existentes
  for (const sub of subcats) {
    for (const bono of sub.bonos ?? []) {
      const serie = ESPECIE_POR_SERIE[bono.ticker];
      if (!serie) continue;
      const t = SERIES_OFICIALES[serie];
      const antes = Array.isArray(bono.flujo_fondos) ? bono.flujo_fondos.length : 0;
      bono.flujo_fondos = generarFlujosSerie(serie, HOY);
      bono.cupon = cuponRfc(serie);
      bono.amortizacion = t.amortizacionDetalle;
      if (bono.fecha_vencimiento !== t.vencimiento) {
        log.push(`  ${bono.ticker}: vencimiento ${bono.fecha_vencimiento} → ${t.vencimiento}`);
        bono.fecha_vencimiento = t.vencimiento;
      }
      tocados++;
      log.push(`  ${bono.ticker}: flujo_fondos ${antes === 0 ? "null/vacío" : antes + " flujos"} → ${bono.flujo_fondos.length} flujos oficiales (próx. ${bono.flujo_fondos[0]?.fecha} ${bono.flujo_fondos[0]?.monto_por_cien})`);
    }
  }

  // 2) altas (GD35D, GD41D, AA37, AA37D) dentro de globales_ley_ny
  const globales = subcats.find((s) => s.id === "globales_ley_ny");
  if (globales) {
    globales.bonos = globales.bonos ?? [];
    for (const alta of ALTAS_RFC) {
      if (globales.bonos.some((b) => b.ticker === alta.ticker)) continue;
      const plantilla = alta.base
        ? globales.bonos.find((b) => b.ticker === alta.base)
        : globales.bonos.find((b) => b.ticker === "GD35");
      if (!plantilla) continue;
      const nuevo = JSON.parse(JSON.stringify(plantilla));
      nuevo.ticker = alta.ticker;
      nuevo.nombre = alta.nombre;
      nuevo.especie = alta.especie;
      nuevo.especies_relacionadas = alta.hermana;
      if (alta.base) {
        nuevo.flujo_fondos = generarFlujosSerie(ESPECIE_POR_SERIE[alta.ticker], HOY);
        nuevo.cupon = cuponRfc(ESPECIE_POR_SERIE[alta.ticker]);
        nuevo.amortizacion = SERIES_OFICIALES[ESPECIE_POR_SERIE[alta.ticker]].amortizacionDetalle;
        nuevo.fecha_vencimiento = SERIES_OFICIALES[ESPECIE_POR_SERIE[alta.ticker]].vencimiento;
      } else {
        // AA37/AA37D: términos de bonos.json (5% bullet 2037) SIN verificación oficial
        const flujos = [];
        for (let a = 2027; a <= 2037; a++) {
          for (const m of ["01", "07"]) {
            const f = `${a}-${m}-09`;
            if (f <= HOY) continue;
            const ultimo = f === "2037-07-09";
            flujos.push({
              fecha: f,
              tipo: ultimo ? "Cupon+Amortizacion" : "Cupon",
              monto_por_cien: ultimo ? 102.5 : 2.5,
              ...(ultimo ? {} : {}),
            });
          }
        }
        nuevo.flujo_fondos = flujos;
        nuevo.cupon = {
          tasa: 5,
          tipo: "Fija",
          detalle: "5.00% anual fijo (SIN verificación oficial — datos heredados de bonos.json)",
          frecuencia: "Semestral",
          dias_cupon: 182,
          convencion: "30/360",
        };
        nuevo.amortizacion = "Bullet (100% al vencimiento) — SIN verificación oficial";
        nuevo.fecha_vencimiento = "2037-07-09";
      }
      globales.bonos.push(nuevo);
      tocados++;
      log.push(`  +${alta.ticker}: alta con ${nuevo.flujo_fondos.length} flujos (especie ${alta.especie})`);
    }
    // cross-refs de hermanas
    const refs = { GD35: "GD35D", GD41: "GD41D", AA37: "AA37D" };
    for (const [base, especieD] of Object.entries(refs)) {
      const b = globales.bonos.find((x) => x.ticker === base);
      if (b && !b.especies_relacionadas?.D) {
        b.especies_relacionadas = { ...(b.especies_relacionadas ?? {}), D: especieD };
      }
    }
  }

  escribirJson(RFC_ROOT, data, raw, 2);
  escribirJson(RFC_COPY, data, raw, 2);
  console.log(`RFC actualizado (${tocados} entradas):`);
  console.log(log.join("\n"));
}

// ── src/data/bonos.json ─────────────────────────────────────────────────────
function repararBonos() {
  const { data, raw } = leerJson(BONOS);
  const log = [];
  let tocados = 0;

  for (const [ticker, bono] of Object.entries(data)) {
    const serie = ESPECIE_POR_SERIE[ticker];
    if (!serie) continue;
    const t = SERIES_OFICIALES[serie];
    const flujos = generarFlujosSerie(serie, HOY);
    const antes = (bono.flujos_futuros_cada_100_vn ?? []).length;
    bono.flujos_futuros_cada_100_vn = flujos.map((f) => ({
      fecha: f.fecha,
      monto: f.monto_por_cien,
      tipoFlujo: f.tipo,
    }));
    bono.vencimiento = t.vencimiento;
    bono.cuponAnual = tasaVigente(serie, HOY);
    bono.tipoCupon = t.tasas.filter((x) => x.hastaPagoInclusive < "2099").length > 1 ? "Step-up" : "Fixed rate";
    bono.tipoAmortizacion = "Sinkable";
    bono.convencionDias = "30/360";
    bono.valorResidualActual = residualAPct(serie, HOY);
    if (ticker === "GD35D" && /4\.125%/.test(String(bono.descripcion))) {
      bono.descripcion = "BONOS GLOBALES DE LA REPUBLICA ARGENTINA EN DOLARES ESTADOUNIDENSES STEP UP 2035 (DOLAR CABLE)";
    }
    tocados++;
    log.push(`  ${ticker}: ${antes} flujos → ${flujos.length} oficiales | cupón vigente ${bono.cuponAnual}% | residual ${bono.valorResidualActual}% | vto ${bono.vencimiento}`);
  }

  escribirJson(BONOS, data, raw, 4);
  console.log(`bonos.json actualizado (${tocados} entradas):`);
  console.log(log.join("\n"));
}

// ── main ────────────────────────────────────────────────────────────────────
console.log(`Reparación de flujos renta fija — hoy ${HOY}\n`);
for (const serie of Object.keys(SERIES_OFICIALES)) {
  const v = validarSerie(serie);
  console.log(`  [${v.ok ? "OK" : "ERROR"}] ${v.detalle}`);
}
console.log("");
repararRfc();
console.log("");
repararBonos();
console.log("\nListo. Ambas copias de RENTA_FIJA_COMPLETA.json quedaron idénticas.");
