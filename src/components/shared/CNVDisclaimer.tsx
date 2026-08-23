export function CNVDisclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[14px] leading-snug text-muted-foreground border-t border-border/20 pt-4 ${className}`}>
      Herramientas informativas con datos de terceros. No constituyen recomendación de inversión.
      Fuentes: BYMA · IOL · Yahoo Finance · BCRA · Delay 15-20’
    </p>
  );
}

export const CNV_DISCLAIMER_TEXT =
  "Herramientas informativas con datos de terceros. No constituyen recomendación de inversión. Fuentes: BYMA · IOL · Yahoo Finance · BCRA · Delay 15-20’";
