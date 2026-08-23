import { useState } from "react";

export function FieldHelp({ label, help, datoVivo, onUsar }: { label: string; help: string; datoVivo?: { label: string; valor: string } | null; onUsar?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <button onClick={() => setOpen(!open)} className="text-[11px] text-primary hover:underline">{open ? "Cerrar" : "¿Qué pongo?"}</button>
      </div>
      {help && open && <p className="mt-1 rounded bg-muted/15 border border-border/20 p-2 text-[11px] leading-relaxed text-muted-foreground">{help}</p>}
      {datoVivo && (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[11px] font-mono bg-primary/10 border border-primary/20 px-2 py-1 rounded">{datoVivo.label}: {datoVivo.valor}</span>
          {onUsar && <button onClick={onUsar} className="text-[11px] px-2 py-1 rounded border border-primary/30 bg-primary/10 text-primary">Usar</button>}
        </div>
      )}
    </div>
  );
}
