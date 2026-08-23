/**
 * Slide PNG oscuro para flujos de bonos — satori + resvg (manual vnode, sin satori-html).
 * Evita el parser de satori-html que generaba nodos de texto por whitespace
 * y disparaba el validador "Expected div to have explicit display: flex".
 */

type Flujo = { fecha: string; monto: number; tipo?: string };

export type DatosFlujoBono = {
  ticker: string;
  nombre: string;
  emisor?: string;
  moneda?: string;
  fechaVencimiento?: string;
  precio: number | null;
  precioMoneda: string;
  fechaPrecio: string;
  fuentePrecio: string;
  tirAnual: number | null;
  tem: number | null;
  tna: number | null;
  flujos: Flujo[];
};

async function cargarFuente(): Promise<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[]> {
  const fs = await import("node:fs");
  const candidatos: Array<[string, 400 | 700]> = [
    ["C:/Windows/Fonts/segoeuib.ttf", 700],
    ["C:/Windows/Fonts/arialbd.ttf", 700],
    ["C:/Windows/Fonts/segoeui.ttf", 400],
    ["C:/Windows/Fonts/arial.ttf", 400],
    ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 700],
    ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 400],
  ];
  const fuentes: { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[] = [];
  for (const [p, weight] of candidatos) {
    try {
      const data = fs.readFileSync(p);
      fuentes.push({
        name: "Sans",
        data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
        weight,
        style: "normal",
      });
    } catch {}
    if (fuentes.length >= 2) break;
  }
  if (!fuentes.length) throw new Error("sin fuentes de sistema para satori");
  return fuentes;
}

