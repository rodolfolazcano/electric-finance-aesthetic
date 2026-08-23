// Persistencia historial diario de señales unificadas — filesystem + Supabase opcional
// Patrón idéntico a informe-matutino/persistence.functions.ts, con fallback para Vercel serverless
import type { SenalUnificada } from "./motor-unificado";

export type RegistroSenalesDia = {
  fecha: string; // YYYY-MM-DD ART
  generadoEn: string; // ISO
  resumen: string;
  senales: SenalUnificada[];
  tuning?: { umbralCompra: number; umbralCompraFuerte: number; rrTp1: number; rrTp2: number };
};

function obtenerFechaART(): string {
  const f = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" });
  const p = f.formatToParts(new Date());
  return `${p.find(x=>x.type==="year")!.value}-${p.find(x=>x.type==="month")!.value}-${p.find(x=>x.type==="day")!.value}`;
}

async function fsOps() {
  const [{ readFile, writeFile, readdir }, { existsSync }, { join }] = await Promise.all([
    import("node:fs/promises") as Promise<typeof import("node:fs/promises")>,
    import("node:fs") as Promise<typeof import("node:fs")>,
    import("node:path") as Promise<typeof import("node:path")>,
  ]);
  const DATA_DIR = join(process.cwd(), ".data", "senales");
  return { readFile, writeFile, readdir, existsSync, join, DATA_DIR };
}

export async function guardarSenalesDelDia(reg: RegistroSenalesDia): Promise<void> {
  const { writeFile, existsSync, DATA_DIR } = await fsOps();
  const { mkdir } = await import("node:fs/promises");
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  const path = `${DATA_DIR}/${reg.fecha}.json`;
  await writeFile(path, JSON.stringify(reg, null, 2), "utf-8");
  // Supabase opcional (no rompe si no hay credenciales)
  try {
    const { createClient } = await import("@supabase/supabase-js").catch(()=> ({createClient: null as any}));
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (createClient && url && key) {
      const supa = createClient(url, key);
      await supa.from("senales_historial").upsert({
        fecha: reg.fecha,
        generado_en: reg.generadoEn,
        resumen: reg.resumen,
        senales: reg.senales,
        tuning: reg.tuning ?? null,
      }, { onConflict: "fecha" });
    }
  } catch {}
}

export async function obtenerSenalesDelDia(fecha: string): Promise<RegistroSenalesDia | null> {
  const { readFile, existsSync, DATA_DIR } = await fsOps();
  const path = `${DATA_DIR}/${fecha}.json`;
  if (!existsSync(path)) return null;
  try { return JSON.parse(await readFile(path, "utf-8")) as RegistroSenalesDia; } catch { return null; }
}

export async function obtenerHistorialSenales(dias = 30): Promise<RegistroSenalesDia[]> {
  const { readFile, readdir, existsSync, DATA_DIR } = await fsOps();
  if (!existsSync(DATA_DIR)) return [];
  const files = (await readdir(DATA_DIR)).filter(f=>f.endsWith(".json")).sort().reverse().slice(0, dias);
  const out: RegistroSenalesDia[] = [];
  for (const f of files) {
    try { out.push(JSON.parse(await readFile(`${DATA_DIR}/${f}`, "utf-8"))); } catch {}
  }
  return out;
}

export async function calcularRetornosRealizados(registro: RegistroSenalesDia, holdDays = 20): Promise<Array<{ticker:string; senal:string; precioEntrada:number|null; precioFuturo:number|null; retPct:number|null; hitSL:boolean; hitTP:boolean}>> {
  const { fetchYahooChart } = await import("@/lib/yahoo-http");
  const res: any[] = [];
  for (const s of registro.senales) {
    try {
      const chart: any = await fetchYahooChart(s.ticker, "1mo", "1d");
      const closes: number[] = chart?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
      // closes últimos ~22 días, tomamos último como proxy futuro si holdDays ~20
      // Para histórico real necesitaríamos timestamp; aproximamos con último close
      const ultimo = closes.filter(c=> isFinite(c)).slice(-1)[0] ?? null;
      const ret = s.precio != null && ultimo != null ? ((ultimo - s.precio)/s.precio*100) : null;
      res.push({ ticker: s.ticker, senal: s.senal, precioEntrada: s.precio, precioFuturo: ultimo, retPct: ret != null ? Number(ret.toFixed(2)) : null, hitSL: false, hitTP: false });
    } catch { res.push({ ticker: s.ticker, senal: s.senal, precioEntrada: s.precio, precioFuturo: null, retPct: null, hitSL:false, hitTP:false }); }
  }
  return res;
}

// SQL para crear tabla Supabase (ejecutar una vez):
// create table if not exists senales_historial (
//   fecha date primary key,
//   generado_en timestamptz not null,
//   resumen text,
//   senales jsonb not null,
//   tuning jsonb,
//   created_at timestamptz default now()
// );
