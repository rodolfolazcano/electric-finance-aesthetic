export function fmtUSD(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "0%";
  return (n * 100).toFixed(1) + "%";
}

export function fmtNum(n: number, dp = 2): string {
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(dp);
}

export function betaExplicacion(beta: number): string {
  const abs = Math.abs(beta);
  if (Math.abs(beta - 1) < 0.05) return "se mueve prácticamente igual que el mercado de referencia";
  if (abs > 1.5)
    return `se mueve un ${((abs - 1) * 100).toFixed(0)}% más fuerte que el mercado de referencia`;
  if (abs > 1)
    return `se mueve un ${((abs - 1) * 100).toFixed(0)}% más que el mercado de referencia`;
  if (abs < 0.5)
    return `se mueve menos de la mitad que el mercado de referencia (${(abs * 100).toFixed(0)}%)`;
  return `se mueve un ${((1 - abs) * 100).toFixed(0)}% menos que el mercado de referencia`;
}

export function r2Explicacion(r2: number): string {
  if (r2 > 0.7) return "muy correlacionado";
  if (r2 > 0.4) return "moderadamente correlacionado";
  if (r2 > 0.15) return "algo correlacionado";
  return "débilmente correlacionado";
}

export function r2Interpretacion(r2: number): string {
  if (r2 > 0.7) return "alta";
  if (r2 > 0.4) return "media";
  if (r2 > 0.15) return "baja";
  return "muy baja";
}

export function confiabilidadSemforo(conf: "alta" | "media" | "baja"): {
  color: string;
  icono: string;
  label: string;
} {
  if (conf === "alta") return { color: "text-success", icono: "", label: "Alta confianza" };
  if (conf === "media") return { color: "text-warning", icono: "", label: "Confianza media" };
  return { color: "text-danger", icono: "", label: "Correlación débil" };
}

export function accionIcono(accion: string): string {
  return "";
}
