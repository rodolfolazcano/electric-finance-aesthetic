import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getMarketNews, type MarketNewsItem } from "@/lib/market-news.functions";
import { getPortfolioNews, type PortfolioNewsItem } from "@/lib/portfolio-news.functions";

const CATEGORY_COLORS: Record<MarketNewsItem["category"], string> = {
  acciones: "bg-blue-950/40 text-blue-400 border-blue-800/40",
  bonos: "bg-amber-950/40 text-amber-400 border-amber-800/40",
  cedears: "bg-purple-950/40 text-purple-400 border-purple-800/40",
  cripto: "bg-orange-950/40 text-orange-400 border-orange-800/40",
  fx: "bg-cyan-950/40 text-cyan-400 border-cyan-800/40",
  macro: "bg-emerald-950/40 text-emerald-400 border-emerald-800/40",
  commodities: "bg-yellow-950/40 text-yellow-400 border-yellow-800/40",
};

const CATEGORY_LABELS: Record<string, string> = {
  todas: "Todas",
  acciones: "Acciones",
  bonos: "Bonos",
  cedears: "CEDEARs",
  cripto: "Cripto",
  fx: "FX/Dólar",
  macro: "Macro",
  commodities: "Commodities",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}hs`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

function NewsCard({ item }: { item: MarketNewsItem }) {
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
      <Card className="glass-2 group cursor-pointer border-border/40 p-6 transition-colors hover:border-primary/30">
        <div className="mb-2 flex items-center gap-2">
          <span
            className={`rounded border px-1.5 py-0.5 text-[13px] font-mono ${CATEGORY_COLORS[item.category]}`}
          >
            {CATEGORY_LABELS[item.category] ?? item.category}
          </span>
          <span className="text-[13px] text-muted-foreground">{item.source}</span>
          <span className="ml-auto text-[13px] text-muted-foreground">
            {timeAgo(item.publishedAt)}
          </span>
        </div>
        <h4 className="mb-1 text-sm font-medium leading-snug text-foreground group-hover:text-primary transition-colors">
          {item.title}
        </h4>
        {item.summary && (
          <p className="text-xs text-muted-foreground leading-relaxed">{item.summary}</p>
        )}
        <span className="mt-2 inline-block text-[13px] font-mono text-primary/60 group-hover:text-primary transition-colors">
          Leer más →
        </span>
      </Card>
    </a>
  );
}

function iolToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("iol_bearer_token");
}

function iolRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("iol_refresh_token");
}

export function MarketNewsPanel() {
  const getMarketNewsFn = useServerFn(getMarketNews);
  const getPortfolioNewsFn = useServerFn(getPortfolioNews);
  const [filterCategory, setFilterCategory] = useState<string>("todas");
  const [regionTab, setRegionTab] = useState("argentina");
  const token = iolToken();
  const refreshToken = iolRefreshToken();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["market-news"],
    queryFn: () => getMarketNewsFn(),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const {
    data: portfolioNews,
    isLoading: portfolioLoading,
    isError: portfolioError,
  } = useQuery({
    queryKey: ["portfolio-news", token],
    queryFn: () =>
      getPortfolioNewsFn({
        data: { token: token!, refreshToken, pais: "Argentina" },
      }),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const filteredItems = useMemo(() => {
    if (!data) return [];
    let items = data.items;
    if (regionTab !== "todas") {
      items = items.filter((i) => i.region === regionTab);
    }
    if (filterCategory !== "todas") {
      items = items.filter((i) => i.category === filterCategory);
    }
    return items.slice(0, 30);
  }, [data, regionTab, filterCategory]);

  if (isLoading) {
    return (
      <div className="space-y-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 p-6 text-sm text-danger">
        Error al cargar noticias. Intente nuevamente.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Source badge */}
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
        <span className="font-mono">Fuentes:</span>
        {["Ámbito", "Cronista", "Infobae", "Investing", "Reuters", "Google News", "BCRA"].map(
          (src) => (
            <span
              key={src}
              className={`rounded border px-1.5 py-0.5 font-mono text-[13px] ${
                (data?.sourcesOk?.includes(src) ?? false)
                  ? "border-emerald-800/40 bg-emerald-950/40 text-emerald-400"
                  : "border-border/40 bg-muted/20 text-muted-foreground line-through"
              }`}
            >
              {src}
            </span>
          ),
        )}
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilterCategory(key)}
            className={`rounded border px-2 py-1 text-[14px] font-mono transition-colors ${
              filterCategory === key
                ? "border-primary/60 bg-primary/10 text-foreground"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Region tabs */}
      <Tabs value={regionTab} onValueChange={setRegionTab}>
        <TabsList className="w-full justify-start gap-0 rounded-none border-b border-border/60 bg-transparent p-0">
          <TabsTrigger
            value="argentina"
            className="relative rounded-none border-b-2 border-transparent px-4 py-2 text-xs font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
          >
            Argentina
          </TabsTrigger>
          <TabsTrigger
            value="internacional"
            className="relative rounded-none border-b-2 border-transparent px-4 py-2 text-xs font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
          >
            Internacional
          </TabsTrigger>
          <TabsTrigger
            value="todas"
            className="relative rounded-none border-b-2 border-transparent px-4 py-2 text-xs font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
          >
            Todas
          </TabsTrigger>
        </TabsList>
        <TabsContent value={regionTab} className="mt-3">
          {filteredItems.length === 0 ? (
            <div className="glass flex min-h-[160px] items-center justify-center p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No hay noticias disponibles para esta selección.
              </p>
            </div>
          ) : (
            <div className="grid w-full gap-5 sm:grid-cols-2">
              {filteredItems.map((item) => (
                <NewsCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Portfolio news */}
      {token && (
        <div className="space-y-5 pt-4 border-t border-border/40">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-xs font-medium text-foreground">
              Noticias de mi cartera IOL
            </h3>
            {portfolioNews && (
              <span className="font-mono text-[13px] text-muted-foreground">
                {portfolioNews.symbols.length} activos — $
                {portfolioNews.totalValorizado.toLocaleString("es-AR", {
                  minimumFractionDigits: 0,
                })}
              </span>
            )}
          </div>

          {portfolioLoading && (
            <div className="space-y-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          )}

          {portfolioError && (
            <div className="rounded-md border border-danger/40 bg-danger/10 p-5 text-[14px] font-mono text-danger">
              Error al cargar noticias del portafolio.
            </div>
          )}

          {portfolioNews && portfolioNews.items.length === 0 && (
            <div className="rounded-lg border border-border/40 px-4 py-6 text-center font-mono text-[14px] text-muted-foreground">
              No hay noticias recientes para los activos de tu cartera.
            </div>
          )}

          {portfolioNews && portfolioNews.items.length > 0 && (
            <div className="grid w-full gap-5 sm:grid-cols-2">
              {portfolioNews.items.map((item) => (
                <a
                  key={item.uuid}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Card className="glass-2 group cursor-pointer border-border/40 p-6 transition-colors hover:border-primary/30">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded border border-purple-800/40 bg-purple-950/40 px-1.5 py-0.5 text-[13px] font-mono text-purple-400">
                        {item.ticker}
                      </span>
                      <span className="text-[13px] text-muted-foreground">{item.publisher}</span>
                      <span className="ml-auto text-[13px] text-muted-foreground">
                        {timeAgo(new Date(item.providerPublishTime * 1000).toISOString())}
                      </span>
                    </div>
                    <h4 className="mb-1 text-sm font-medium leading-snug text-foreground group-hover:text-primary transition-colors">
                      {item.title}
                    </h4>
                    {item.summary && (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {item.summary.length > 200
                          ? item.summary.slice(0, 200) + "…"
                          : item.summary}
                      </p>
                    )}
                    <span className="mt-2 inline-block text-[13px] font-mono text-primary/60 group-hover:text-primary transition-colors">
                      Leer más →
                    </span>
                  </Card>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
