interface Row {
  label: string;
  etf: string;
  dot: string;
  value: number | null;
}

function formatAr(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1).replace(".", ",")}`;
}

export function SectorPerformanceBars({ rows }: { rows: Row[] }) {
  const sorted = [...rows]
    .filter((r) => r.value != null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const maxAbs = Math.max(...sorted.map((r) => Math.abs(r.value ?? 0)), 0.1);

  if (sorted.length === 0) {
    return (
      <div className="bg-[#141518] rounded-lg p-6 text-center text-sm text-muted-foreground">
        No hay datos de performance disponibles.
      </div>
    );
  }

  return (
    <div className="bg-[#141518] rounded-lg p-6 space-y-3">
      {sorted.map((r) => {
        const v = r.value ?? 0;
        const positive = v >= 0;
        const widthPct = (Math.abs(v) / maxAbs) * 100;
        return (
          <div key={r.label} className="grid grid-cols-[180px_1fr_60px] items-center gap-3">
            <div className="flex items-center gap-2 justify-end text-sm text-foreground">
              <span>{r.label}</span>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.dot }} />
            </div>
            <div className="h-5 bg-transparent flex items-center">
              <div
                className={`h-5 rounded-sm ${positive ? "bg-emerald-500" : "bg-red-500"}`}
                style={{ width: `${widthPct}%` }}
                title={r.etf}
              />
            </div>
            <span className={`text-sm font-mono ${positive ? "text-emerald-400" : "text-red-400"}`}>
              {formatAr(v)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
