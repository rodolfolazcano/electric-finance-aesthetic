/**
 * Exportación de planes de planificación financiera.
 * Genera CSV (compatible Excel) y dispara la descarga en el navegador.
 */

function descargarCSV(nombre: string, secciones: Array<{ titulo: string; filas: string[][] }>) {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas: string[] = [];
  for (const sec of secciones) {
    lineas.push(sec.titulo);
    for (const fila of sec.filas) lineas.push(fila.map(esc).join(";"));
    lineas.push("");
  }
  const blob = new Blob(["\uFEFF" + lineas.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type Filas = Array<[string, string | number | null | undefined]>;

function seccion(titulo: string, filas: Filas) {
  return { titulo, filas: filas.map(([k, v]) => [k, v == null ? "" : String(v)]) };
}

const meta = (plan: string) => [
  ["Plan", plan],
  ["Generado", new Date().toLocaleString("es-AR")],
];

export async function exportHipotecaXLSX(data: Record<string, unknown>, ..._rest: unknown[]) {
  descargarCSV("plan-hipoteca", [
    seccion("HIPOTECA", [
      ...meta("Hipoteca"),
      ...Object.entries(data).map(([k, v]) => [k, v] as [string, string | number]),
    ] as Filas),
  ]);
}

export async function exportInversionesXLSX(data: Record<string, unknown>, ..._rest: unknown[]) {
  descargarCSV("plan-inversiones", [
    seccion("INVERSIONES", [
      ...meta("Inversiones"),
      ...Object.entries(data).map(([k, v]) => [k, v] as [string, string | number]),
    ] as Filas),
  ]);
}

export async function exportJubilacionXLSX(data: Record<string, unknown>, ..._rest: unknown[]) {
  descargarCSV("plan-jubilacion", [
    seccion("JUBILACION", [
      ...meta("Jubilación"),
      ...Object.entries(data).map(([k, v]) => [k, v] as [string, string | number]),
    ] as Filas),
  ]);
}

export async function exportObjetivosXLSX(data: Record<string, unknown>, ..._rest: unknown[]) {
  descargarCSV("plan-objetivos", [
    seccion("OBJETIVOS", [
      ...meta("Objetivos"),
      ...Object.entries(data).map(([k, v]) => [k, v] as [string, string | number]),
    ] as Filas),
  ]);
}

export async function exportPasivosXLSX(data: Record<string, unknown>, ..._rest: unknown[]) {
  descargarCSV("plan-pasivos", [
    seccion("PASIVOS", [
      ...meta("Pasivos"),
      ...Object.entries(data).map(([k, v]) => [k, v] as [string, string | number]),
    ] as Filas),
  ]);
}

export async function exportPresupuestoXLSX(data: Record<string, unknown>, ..._rest: unknown[]) {
  descargarCSV("plan-presupuesto", [
    seccion("PRESUPUESTO", [
      ...meta("Presupuesto"),
      ...Object.entries(data).map(([k, v]) => [k, v] as [string, string | number]),
    ] as Filas),
  ]);
}
