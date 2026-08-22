// FASE 7 — REVISAR: este archivo tiene call sites activos (ver rutas-motores.json):
// - fundamental-scoring.ts línea 113 - referencia cruzada evaluarContexto
// - scoring-engine.ts línea 246 - llamada en procesarActivo; scoreContexto resulta siempre 50 (50 + 0)
// No borrar: estos call sites aún consumen evaluarContexto. Marcar REVISAR para posible eliminación futura.
import type { ReglaContexto, ContextoDiario, CategoriaMacro, Subtipo } from "./types";

export const REGLAS_CONTEXTO: ReglaContexto[] = [
  {
    id: "ccl-alza-bonos-cortos",
    condicion: "brechaCCL > 0.05 y riesgoPais > 800",
    activosAfectados: [
      { subtipo: "Letra" },
      { subtipo: "FCI-RF" },
      { subtipo: "Bono", tickerPattern: "S\\d{6}" },
    ],
    ajusteScore: 15,
    descripcion: "Brecha CCL en alza + riesgo país alto → bonos de duration corta y letras ganan contexto",
  },
  {
    id: "ccl-alza-bonos-largos",
    condicion: "brechaCCL > 0.05 y riesgoPais > 800",
    activosAfectados: [
      { subtipo: "Bono" },
      { subtipo: "ON" },
    ],
    ajusteScore: -10,
    descripcion: "Brecha CCL en alza + riesgo país alto → bonos largos en USD pierden contexto",
  },
  {
    id: "vix-alto-rv-defensiva",
    condicion: "vix > 25",
    activosAfectados: [
      { categoriaMacro: "RentaVariable" },
    ],
    ajusteScore: -8,
    descripcion: "VIX alto → la RV en general pierde contexto (risk-off global)",
  },
  {
    id: "vix-muy-alto",
    condicion: "vix > 35",
    activosAfectados: [
      { categoriaMacro: "RentaVariable" },
    ],
    ajusteScore: -15,
    descripcion: "VIX muy alto → la RV pierde aún más contexto (pánico)",
  },
  {
    id: "riesgo-pais-minimo-rv-local",
    condicion: "riesgoPais < 400",
    activosAfectados: [
      { subtipo: "Accion" },
      { subtipo: "CEDEAR" },
    ],
    ajusteScore: 10,
    descripcion: "Riesgo país en mínimos → RV local y CEDEARs ganan contexto",
  },
  {
    id: "riesgo-pais-minimo-bonos-largos",
    condicion: "riesgoPais < 400",
    activosAfectados: [
      { subtipo: "Bono" },
      { subtipo: "ON" },
    ],
    ajusteScore: 12,
    descripcion: "Riesgo país en mínimos → bonos largos ganan contexto",
  },
  {
    id: "reservas-alza",
    condicion: "reservasBCRA > 30000",
    activosAfectados: [
      { subtipo: "Bono" },
      { subtipo: "Accion" },
    ],
    ajusteScore: 8,
    descripcion: "Reservas BCRA altas → bonos y acciones locales ganan contexto",
  },
  {
    id: "inflacion-baja-letras",
    condicion: "inflacionMensual < 2",
    activosAfectados: [
      { subtipo: "Letra" },
      { subtipo: "FCI-RF" },
    ],
    ajusteScore: 8,
    descripcion: "Inflación mensual baja → letras y FCI-RF ganan contexto",
  },
  {
    id: "badlar-alto-fci-rf",
    condicion: "badlar > 30",
    activosAfectados: [
      { subtipo: "FCI-RF" },
      { subtipo: "Letra" },
    ],
    ajusteScore: 10,
    descripcion: "BADLAR alta → FCI-RF y letras ganan contexto",
  },
  {
    id: "merval-alza-rv",
    condicion: "mervalVariacion > 0.02",
    activosAfectados: [
      { subtipo: "Accion" },
      { subtipo: "CEDEAR" },
    ],
    ajusteScore: 5,
    descripcion: "Merval en alza → acciones y CEDEARs ganan contexto",
  },
];

export function evaluarContexto(
  _ticker: string,
  _categoriaMacro: CategoriaMacro,
  _subtipo: Subtipo,
  _contexto: ContextoDiario,
): number {
  // La teoría (Murphy, Cap. 12-13) no permite que la macro sume/resté puntos
  // a la valuación micro. El contexto macro opera como filtro binario en
  // score-sectorial.functions.ts, no como ajuste de score.
  return 0;
}

function aplicaRegla(ctx: ContextoDiario, regla: ReglaContexto): boolean {
  switch (regla.id) {
    case "ccl-alza-bonos-cortos":
    case "ccl-alza-bonos-largos":
      return (ctx.brechaCCL ?? 0) > 0.05 && (ctx.riesgoPais ?? 0) > 800;
    case "vix-alto-rv-defensiva":
      return (ctx.vix ?? 0) > 25;
    case "vix-muy-alto":
      return (ctx.vix ?? 0) > 35;
    case "riesgo-pais-minimo-rv-local":
    case "riesgo-pais-minimo-bonos-largos":
      return (ctx.riesgoPais ?? Infinity) < 400;
    case "reservas-alza":
      return (ctx.reservasBCRA ?? 0) > 30000;
    case "inflacion-baja-letras":
      return (ctx.inflacionMensual ?? Infinity) < 2;
    case "badlar-alto-fci-rf":
      return (ctx.badlar ?? 0) > 30;
    case "merval-alza-rv":
      return (ctx.mervalVariacion ?? 0) > 0.02;
    default:
      return false;
  }
}
