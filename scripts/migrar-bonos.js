#!/usr/bin/env node
/**
 * Migración: enriquece src/data/bonos.json desde RENTA_FIJA_COMPLETA.json
 *
 * 1. Lee los stubs de bonos.json (vencimiento null o sin flujos)
 * 2. Para cada uno, busca datos en RENTA_FIJA_COMPLETA.json
 * 3. Actualiza vencimiento, flujos, tipo, descripcion, etc.
 * 4. Marca como "activo: false" los que no tienen flujos en la maestra
 *
 * Uso: node scripts/migrar-bonos.js
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");

// --- Leer archivos ---
const master = JSON.parse(
  readFileSync(join(ROOT, "RENTA_FIJA_COMPLETA.json"), "utf-8")
);
const bonosPath = join(ROOT, "src", "data", "bonos.json");
const bonos = JSON.parse(readFileSync(bonosPath, "utf-8"));

// --- Indexar maestra por ticker ---
const masterMap = {};
for (const cat of master.categorias || []) {
  for (const sub of cat.subcategorias || []) {
    for (const bono of sub.bonos || []) {
      masterMap[bono.ticker] = { ...bono, categoriaMadre: cat.id, subcategoria: sub.id };
    }
  }
}

// --- Mapping tipo maestra → TipoBono ---
function mapTipoBono(maestro, categoriaMadre, subcategoria) {
  const { moneda, tipo } = maestro;

  // Subcategoria explícita tiene prioridad
  if (subcategoria === "bontes_usd_dollar_linked") return "Dollar-Linked";
  if (subcategoria === "bonares_ley_argentina" || subcategoria === "globales_ley_ny") return "Hard Dollar";

  if (moneda === "USD") return "Hard Dollar";
  if (moneda === "EUR") return "Dollar-Linked";

  // ARS
  if (categoriaMadre === "ajustables_cer") return "CER";
  if (categoriaMadre === "dollar_linked_tamar" || categoriaMadre === "tasa_dual_tamar") return "Dollar-Linked";
  if (categoriaMadre === "tasa_fija_capitalizables") return "Tasa Fija ARS";
  if (categoriaMadre === "lecer_ajustables_inflacion") return "CER";
  if (categoriaMadre === "bonos_iliquidos_residuales") {
    if (tipo === "Boncer" || maestro.moneda === "CER") return "CER";
    return "Tasa Fija ARS";
  }
  return "Tasa Fija ARS";
}

function mapInstrumento(maestro) {
  if (maestro.tipo === "Bonte" || maestro.tipo === "Global") return "BONO";
  if (maestro.tipo === "Boncer" || maestro.tipo === "Canje") return "BONO";
  return "BONO";
}

// --- Detectar stubs ---
const stubs = Object.entries(bonos).filter(
  ([, v]) =>
    !v.vencimiento ||
    v.vencimiento === null ||
    (v.flujos_futuros_cada_100_vn || []).length === 0
);

console.log(`\nEncontrados ${stubs.length} stubs en bonos.json`);

let enriquecidos = 0;
let marcadosInactivos = 0;

for (const [ticker, entry] of stubs) {
  const m = masterMap[ticker];

  if (!m) {
    // No está en la maestra → marcar inactivo
    entry.activo = false;
    entry.descripcion = entry.descripcion || `Stub sin datos en maestra: ${ticker}`;
    marcadosInactivos++;
    console.log(`  ${ticker}: sin datos en maestra → inactivo`);
    continue;
  }

  const tipoBono = mapTipoBono(m, m.categoriaMadre, m.subcategoria);
  const flows = m.flujo_fondos || [];

  // Actualizar campos
  entry.descripcion = m.nombre || entry.descripcion || "";
  entry.vencimiento = m.fecha_vencimiento || entry.vencimiento;
  entry.fechaEmision = m.fecha_emision || entry.fechaEmision;
  entry.isin = m.isin || entry.isin || "";
  entry.moneda = m.moneda || entry.moneda;
  entry.activo = flows.length > 0;

  // Tipo
  entry.tipo = tipoBono;

  // Instrumento
  entry.instrumento = mapInstrumento(m);

  // Yield convention
  if (tipoBono === "Hard Dollar") {
    entry.yieldConvention = "STREET";
    entry.convencionDias = "30/360";
  } else if (tipoBono === "CER" || tipoBono === "Dollar-Linked") {
    entry.yieldConvention = "TRUE";
    entry.convencionDias = "REAL/365";
  } else {
    entry.yieldConvention = "TRUE";
    entry.convencionDias = "30/360";
  }

  // Moneda pago — Dollar-Linked paga en ARS aunque cotiza en USD
  if (tipoBono === "Dollar-Linked") {
    entry.monedaPago = "ARS";
  } else if (m.moneda === "USD") {
    entry.monedaPago = "USD";
  } else {
    entry.monedaPago = "ARS";
  }

  // Ajuste
  if (tipoBono === "CER") entry.ajuste = "CER";
  else if (tipoBono === "Dollar-Linked") entry.ajuste = "DolarOficial";
  else entry.ajuste = null;

  // Cupon
  if (m.cupon) {
    entry.cuponAnual = m.cupon.tasa || entry.cuponAnual;
    entry.tipoCupon = m.cupon.tipo || "Fixed rate";
    entry.frecuenciaPago =
      m.cupon.frecuencia === "Semestral"
        ? "Semiannual"
        : m.cupon.frecuencia === "Mensual"
          ? "Monthly"
          : m.cupon.frecuencia === "Anual"
            ? "Annual"
            : "AtMaturity";
  }

  // Valor residual
  entry.valorPar = m.valor_nominal || 100;
  entry.valorResidualActual = entry.valorResidualActual || m.valor_nominal || 100;

  // Mercado
  entry.mercado = m.mercado === "BYMA" ? "bCBA" : entry.mercado || "bCBA";

  // Tipo tasa
  if (tipoBono === "CER" && flows.length <= 2) entry.tipoTasa = "zero-coupon";
  else if (m.cupon && m.cupon.tipo === "Step-up") entry.tipoTasa = "step-up";
  else entry.tipoTasa = "fixed";

  // Jurisdicción
  entry.jurisdiccion = m.ley === "Nueva_York" ? "NY" : "ARG";

  // Flujos
  if (flows.length > 0) {
    entry.flujos_futuros_cada_100_vn = flows.map((f) => ({
      fecha: f.fecha,
      monto: f.monto_por_cien,
      tipoFlujo: f.tipo || "Cupon+Amortizacion",
    }));
    enriquecidos++;
    console.log(`  ${ticker}: enriquecido con ${flows.length} flujos (${tipoBono})`);
  } else {
    entry.flujos_futuros_cada_100_vn = [];
    entry.activo = false;
    marcadosInactivos++;
    console.log(`  ${ticker}: sin flujos en maestra → inactivo (${m.tipo} ${m.moneda})`);
  }
}

// --- Guardar ---
writeFileSync(bonosPath, JSON.stringify(bonos, null, 2) + "\n", "utf-8");

console.log(`\n✅ Migración completada:`);
console.log(`   - ${enriquecidos} stubs enriquecidos con flujos`);
console.log(`   - ${marcadosInactivos} marcados inactivos`);
console.log(`   - Total entries: ${Object.keys(bonos).length}`);

// Resumen de distribución por tipo
const dist = {};
for (const [, v] of Object.entries(bonos)) {
  const t = v.activo === false ? "INACTIVO" : v.tipo || "SIN_TIPO";
  dist[t] = (dist[t] || 0) + 1;
}
console.log("\nDistribución por tipo:");
for (const [t, c] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t}: ${c}`);
}