function fmtPct(v: number | null, dec = 2): string {
  if (v == null || !isFinite(v)) return "N/D";
  return `${(v * 100).toFixed(dec)}%`;
}
function fmtMonto(v: number): string {
  return v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcDurationConvexity(flujos: Flujo[], precioPar: number, tir: number, hoy: Date) {
  if (!(tir > -0.9 && tir < 5) || !flujos.length || !(precioPar > 0)) return null;
  let pvTotal = 0;
  let durNum = 0;
  let convNum = 0;
  for (const f of flujos) {
    const fd = new Date(f.fecha + "T12:00:00.000Z");
    const t = (fd.getTime() - hoy.getTime()) / 86400000 / 365;
    if (t <= 0) continue;
    const df = Math.pow(1 + tir, -t);
    const pv = f.monto * df;
    pvTotal += pv;
    durNum += t * pv;
    convNum += t * (t + 1) * pv;
  }
  if (pvTotal <= 0) return null;
  const macaulay = durNum / pvTotal;
  const mod = macaulay / (1 + tir);
  const convexity = convNum / (pvTotal * Math.pow(1 + tir, 2));
  const dv01 = mod * pvTotal * 0.0001;
  return { macaulay, mod, convexity, dv01 };
}

const C = {
  bg: "#0A0E17",
  panel: "#101827",
  borde: "#1F2A44",
  texto: "#EDF2FB",
  gris: "#8CA0BF",
  gris2: "#5B6B87",
  verde: "#22C55E",
  rojo: "#EF4444",
  acento: "#38BDF8",
  ambar: "#F59E0B",
};

// helper: div con style flex-aware
function div(style: Record<string, unknown>, children: unknown): { type: string; props: { style: Record<string, unknown>; children: unknown } } {
  return { type: "div", props: { style, children } };
}

export async function generarFlujoBonoPng(d: DatosFlujoBono): Promise<Buffer> {
  const { default: satori } = await import(/* @vite-ignore */ "satori");
  const { Resvg } = await import(/* @vite-ignore */ "@resvg/resvg-js");

  const W = 1080;
  const H = 950;
  const hoyStr = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
  const flujos = [...d.flujos].sort((a, b) => a.fecha.localeCompare(b.fecha));

  const useYearAgg = flujos.length > 16;
  type Bar = { label: string; valor: number; isPrincipal: boolean };
  let bars: Bar[] = [];
  if (useYearAgg) {
    const byYear = new Map<string, { sum: number; hasPrincipal: boolean }>();
    for (const f of flujos) {
      const y = f.fecha.slice(0, 4);
      const cur = byYear.get(y) ?? { sum: 0, hasPrincipal: false };
      cur.sum += f.monto;
      if ((f.tipo && /amort/i.test(f.tipo)) || f.monto > 50) cur.hasPrincipal = true;
      byYear.set(y, cur);
    }
    bars = [...byYear.entries()].map(([y, v]) => ({ label: y, valor: v.sum, isPrincipal: v.hasPrincipal }));
  } else {
    bars = flujos.map((f) => ({
      label: f.fecha.slice(5).replace("-", "/"),
      valor: f.monto,
      isPrincipal: (f.tipo != null && /amort/i.test(f.tipo)) || f.monto > 50,
    }));
  }

  const maxV = Math.max(...bars.map((b) => b.valor), 1);
  const sumTotal = flujos.reduce((s, f) => s + f.monto, 0);
  const CH = 240;
  const dur =
    d.tirAnual != null && d.precio != null
      ? calcDurationConvexity(flujos, d.precio, d.tirAnual, new Date(new Date().setHours(12, 0, 0, 0)))
      : null;

  const tirColor = d.tirAnual != null ? (d.tirAnual > 0.15 ? C.verde : d.tirAnual > 0.08 ? C.acento : C.ambar) : C.texto;
  const barW = Math.max(18, Math.min(52, Math.floor((W - 96 - 60) / Math.max(bars.length, 1) - 6)));

  const flujoResumen = useYearAgg
    ? `Agregado por año · ${flujos.length} pagos → ${bars.length} barras anuales`
    : `${flujos.length} flujos semestrales · Total ${fmtMonto(sumTotal)} por 100 VN`;

  // Cards helper returns vnode
  const card = (label: string, valor: string, sub?: string, color = C.texto) =>
    div(
      { display: "flex", flexDirection: "column", background: C.panel, border: `1px solid ${C.borde}`, borderRadius: "16px", padding: "16px 18px", flex: "1" },
      [
        div({ display: "flex", fontSize: "13px", letterSpacing: "2px", color: C.gris }, label),
        div({ display: "flex", fontSize: "26px", fontWeight: 700, color, marginTop: "6px" }, valor),
        sub ? div({ display: "flex", fontSize: "12px", color: C.gris2, marginTop: "4px" }, sub) : null,
      ].filter(Boolean),
    );

  // Bars vnodes
  const barNodes = bars.map((b) => {
    const h = Math.max(4, Math.round((b.valor / maxV) * CH));
    const col = b.isPrincipal ? C.rojo : C.acento;
    const bg = b.isPrincipal ? "rgba(239,68,68,0.95)" : "rgba(56,189,248,0.92)";
    const shortLabel = b.label.length > 5 ? b.label.slice(2) : b.label;
    return div({ display: "flex", flexDirection: "column", alignItems: "center", width: `${barW}px` }, [
      div({ display: "flex", fontSize: "9px", color: C.gris, marginBottom: "4px" }, fmtMonto(b.valor)),
      div({ display: "flex", width: `${barW}px`, height: `${h}px`, background: bg, borderRadius: "6px 6px 0 0", border: `1px solid ${col}` }, ""),
      div({ display: "flex", fontSize: "9px", color: C.gris, marginTop: "5px" }, shortLabel),
    ]);
  });

  const yTicks = [maxV, maxV / 2, 0];
  const yAxisNodes = yTicks.map((v) =>
    div(
      { display: "flex", height: `${CH / 3}px`, fontSize: "11px", color: C.gris2, alignItems: "flex-start", justifyContent: "flex-end", paddingRight: "8px" },
      v === 0 ? "0" : fmtMonto(v),
    ),
  );

  const vnode = div(
    { display: "flex", flexDirection: "column", width: `${W}px`, height: `${H}px`, background: C.bg, padding: "32px 36px", fontFamily: "Sans" },
    [
      // header
      div({ display: "flex", justifyContent: "space-between", alignItems: "center" }, [
        div({ display: "flex", alignItems: "center" }, [
          div({ display: "flex", width: "12px", height: "12px", borderRadius: "12px", background: C.verde }, ""),
          div({ display: "flex", fontSize: "20px", fontWeight: 700, color: C.texto, letterSpacing: "4px", marginLeft: "12px" }, "CORONAR"),
          div({ display: "flex", fontSize: "13px", color: C.gris, marginLeft: "12px" }, "· RENTA FIJA"),
        ]),
        div({ display: "flex", fontSize: "12px", color: C.gris2 }, hoyStr),
      ]),
      // hero
      div({ display: "flex", alignItems: "flex-end", marginTop: "20px" }, [
        div({ display: "flex", fontSize: "54px", fontWeight: 700, color: C.texto }, d.ticker),
        div(
          { display: "flex", fontSize: "15px", color: C.gris, marginLeft: "14px", marginBottom: "8px" },
          d.nombre,
        ),
      ]),
      div({ display: "flex", fontSize: "13px", color: C.gris, marginTop: "4px" }, `Vto ${d.fechaVencimiento ?? "—"} · ${d.emisor ?? ""} · ${d.moneda ?? "USD"}`),
      // precio
      div(
        {
          display: "flex",
          alignItems: "center",
          marginTop: "14px",
          background: C.panel,
          border: `1px solid ${C.borde}`,
          borderRadius: "14px",
          padding: "14px 18px",
        },
        [
          div({ display: "flex", flexDirection: "column" }, [
            div({ display: "flex", fontSize: "12px", letterSpacing: "2px", color: C.gris }, "PRECIO"),
            div({ display: "flex", fontSize: "22px", fontWeight: 700, color: C.texto, marginTop: "2px" }, d.precio != null ? `${fmtMonto(d.precio)} ${d.precioMoneda}` : "N/D"),
          ]),
          div({ display: "flex", flex: "1" }, ""),
          div({ display: "flex", flexDirection: "column", alignItems: "flex-end" }, [
            div({ display: "flex", fontSize: "11px", color: C.gris2 }, `${d.fuentePrecio} · ${d.fechaPrecio}`),
            div({ display: "flex", fontSize: "11px", color: C.gris2, marginTop: "2px" }, "Flujos RENTA_FIJA_COMPLETA.json · ACT/365"),
          ]),
        ],
      ),
      // fila 1
      div({ display: "flex", marginTop: "14px", gap: "12px" }, [
        card("TIR ANUAL (YTM)", d.tirAnual != null ? fmtPct(d.tirAnual) : "N/D", d.tirAnual != null ? `TEA ${(d.tirAnual * 100).toFixed(2)}%` : undefined, tirColor),
        card("TEM", d.tem != null ? fmtPct(d.tem) : "N/D", d.tem != null ? `${(d.tem * 100).toFixed(2)}% mensual` : undefined),
        card("TNA", d.tna != null ? fmtPct(d.tna) : "N/D", "TNA = TEM × 12"),
      ]),
      // fila 2
      div({ display: "flex", marginTop: "12px", gap: "12px" }, [
        dur ? card("DURATION MOD", dur.mod.toFixed(2), `Macaulay ${dur.macaulay.toFixed(2)} años`) : card("FLUJOS FUTUROS", String(flujos.length), flujoResumen),
        dur ? card("CONVEXITY", dur.convexity.toFixed(2), `DV01 ≈ USD ${dur.dv01.toFixed(2)}`) : card("TOTAL A COBRAR", fmtMonto(sumTotal), "por 100 VN"),
        card("VENCIMIENTO", d.fechaVencimiento ?? "—", flujos.length ? `Próx. ${flujos[0]!.fecha}` : undefined),
      ]),
      // chart panel
      div(
        { display: "flex", flexDirection: "column", background: C.panel, border: `1px solid ${C.borde}`, borderRadius: "20px", padding: "18px 20px", marginTop: "14px" },
        [
          div({ display: "flex", justifyContent: "space-between", alignItems: "center" }, [
            div({ display: "flex", fontSize: "14px", fontWeight: 700, color: C.texto }, `${d.ticker} — Flujos futuros ${useYearAgg ? "(por año)" : "(semestral)"}`),
            div({ display: "flex", gap: "10px", alignItems: "center" }, [
              div({ display: "flex", alignItems: "center" }, [
                div({ display: "flex", width: "10px", height: "10px", background: "rgba(56,189,248,0.92)", borderRadius: "3px" }, ""),
                div({ display: "flex", fontSize: "11px", color: C.gris, marginLeft: "6px" }, "Cupón"),
              ]),
              div({ display: "flex", alignItems: "center" }, [
                div({ display: "flex", width: "10px", height: "10px", background: "rgba(239,68,68,0.95)", borderRadius: "3px" }, ""),
                div({ display: "flex", fontSize: "11px", color: C.gris, marginLeft: "6px" }, "Amort.+cupón"),
              ]),
            ]),
          ]),
          div({ display: "flex", fontSize: "11px", color: C.gris2, marginTop: "4px" }, `${flujoResumen} · Cada 100 VN · Las barras rojas incluyen amortización de capital`),
          div({ display: "flex", marginTop: "14px" }, [
            div({ display: "flex", flexDirection: "column", width: "60px" }, yAxisNodes),
            div(
              {
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                flex: "1",
                height: `${CH}px`,
                borderTop: "1px solid rgba(255,255,255,0.07)",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
                padding: "0 6px",
                background: "rgba(20,31,51,0.5)",
              },
              barNodes,
            ),
          ]),
        ],
      ),
      // footer
      div({ display: "flex", justifyContent: "space-between", marginTop: "14px" }, [
        div({ display: "flex", fontSize: "11px", color: C.gris2 }, "Educativo — no es recomendación personalizada. DYOR. Newton-Raphson ACT/365."),
        div({ display: "flex", fontSize: "11px", color: C.gris2 }, `Fuente: ${d.fuentePrecio} + RENTA_FIJA_COMPLETA.json`),
      ]),
    ],
  );

  const fuentes = await cargarFuente();
  const svg = await satori(vnode as Parameters<typeof satori>[0], { width: W, height: H, fonts: fuentes });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: W } });
  return Buffer.from(resvg.render().asPng());
}
