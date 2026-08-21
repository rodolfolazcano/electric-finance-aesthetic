export const SECTOR_DISPLAY = [
  { key: "Energy", label: "Energía", etf: "XLE", dot: "#f5a623" },
  { key: "Communication Services", label: "Comunicaciones", etf: "XLC", dot: "#9b59d0" },
  { key: "Financial Services", label: "Financieras", etf: "XLF", dot: "#2ecc71" },
  { key: "Consumer Defensive", label: "Consumo Básico", etf: "XLP", dot: "#8e44ad" },
  { key: "Real Estate", label: "Real Estate", etf: "XLRE", dot: "#e84393" },
  { key: "Healthcare", label: "Salud", etf: "XLV", dot: "#e74c3c" },
  { key: "Utilities", label: "Servicios Públicos", etf: "XLU", dot: "#1abc9c" },
  { key: "Basic Materials", label: "Materiales", etf: "XLB", dot: "#16a085" },
  { key: "Consumer Cyclical", label: "Consumo Discrecional", etf: "XLY", dot: "#e67e22" },
  { key: "Industrials", label: "Industriales", etf: "XLI", dot: "#7f8c8d" },
  { key: "Technology", label: "Tecnología", etf: "XLK", dot: "#3498db" },
] as const;

export type SectorDisplayKey = (typeof SECTOR_DISPLAY)[number]["key"];
