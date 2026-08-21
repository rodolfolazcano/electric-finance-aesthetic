import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function InfoTip({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center justify-center cursor-help ml-1 h-3.5 w-3.5 rounded-full border border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:border-muted-foreground/60 transition-colors text-[13px] font-mono leading-none select-none align-text-top">
          ?
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] font-mono text-[13px] leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
