import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Newspaper, ExternalLink, Loader2 } from "lucide-react";
import { getMarketNews, type MarketNewsItem } from "@/lib/market-news.functions";

function formatRelative(iso: string): string {
  const d = new Date(iso).getTime();
  if (!d) return "";
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

export function NewsPanel({ compact = false }: { compact?: boolean }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["market-news"],
    queryFn: () => getMarketNews(),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const result = data ?? { items: [], sourcesOk: [] as string[], timestamp: "" };
  const items: MarketNewsItem[] = result.items ?? [];
  const shown = compact ? items.slice(0, 6) : items;

  return (
    <div className="glass rounded-2xl p-6">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
            <Newspaper className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="display text-lg text-foreground">Noticias del mercado</h3>
            <p className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Ámbito · Cronista · Infobae · Tiempo real
            </p>
          </div>
        </div>
        <span className="mono flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-success">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
          En vivo
        </span>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando noticias…
        </div>
      ) : isError || shown.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No se pudieron cargar las noticias en este momento.
        </div>
      ) : (
        <ul className="divide-y divide-white/5">
          {shown.map((n, i) => (
            <motion.li
              key={n.url + i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <a
                href={n.url}
                target="_blank"
                rel="noreferrer noopener"
                className="group flex gap-4 py-3 transition-colors hover:bg-white/[0.03] rounded-lg px-2 -mx-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="mono text-[10px] uppercase tracking-[0.2em] text-primary/80">
                      {n.source}
                    </span>
                    <span className="mono text-[10px] text-muted-foreground">
                      · hace {formatRelative(n.publishedAt)}
                    </span>
                  </div>
                  <h4 className="mt-1 text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2">
                    {n.title}
                  </h4>
                  {!compact && n.summary && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {n.summary}
                    </p>
                  )}
                </div>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
