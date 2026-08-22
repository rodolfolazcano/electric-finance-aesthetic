import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMarketNews } from "@/lib/market-news.functions";
import { getArgentinaContext } from "@/lib/argentina-context.functions";
import { enrichNewsWithContext } from "@/lib/news-context-filter";
import { Newspaper, ExternalLink, RefreshCw } from "lucide-react";

const MAX_ITEMS = 6;

const SOURCE_STYLES: Record<string, string> = {
  Ámbito: "bg-primary/10 text-primary",
  Cronista: "bg-warning/10 text-warning",
  Infobae: "bg-success/10 text-success",
  Investing: "bg-muted/20 text-muted-foreground",
  Reuters: "bg-danger/10 text-danger",
  BCRA: "bg-cyan-900/30 text-cyan-300",
  "Google News": "bg-muted/20 text-muted-foreground",
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center gap-2">
        <div className="h-4 w-14 rounded bg-white/5" />
        <div className="h-3 w-16 rounded bg-white/5" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-4 w-full rounded bg-white/5" />
        <div className="h-4 w-3/4 rounded bg-white/5" />
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="h-3 w-full rounded bg-white/5" />
        <div className="h-3 w-2/3 rounded bg-white/5" />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="h-4 w-16 rounded bg-white/5" />
        <div className="h-3 w-10 rounded bg-white/5" />
      </div>
    </div>
  );
}

export function MarketNewsSection() {
  const newsFn = useServerFn(getMarketNews);
  const argFn = useServerFn(getArgentinaContext);

  const newsQuery = useQuery({
    queryKey: ["home-market-news"],
    queryFn: () => newsFn(),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const argQuery = useQuery({
    queryKey: ["argentina-context"],
    queryFn: () => argFn(),
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const isLoading = newsQuery.isLoading;
  const isError = newsQuery.isError;
  const rawItems = newsQuery.data?.items ?? [];
  const timestamp = argQuery.data?.generatedAt;
  const ctx = argQuery.data;

  const enriched = enrichNewsWithContext(rawItems, ctx);

  const argentinaItems = enriched.filter((i) => i.region === "argentina").slice(0, MAX_ITEMS);
  const internacionalItems = enriched.filter((i) => i.region === "internacional").slice(
    0,
    Math.max(0, MAX_ITEMS - argentinaItems.length),
  );
  const displayItems = argentinaItems.length >= MAX_ITEMS
    ? argentinaItems
    : [...argentinaItems, ...internacionalItems];

  const totalARG = enriched.filter((i) => i.region === "argentina").length;

  if (isLoading) {
    return (
      <section className="border-y border-white/10 bg-white/[0.01] py-16 sm:py-20">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
          <SectionHeader />
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="border-y border-white/10 bg-white/[0.01] py-16 sm:py-20">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
          <SectionHeader />
          <div className="mt-8 flex items-center justify-center rounded-2xl border border-dashed border-white/10 py-16 text-center">
            <div className="max-w-xs">
              <Newspaper className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="mt-3 text-[13px] text-muted-foreground">
                No pudimos cargar las noticias recientes. Intentá de nuevo más tarde.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (displayItems.length === 0) {
    return (
      <section className="border-y border-white/10 bg-white/[0.01] py-16 sm:py-20">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
          <SectionHeader />
          <div className="mt-8 flex items-center justify-center rounded-2xl border border-dashed border-white/10 py-16 text-center">
            <div className="max-w-xs">
              <RefreshCw className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="mt-3 text-[13px] text-muted-foreground">
                Sin noticias relevantes hoy. Volvé a consultar más tarde.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="border-y border-white/10 bg-white/[0.01] py-16 sm:py-20">
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
        <SectionHeader />
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayItems.map((item) => {
            const sourceStyle = SOURCE_STYLES[item.source] ?? "bg-muted/30 text-muted-foreground";
            return (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-5 backdrop-blur-md transition-all hover:border-primary/20 hover:bg-white/[0.04]"
              >
                {/* Top: source + time */}
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block rounded-md px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider ${sourceStyle}`}
                  >
                    {item.source}
                  </span>
                  <span className="font-mono text-[9px] text-muted-foreground/50">
                    {timeAgo(item.publishedAt)}
                  </span>
                </div>

                {/* Title */}
                <h3 className="mt-3 flex-1 text-[13px] font-medium leading-snug text-foreground transition-colors group-hover:text-primary line-clamp-2">
                  {item.title}
                </h3>

                {/* Summary */}
                {item.summary && (
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                    {item.summary}
                  </p>
                )}

                {/* Bottom: topic badge + leer link */}
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {item.topicLabel && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider ${
                          item.hasLiveMatch
                            ? "border border-primary/30 bg-primary/20 text-primary"
                            : "bg-white/[0.04] text-muted-foreground/60"
                        }`}
                      >
                        {item.hasLiveMatch && (
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                          </span>
                        )}
                        {item.topicLabel}
                      </span>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/40 transition-colors group-hover:text-primary/60">
                    Leer
                    <ExternalLink className="h-3 w-3" />
                  </span>
                </div>
              </a>
            );
          })}
        </div>

        {/* Stats bar */}
        <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[9px] text-muted-foreground/40">
              {totalARG > 0 ? `${totalARG} noticias de Argentina` : null}
              {totalARG > 0 && internacionalItems.length > 0 ? " · " : null}
              {internacionalItems.length > 0
                ? `${internacionalItems.length} internacionales`
                : null}
            </span>
          </div>
          {timestamp && (
            <span className="font-mono text-[9px] text-muted-foreground/30">
              {new Date(timestamp).toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function SectionHeader() {
  return (
    <div className="text-center">
      <h2 className="text-2xl font-light tracking-tight sm:text-3xl">
        Noticias que{" "}
        <span className="italic text-primary">importan</span>
      </h2>
      <p className="mt-3 text-sm text-muted-foreground">
        Argentina primero, después el mundo. Filtrado por contexto de mercado.
      </p>
    </div>
  );
}
