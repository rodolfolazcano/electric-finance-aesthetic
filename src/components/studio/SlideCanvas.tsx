import { cn } from "@/lib/utils";
import type { SlideElement, SlideSpec } from "@/lib/types";
import { StudioChart } from "@/components/charts/StudioChart";

type Props = {
  spec: SlideSpec;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

const ratio: Record<SlideSpec["format"], string> = {
  square: "1 / 1",
  story: "9 / 16",
  banner: "16 / 9",
  report: "3 / 4",
};

function ElementView({ element }: { element: SlideElement }) {
  const size = element.size ?? 3;
  const align = element.align ?? "left";

  if (element.type === "chart") {
    return (
      <div className="h-full w-full">
        <StudioChart
          series={element.series ?? []}
          chartType={element.chartType}
          unit={element.unit}
          compact
        />
      </div>
    );
  }

  if (element.type === "metric") {
    return (
      <div style={{ textAlign: align }}>
        <div className="kicker" style={{ fontSize: `${size * 0.32}cqh` }}>
          {element.label}
        </div>
        <div
          className="num font-semibold leading-none"
          style={{
            fontSize: `${size}cqh`,
            color:
              element.tone === "negative"
                ? "var(--color-negative)"
                : element.tone === "positive"
                  ? "var(--color-positive)"
                  : "var(--color-foreground)",
          }}
        >
          {element.value}
        </div>
      </div>
    );
  }

  if (element.type === "label") {
    return (
      <div
        className="kicker"
        style={{ fontSize: `${size}cqh`, textAlign: align, letterSpacing: "0.18em" }}
      >
        {element.text}
      </div>
    );
  }

  if (element.type === "title") {
    return (
      <h2
        className="font-semibold leading-[1.05] tracking-tight"
        style={{ fontSize: `${size}cqh`, textAlign: align }}
      >
        {element.text}
      </h2>
    );
  }

  return (
    <p
      className="leading-snug text-muted-foreground"
      style={{ fontSize: `${size}cqh`, textAlign: align }}
    >
      {element.text}
    </p>
  );
}

export function SlideCanvas({ spec, selectedId, onSelect }: Props) {
  return (
    <div
      className="relative mx-auto w-full max-w-[520px] overflow-hidden rounded-lg border border-border bg-surface-2"
      style={{ aspectRatio: ratio[spec.format] ?? "1 / 1", containerType: "size" }}
      onClick={() => onSelect(null)}
    >
      {spec.background.imageUrl ? (
        <img
          src={spec.background.imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_0%,var(--color-surface-2),var(--color-background))]" />
      )}
      <div
        className="absolute inset-0 bg-background"
        style={{ opacity: spec.background.imageUrl ? (spec.background.overlay ?? 0.7) : 0.35 }}
      />

      {spec.elements.map((element) => (
        <button
          key={element.id}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(element.id);
          }}
          className={cn(
            "absolute rounded-sm p-[0.4cqh] text-left transition-colors",
            selectedId === element.id
              ? "ring-1 ring-primary"
              : "ring-1 ring-transparent hover:ring-border",
          )}
          style={{
            left: `${element.x}%`,
            top: `${element.y}%`,
            width: `${element.w}%`,
            height: element.h ? `${element.h}%` : undefined,
          }}
        >
          <ElementView element={element} />
        </button>
      ))}

      <div className="absolute bottom-[2%] right-[3%] kicker" style={{ fontSize: "1.5cqh" }}>
        Coronar Inversiones · Matrícula 2192
      </div>
    </div>
  );
}
