import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PROVIDER_LABEL,
  TASK_LABEL,
  TASKS,
  selectableForTask,
  type ModelPrefs,
} from "@/lib/ai/model-catalog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  prefs: ModelPrefs;
  onChange: (prefs: ModelPrefs) => void;
};

/** Selector de modelo primario por tarea. El resto de la cadena sigue como failover. */
export function ModelPrefsPanel({ prefs, onChange }: Props) {
  const hasCustom = Object.values(prefs).some((v) => v && v.length > 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 rounded-full border px-2 py-1 transition-colors",
            hasCustom
              ? "border-primary/50 bg-primary/10 text-foreground"
              : "border-border/60 hover:text-foreground",
          )}
          aria-label="Configurar modelos por tarea"
        >
          <SlidersHorizontal className="size-3" /> modelos
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="px-1 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Modelo primario por tarea (el resto queda de respaldo)
        </div>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {TASKS.map((task) => {
            const options = selectableForTask(task);
            const value = prefs[task] ?? "";
            return (
              <div key={task} className="grid grid-cols-[1fr_auto] items-center gap-2">
                <label className="text-[11px] text-muted-foreground">{TASK_LABEL[task]}</label>
                <Select
                  value={value}
                  onValueChange={(next) =>
                    onChange({ ...prefs, [task]: next === "auto" ? "" : next })
                  }
                >
                  <SelectTrigger className="h-7 w-44 text-[11px]">
                    <SelectValue placeholder="auto" />
                  </SelectTrigger>
                  <SelectContent className="w-44">
                    <SelectItem value="auto">auto (failover)</SelectItem>
                    {options.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        <span className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">
                            {PROVIDER_LABEL[opt.provider]}:
                          </span>
                          {opt.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
