interface Props {
  grid: Array<{
    a: number;
    b: number;
    sharpe: number;
    pnl: number;
    winRate: number;
    maxDD: number;
    trades: number;
  }>;
  optimalA: number;
  optimalB: number;
  metric: string;
}

export function BacktestHeatmap({ grid, optimalA, optimalB, metric }: Props) {
  if (grid.length === 0) return null;

  const aVals = [...new Set(grid.map((g) => g.a))].sort((a, b) => a - b);
  const bVals = [...new Set(grid.map((g) => g.b))].sort((a, b) => a - b);

  const getVal = (g: (typeof grid)[0]) => {
    switch (metric) {
      case "sharpe":
        return g.sharpe;
      case "pnl":
        return g.pnl;
      case "winrate":
        return g.winRate;
      case "maxdd":
        return -g.maxDD;
      default:
        return g.sharpe;
    }
  };

  const allVals = grid.map(getVal);
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const range = maxVal - minVal || 1;

  const colorScale = (val: number) => {
    const pct = (val - minVal) / range;
    const r = Math.round(255 * (1 - pct));
    const g = Math.round(255 * pct);
    const b = 50;
    return `rgb(${r}, ${g}, ${b})`;
  };

  const gridMap = new Map(grid.map((g) => [`${g.a}-${g.b}`, g]));

  return (
    <div className="space-y-2">
      <h3 className="font-mono text-xs font-medium text-foreground">
        Heatmap —{" "}
        {metric === "sharpe"
          ? "Sharpe"
          : metric === "pnl"
            ? "PNL Total"
            : metric === "winrate"
              ? "Win Rate"
              : "Max DD"}
      </h3>
      <div className="overflow-x-auto rounded-lg border border-border/40">
        <table className="w-full text-center font-mono text-[10px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-background px-2 py-1 text-muted-foreground">a\\b</th>
              {bVals.map((b) => (
                <th key={b} className="px-2 py-1 text-muted-foreground">
                  {b.toFixed(2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {aVals.map((a) => (
              <tr key={a}>
                <td className="sticky left-0 bg-background px-2 py-1 font-semibold text-muted-foreground">
                  {a.toFixed(2)}
                </td>
                {bVals.map((b) => {
                  const g = gridMap.get(`${a}-${b}`);
                  const val = g ? getVal(g) : 0;
                  const isOptimal = Math.abs(a - optimalA) < 0.01 && Math.abs(b - optimalB) < 0.01;
                  return (
                    <td
                      key={b}
                      className={`px-2 py-1.5 ${isOptimal ? "ring-1 ring-yellow-400 ring-inset" : ""}`}
                      style={{ backgroundColor: colorScale(val), color: "white" }}
                      title={`a=${a.toFixed(2)}, b=${b.toFixed(2)}: ${val.toFixed(2)}`}
                    >
                      {val.toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
