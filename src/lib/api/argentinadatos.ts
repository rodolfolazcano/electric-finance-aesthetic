import { createServerFn } from "@tanstack/react-start";

export interface RiesgoPaisData {
  valor: number | null;
  variacion: number | null;
  variacionPorcentual: number | null;
  fecha: string | null;
}

export interface LetraData {
  ticker: string;
  fechaEmision: string;
  fechaVencimiento: string;
  vpv: number;
  dias: number;
}

export const fetchRiesgoPais = createServerFn({ method: "GET" }).handler(async (): Promise<RiesgoPaisData> => {
  try {
    const [ultimoRes, listaRes] = await Promise.allSettled([
      fetch("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo", { cache: "no-store" }),
      fetch("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais", { cache: "no-store" }),
    ]);

    let valor: number | null = null;
    let fecha: string | null = null;
    let variacion: number | null = null;
    let variacionPorcentual: number | null = null;

    if (ultimoRes.status === "fulfilled" && ultimoRes.value.ok) {
      const u = await ultimoRes.value.json();
      valor = u.valor ?? null;
      fecha = u.fecha ?? null;
    }

    if (listaRes.status === "fulfilled" && listaRes.value.ok && valor != null) {
      const arr: { fecha: string; valor: number }[] = await listaRes.value.json();
      const sorted = [...arr].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      const idx = sorted.findIndex((e) => e.fecha === fecha);
      const prev = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : sorted.length > 1 ? sorted[1] : null;
      if (prev && prev.valor > 0) {
        variacion = valor - prev.valor;
        variacionPorcentual = ((valor - prev.valor) / prev.valor) * 100;
      }
    }

    return { valor, variacion, variacionPorcentual, fecha };
  } catch {
    return { valor: null, variacion: null, variacionPorcentual: null, fecha: null };
  }
});

export const fetchLetras = createServerFn({ method: "GET" }).handler(async (): Promise<LetraData[]> => {
  try {
    const r = await fetch("https://api.argentinadatos.com/v1/finanzas/letras", { cache: "no-store" });
    if (!r.ok) return [];
    const arr: any[] = await r.json();
    return arr.map((l) => ({
      ticker: l.ticker ?? "",
      fechaEmision: l.fechaEmision ?? "",
      fechaVencimiento: l.fechaVencimiento ?? "",
      vpv: l.vpv ?? 0,
      dias: l.fechaVencimiento
        ? Math.round((new Date(l.fechaVencimiento).getTime() - Date.now()) / 86400000)
        : 0,
    }));
  } catch {
    return [];
  }
});
