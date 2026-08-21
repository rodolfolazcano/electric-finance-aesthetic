import { Award, Link2 } from "lucide-react";

const items = [
  { icon: Award, label: "Certificación AF® IEAF" },
  { icon: Link2, label: "Operás con IOL, Balanz e Inviu" },
];

export function TrustBar() {
  return (
    <div className="border-y border-border/60 bg-background/40 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-center gap-8 px-5 py-3 sm:px-8">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2 text-[14px] text-muted-foreground"
          >
            <item.icon className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
