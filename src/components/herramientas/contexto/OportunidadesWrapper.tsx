// @ts-nocheck
import { OportunidadesOrquestadasTab } from "@/components/herramientas/OportunidadesOrquestadasTab";
export function OportunidadesWrapper() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/40 bg-background/40 px-3 py-2 text-[11px] text-muted-foreground">
        El screening hereda el régimen intermarket vigente — Stage y confianza determinan sectores favorecidos.
      </div>
      <OportunidadesOrquestadasTab />
    </div>
  );
}
