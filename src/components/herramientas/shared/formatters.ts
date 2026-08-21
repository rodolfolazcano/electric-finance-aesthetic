export function fmtNum(n: number | null | undefined, dp = 2) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
export function fmtPct(n: number | null | undefined, dp = 2) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
}
export function fmtCap(n: number | null | undefined) {
  if (n == null) return "\u2014";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toLocaleString();
}
export function lightColor(l: "green" | "yellow" | "red") {
  if (l === "green") return "text-success border-success/40 bg-success/10";
  if (l === "yellow") return "text-warning border-warning/40 bg-warning/10";
  return "text-danger border-danger/40 bg-danger/10";
}
export function toCedearTicker(base: string, mode: "ARS" | "USD"): string {
  const clean = base.replace(/\.BA$/i, "").replace(/D$/i, "");
  if (mode === "ARS") return clean + ".BA";
  return clean + "D";
}
