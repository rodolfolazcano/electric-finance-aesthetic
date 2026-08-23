// Cron diario: actualiza precios de TODA la renta fija con condiciones de
// emisión en RENTA_FIJA_COMPLETA.json (.data/renta-fija/precios.json).
// Así el motor de TIR siempre tiene un cierre reciente aunque IOL falle en vivo.
// GET /api/cron/actualiza-renta-fija?token=SECRET  |  ?ticker=AL30 (puntual)
import { createFileRoute } from "@tanstack/react-router";
import "@/lib/ai/env.server";
import rentaFijaData from "@/../RENTA_FIJA_COMPLETA.json";
import { guardarPrecio, hoyIso } from "@/lib/renta-fija/precios.server";

function autorizado(req: Request): boolean {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const cronSecret = process.env["CRON_SECRET"];
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (req.headers.get("x-vercel-cron")) return true;
  if (cronSecret && (token === cronSecret || bearer === cronSecret)) return true;
  // Sin CRON_SECRET configurado, permitir manual local (dev) pero no exponer nada sensible.
  return !cronSecret;
}

type TickerActivo = string;

function tickersObjetivo(): TickerActivo[] {
  const data: any = rentaFijaData as any;
  const out: TickerActivo[] = [];
  for (const cat of data.categorias ?? []) {
    for (const sub of cat.subcategorias ?? []) {
      for (const b of sub.bonos ?? []) {
        if (b?.activo && b?.ticker) out.push(String(b.ticker).toUpperCase());
      }
    }
  }
  return [...new Set(out)];
}

async function manejar(req: Request): Promise<Response> {
  if (!autorizado(req)) {
    return new Response(JSON.stringify({ ok: false, motivo: "no autorizado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    const url = new URL(req.url);
    const tickerPuntual = (url.searchParams.get("ticker") ?? "").trim().toUpperCase();
    const objetivo = tickerPuntual ? [tickerPuntual] : tickersObjetivo();
    if (!objetivo.length) {
      return Response.json({ ok: false, motivo: "sin activos con datos de emisión en el JSON" }, { status: 200 });
    }

    const { ensureIOLSession, iolPanelTodos, iolCotizacionDetalle } = await import("@/lib/iol.server");
    const sid = await ensureIOLSession("cron-renta-fija");
    const objetivoSet = new Set(objetivo);
    let obtenidos = 0;
    const faltantes: string[] = [];

    // 1) Panel completo de títulos (1 llamada para todo el universo).
    let panelOk = false;
    try {
      const panel = await iolPanelTodos(sid, "titulos", "argentina");
      const titulos: any[] = ((panel.data as any)?.titulos ?? []) as any[];
      const mapa = new Map<string, any>();
      for (const t of titulos) {
        const sym = String(t?.simbolo ?? t?.titulo?.simbolo ?? "").toUpperCase();
        if (sym) mapa.set(sym, t);
      }
      for (const tk of objetivo) {
        const t = mapa.get(tk);
        const p = Number(t?.ultimoPrecio ?? t?.titulo?.ultimoPrecio ?? NaN);
        if (isFinite(p) && p > 0) {
          await guardarPrecio({
            ticker: tk,
            precio: p,
            moneda: String(t?.moneda ?? t?.titulo?.moneda ?? "ARS"),
            fecha: hoyIso(),
            timestamp: new Date().toISOString(),
            fuente: "cron panel IOL",
          });
          obtenidos++;
        } else {
          faltantes.push(tk);
        }
      }
      panelOk = true;
    } catch {
      faltantes.push(...objetivo);
    }

    // 2) Reintentos puntuales (CotizacionDetalle) para lo que no vino en el panel.
    if (!panelOk || faltantes.length) {
      const aReintentar = panelOk ? [...faltantes] : objetivo;
      const recuperados: string[] = [];
      for (const tk of aReintentar.slice(0, 40)) {
        try {
          const r = await iolCotizacionDetalle(sid, "bCBA", tk);
          const d: any = r.data;
          const p = Number(d?.ultimoPrecio ?? NaN);
          if (r.ok && isFinite(p) && p > 0) {
            await guardarPrecio({
              ticker: tk,
              precio: p,
              moneda: String(d?.moneda ?? "ARS"),
              fecha: hoyIso(),
              timestamp: new Date().toISOString(),
              fuente: "cron detalle IOL",
            });
            recuperados.push(tk);
          }
        } catch {}
      }
      for (const tk of recuperados) {
        const i = faltantes.indexOf(tk);
        if (i >= 0) faltantes.splice(i, 1);
        obtenidos++;
      }
    }

    return Response.json(
      {
        ok: true,
        fecha: hoyIso(),
        universo: objetivo.length,
        actualizados: obtenidos,
        sinCotizacion: faltantes.slice(0, 30),
        nota: "Precios persistidos en .data/renta-fija/precios.json — motor TIR usa estos cierres cuando IOL en vivo falla.",
      },
      { headers: { "content-type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, motivo: e?.message ?? String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/cron/actualiza-renta-fija")({
  server: {
    handlers: {
      GET: async ({ request }) => manejar(request),
      POST: async ({ request }) => manejar(request),
    },
  },
});
