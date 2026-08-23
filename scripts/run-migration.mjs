#!/usr/bin/env node
/**
 * Ejecuta la migración SQL para crear la tabla portafolios_clientes.
 *
 * USO:
 *   node scripts/run-migration.mjs --token=TU_SERVICE_ROLE_KEY
 *
 * Obtener la key en:
 *   Supabase Dashboard → Project Settings → API → service_role (secret)
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.join("=")];
  })
);

const key = args.token || process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = args.url || process.env.SUPABASE_URL || "https://zkzspmvfzphmzgqpxnvk.supabase.co";

if (!key) {
  console.error("Falta la service role key.");
  console.error("");
  console.error("Obtenela en: Supabase Dashboard → Project Settings → API → service_role");
  console.error("");
  console.error("Luego ejecutá:");
  console.error("  node scripts/run-migration.mjs --token=eyJ...");
  process.exit(1);
}

const sql = readFileSync(new URL("./sql/portafolios_clientes.sql", import.meta.url), "utf-8");
const supabase = createClient(url, key);

console.log("Conectando a:", url);
console.log("Ejecutando SQL...");

// Use the PostgREST admin endpoint to run raw SQL
const projectRef = url.replace("https://", "").replace(".supabase.co", "");

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});

const data = await res.json();

if (!res.ok) {
  console.error("Error:", JSON.stringify(data, null, 2));
  console.log("");
  console.log("Si el Management API no funciona, copiá el SQL y pegalo en:");
  console.log(`  https://supabase.com/dashboard/project/${projectRef}/sql/new`);
  process.exit(1);
}

console.log("OK:", JSON.stringify(data, null, 2));
console.log("");
console.log("Tabla portafolios_clientes creada exitosamente.");
