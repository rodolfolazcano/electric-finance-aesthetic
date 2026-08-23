/**
 * Genera src/data/renta-fija-precios-seed.json con los últimos precios de
 * TODA la renta fija activa de RENTA_FIJA_COMPLETA.json (panel IOL, 1 llamada
 * + reintentos puntuales). Ese archivo se commitea: en producción serverless
 * el motor de TIR siempre tiene un cierre datado aunque IOL falle.
 *
 * Uso (requiere credenciales IOL válidas):
 *   IOL_USERNAME=boosandr97@gmail.com IOL_PASSWORD=*** node scripts/genera-seed-renta-fija.mjs
 *   (o editar las constantes de abajo)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const USUARIO = process.env.IOL_USERNAME || "boosandr97@gmail.com";
const PASSWORD = process.env.IOL_PASSWORD || "Chule348936_";
const BASE = "https://api.invertironline.com";

async function login() {
  const res = await fetch(`${BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "password", username: USUARIO, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login IOL ${res.status}: ${await res.text().catch(() => "")}`);
  const j = await res.json();
  if (!j.access_token) throw new Error("Login sin access_token");
  return j.access_token;
}

async function panelTitulos(token) {
  const url = `${BASE}/api/v2/Cotizaciones/titulos/argentina/Todos?cotizacionInstrumentoModel.instrumento=titulos&cotizacionInstrumentoModel.pais=argentina`;
  const res = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Panel ${res.status}`);
  const j = await res.json();
  return Array.isArray(j?.titulos) ? j.titulos : [];
}

function tickersObjetivo() {
  const data = JSON.parse(readFileSync(path.join(RAIZ, "RENTA_FIJA_COMPLETA.json"), "utf-8"));
  const out = new Set();
  for (const cat of data.categorias ?? []) {
    for (const sub of cat.subcategorias ?? []) {
      for (const b of sub.bonos ?? []) {
        if (b?.activo && b?.ticker) out.add(String(b.ticker).toUpperCase());
      }
    }
  }
  return [...out];
}

const hoyIso = () => new Date().toISOString().slice(0, 10);

try {
  console.log("Login IOL…");
  const token = await login();
  const objetivo = tickersObjetivo();
  console.log(`Universo: ${objetivo.length} tickers activos`);

  console.log("Descargando panel completo de títulos…");
  const titulos = await panelTitulos(token);
  const mapa = new Map();
  for (const t of titulos) {
    const sym = String(t?.simbolo ?? "").toUpperCase();
    if (sym && Number(t?.ultimoPrecio) > 0) mapa.set(sym, t);
  }

  const precios = {};
  let ok = 0;
  for (const tk of objetivo) {
    const t = mapa.get(tk);
    if (t) {
      precios[tk] = {
        precio: Number(t.ultimoPrecio),
        moneda: String(t.moneda ?? "ARS"),
      };
      ok++;
    }
  }
  console.log(`Obtenidos del panel: ${ok}/${objetivo.length}`);

  // Reintentos puntuales para faltantes (máx 30)
  const faltantes = objetivo.filter((tk) => !precios[tk]).slice(0, 30);
  for (const tk of faltantes) {
    try {
      const res = await fetch(
        `${BASE}/api/v2/bCBA/Titulos/${encodeURIComponent(tk)}/CotizacionDetalle`,
        { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const d = await res.json();
        if (Number(d?.ultimoPrecio) > 0) {
          precios[tk] = { precio: Number(d.ultimoPrecio), moneda: String(d.moneda ?? "ARS") };
          ok++;
        }
      }
    } catch {}
  }
  console.log(`Total con precio: ${ok} · sin cotización hoy: ${objetivo.length - ok}`);

  const seedPath = path.join(RAIZ, "src", "data", "renta-fija-precios-seed.json");
  writeFileSync(
    seedPath,
    JSON.stringify({ fecha: hoyIso(), generado: new Date().toISOString(), nota: "Cierres de referencia commiteados — regenerar con scripts/genera-seed-renta-fija.mjs", precios }, null, 2),
    "utf-8",
  );
  console.log(`Seed escrito: ${seedPath}`);
} catch (e) {
  console.error("ERROR:", e.message);
  process.exit(1);
}
