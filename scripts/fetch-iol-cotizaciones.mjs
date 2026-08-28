#!/usr/bin/env node
/**
 * Fetch IOL cotizaciones → src/data/cotizaciones-iol.json
 *
 * Flujo local:
 *   node scripts/fetch-iol-cotizaciones.mjs
 *   git add src/data/cotizaciones-iol.json
 *   git commit -m "chore: refresh cotizaciones IOL"
 *   git push
 *   → Lovable redeploya automáticamente
 *
 * Credenciales en .env (IOL_USERNAME / IOL_PASSWORD)
 */

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "src", "data", "cotizaciones-iol.json");

// Leer .env del repo (credenciales hardcodeadas)
function loadEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv();
const IOL_BASE = "https://api.invertironline.com";
const IOL_USER = env.IOL_USERNAME || process.env.IOL_USERNAME;
const IOL_PASS = env.IOL_PASSWORD || process.env.IOL_PASSWORD;

if (!IOL_USER || !IOL_PASS) {
  console.error("ERROR: IOL_USERNAME / IOL_PASSWORD no definidos en env vars");
  process.exit(1);
}

// ── Auth ───────────────────────────────────────────────────────────────────

async function getToken() {
  const res = await fetch(`${IOL_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "password",
      username: IOL_USER,
      password: IOL_PASS,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IOL auth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

// ── Fetch cotizaciones ─────────────────────────────────────────────────────

async function fetchCotizaciones(token, instrumento, pais = "argentina") {
  const url = `${IOL_BASE}/api/v2/Cotizaciones/${instrumento}/${pais}/Todos`;
  const params = new URLSearchParams({
    "cotizacionInstrumentoModel.instrumento": instrumento,
    "cotizacionInstrumentoModel.pais": pais,
  });

  const res = await fetch(`${url}?${params}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.warn(`  WARN: ${instrumento} returned ${res.status}`);
    return [];
  }

  const json = await res.json();
  return json.titulos || [];
}

// ── Normalize ──────────────────────────────────────────────────────────────

function normalize(raw) {
  return raw.map((t) => ({
    simbolo: t.simbolo || "",
    nombre: t.descripcion || t.simbolo || "",
    precio: t.ultimoPrecio || 0,
    compra: t.puntas?.precioCompra || 0,
    venta: t.puntas?.precioVenta || 0,
    cierre: t.ultimoCierre || 0,
    variacionPct: t.variacionPorcentual || 0,
    volumen: t.volumen || 0,
    mercado: t.mercado || "",
    moneda: t.moneda || "",
    fecha: t.fecha || "",
  }));
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("IOL cotizaciones refresh —", new Date().toISOString());

  const token = await getToken();
  console.log("Token obtenido OK");

  // Fetch TP + ON
  const [tpRaw, onRaw] = await Promise.all([
    fetchCotizaciones(token, "titulosPublicos"),
    fetchCotizaciones(token, "obligacionesNegociables"),
  ]);

  console.log(`  TP: ${tpRaw.length} instrumentos`);
  console.log(`  ON: ${onRaw.length} instrumentos`);

  const payload = {
    actualizado: new Date().toISOString(),
    titulosPublicos: normalize(tpRaw),
    obligacionesNegociables: normalize(onRaw),
  };

  writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  console.log(`Escrito ${OUT}`);
  console.log(
    `  Total: ${payload.titulosPublicos.length + payload.obligacionesNegociables.length} cotizaciones`,
  );
  console.log("\nSiguiente paso:");
  console.log("  git add src/data/cotizaciones-iol.json");
  console.log('  git commit -m "chore: refresh cotizaciones IOL"');
  console.log("  git push");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
