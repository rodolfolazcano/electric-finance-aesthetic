import type { DataSource } from "@/lib/herramientas/market-data.types";

export default function DataSourceBadge({ source }: { source: DataSource }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-mono font-medium border ${
        source === "yahoo"
          ? "bg-blue-950/40 text-blue-400 border-blue-800/40"
          : "bg-orange-950/40 text-orange-400 border-orange-800/40"
      }`}
    >
      {source === "yahoo" ? "YF" : "IOL"}
    </span>
  );
}
