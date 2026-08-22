import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMarketNews } from "@/lib/market-news.functions";
import { Newspaper, ExternalLink } from "lucide-react";

function sourceBadge(source: string): { label: string; color: string } {
  const s = source.toLowerCase();
  if (s.includes("ambito")) return { label: "Ámbito", color: "bg-primary/10 text-primary" };
  if (s.includes("cronista")) return { label: "Cronista", color: "bg-warning/10 text-warning" };
  if (s.includes("infobae")) return { label: "Infobae", color: "bg-success/10 text-success" };
  if (s.includes("reuters")) return { label: "Reuters", color: "bg-danger/10 text-danger" };
  if (s.includes("bcra")) return { label: "BCRA", color: "bg-cyan-900/30 text-cyan-300" };
  return { label: source, color: "bg-muted/30 text-muted-foreground" };
}

export function MarketContextCards() {
  const fn = useServerFn(getMarketNews);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["home-market-news"],
    queryFn: () => fn(),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
        <SectionHeader />
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl border border-white/10 bg-white/[0.02]" />
          ))}
        </div>
      </section>
    );
  }

  if (isError || !data || data.items.length === 0) {
    return (
      <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
        <SectionHeader />
        <div className="mt-8 flex items-center justify-center rounded-2xl border border-dashed border-white/10 py-12 text-center">
          <div className="max-w-xs">
            <Newspaper className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-3 text-[13px] text-muted-foreground">
              No pudimos cargar las noticias recientes. Intentá de nuevo más tarde.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const top3 = data.items.slice(0, 3);

  return (
    <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <SectionHeader />
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {top3.map((item) => {
          const badge = sourceBadge(item.source);
          const dateStr = new Date(item.publishedAt).toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-2xl border border-white/10 bg-white/[0.02] p-5 backdrop-blur-md transition-all hover:border-primary/20 hover:bg-white/[0.04]"
            >
              <div className="flex items-center gap-2">
                <span className={`inline-block rounded-md px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider ${badge.color}`}>
                  {badge.label}
                </span>
                <span className="font-mono text-[9px] text-muted-foreground/50">{dateStr}</span>
              </div>
              <h3 className="mt-3 text-[13px] font-medium leading-snug text-foreground transition-colors group-hover:text-primary line-clamp-2">
                {item.title}
              </h3>
              {item.summary && (
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                  {item.summary}
                </p>
              )}
              <div className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground/50 transition-colors group-hover:text-primary/60">
                Leer
                <ExternalLink className="h-3 w-3" />
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function SectionHeader() {
  return (
    <div className="text-center">
      <h2 className="text-2xl font-light tracking-tight sm:text-3xl">
        Contexto de mercado{" "}
        <span className="italic text-primary">en vivo</span>
      </h2>
      <p className="mt-3 text-sm text-muted-foreground">
        Noticias y eventos recientes que mueven los mercados.
      </p>
    </div>
  );
}
