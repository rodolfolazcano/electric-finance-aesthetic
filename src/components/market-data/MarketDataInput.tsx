"use client";
import { useState, useCallback, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getYahooQuoteServer,
  getYahooHistoricalServer,
  getIOLHistoricalServer,
} from "@/lib/market-data.functions";
import type {
  MarketDataInputProps,
  MarketDataState,
  DataSource,
  MercadoIOL,
  RangoHistorico,
  IntervaloHistorico,
} from "@/lib/market-data.types";
import { rangosDisponibles, INTERVALO_MAX_DAYS, RANGO_DAYS } from "@/lib/market-data.types";
import PriceCard from "./PriceCard";
import HistoricalChart from "./HistoricalChart";
import DataSourceBadge from "./DataSourceBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const RANGOS: RangoHistorico[] = ["1M", "3M", "6M", "1A", "2A", "5A"];

export const INTERVALOS: IntervaloHistorico[] = ["1m", "5m", "15m", "30m", "1h", "1d", "1wk", "1mo"];

export function MarketDataInput({
  defaultTicker = "",
  defaultSource = "yahoo",
  defaultMercado = "bCBA",
  defaultToken,
  defaultRefreshToken,
  defaultIntervalo = "1d",
  onQuoteReceived,
  onHistoricalReceived,
  onTokenRefresh,
  onTickerChange,
  onRangoChange,
  onIntervaloChange,
  onSourceChange,
  onMercadoChange,
  onAnalyze,
  showChart = true,
  showQuoteCard = true,
  chartHeight = 300,
  className,
  buttonLabel = "Obtener datos",
  disabled = false,
  overrideValue,
  alwaysFireOnAnalyze = false,
}: MarketDataInputProps) {
  const [state, setState] = useState<MarketDataState>({
    source: defaultSource,
    ticker: overrideValue ?? defaultTicker,
    mercadoIOL: defaultMercado,
    rango: "2A",
    intervalo: defaultIntervalo,
    isLoadingQuote: false,
    isLoadingHistorical: false,
    errorQuote: null,
    errorHistorical: null,
    quote: null,
    historical: [],
  });

  // Sync overrideValue changes into state
  useEffect(() => {
    if (overrideValue !== undefined) {
      setState((s) => ({ ...s, ticker: overrideValue }));
    }
  }, [overrideValue]);

  // Si no hay sesiÃ³n IOL, forzar volver a Yahoo (no se puede usar IOL sin login)
  useEffect(() => {
    if (!defaultToken && state.source === "iol") {
      setState((s) => ({ ...s, source: "yahoo" }));
      onSourceChange?.("yahoo");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultToken]);

  // Notify parent of initial rango on mount
  useEffect(() => {
    onRangoChange?.(state.rango);
  }, []);

  const fetchYahooQuote = useServerFn(getYahooQuoteServer);
  const fetchYahooHistorical = useServerFn(getYahooHistoricalServer);
  const fetchIOLHistorical = useServerFn(getIOLHistoricalServer);

  const handleIntervaloChange = useCallback(
    async (intervalo: IntervaloHistorico) => {
      const available = rangosDisponibles(intervalo);
      let rango = state.rango;
      if (!available.includes(rango)) {
        rango = available[available.length - 1] ?? "1M";
      }
      setState((s) => ({ ...s, intervalo, rango }));
      onRangoChange?.(rango);
      onIntervaloChange?.(intervalo);
      if (!state.ticker.trim()) return;
      setState((s) => ({ ...s, isLoadingHistorical: true, errorHistorical: null }));
      if (state.source === "yahoo") {
        const symbol = state.ticker.split(/[\s,]+/)[0].toUpperCase();
        try {
          const bars = await fetchYahooHistorical({ data: { symbol, rango, intervalo } });
          setState((s) => ({ ...s, historical: bars, isLoadingHistorical: false }));
          onHistoricalReceived?.(bars);
        } catch (e) {
          setState((s) => ({ ...s, errorHistorical: String(e), isLoadingHistorical: false }));
        }
      }
      if (state.source === "yahoo" || alwaysFireOnAnalyze) onAnalyze?.(state.ticker, rango);
    },
    [state.rango, state.ticker, state.source, onRangoChange, onIntervaloChange, onHistoricalReceived, onAnalyze, fetchYahooHistorical, alwaysFireOnAnalyze],
  );

  const fetchData = useCallback(async () => {
    if (!state.ticker.trim()) return;

    setState((s) => ({
      ...s,
      isLoadingQuote: true,
      isLoadingHistorical: true,
      errorQuote: null,
      errorHistorical: null,
    }));

    if (state.source === "yahoo") {
      const symbol = state.ticker.split(/[\s,]+/)[0].toUpperCase();

      const [quoteResult, historicalResult] = await Promise.allSettled([
        fetchYahooQuote({ data: { symbol } }),
        fetchYahooHistorical({ data: { symbol, rango: state.rango, intervalo: state.intervalo } }),
      ]);

      setState((s) => ({
        ...s,
        isLoadingQuote: false,
        isLoadingHistorical: false,
        quote: quoteResult.status === "fulfilled" ? quoteResult.value : null,
        errorQuote: quoteResult.status === "rejected" ? String(quoteResult.reason) : null,
        historical: historicalResult.status === "fulfilled" ? historicalResult.value : [],
        errorHistorical:
          historicalResult.status === "rejected" ? String(historicalResult.reason) : null,
      }));

      if (quoteResult.status === "fulfilled") onQuoteReceived?.(quoteResult.value);
      if (historicalResult.status === "fulfilled") onHistoricalReceived?.(historicalResult.value);
    } else {
      const token = defaultToken;
      if (!token) {
        setState((s) => ({
          ...s,
          isLoadingQuote: false,
          isLoadingHistorical: false,
          errorQuote: "IOL requiere inicio de sesion â€” inicia sesion desde el panel superior",
          errorHistorical: "IOL requiere inicio de sesion â€” inicia sesion desde el panel superior",
        }));
        return;
      }

      const iolSymbol = state.ticker.split(/[\s,]+/)[0].toUpperCase();

      const historicalResult = await fetchIOLHistorical({
        data: {
          ticker: iolSymbol,
          mercado: state.mercadoIOL,
          token,
          refreshToken: defaultRefreshToken ?? null,
          rango: state.rango,
        },
      }).catch(() => null);
      const historical = historicalResult?.data ?? [];
      const histErr = historicalResult ? null : "Error al obtener datos de IOL";

      setState((s) => ({
        ...s,
        isLoadingQuote: false,
        isLoadingHistorical: false,
        quote: null,
        errorQuote: null,
        historical,
        errorHistorical: histErr,
      }));

      if (historicalResult?.newToken) {
        onTokenRefresh?.(historicalResult.newToken, historicalResult.newRefreshToken ?? "");
      }

      if (historical.length > 0) onHistoricalReceived?.(historical);
    }

    if (state.source === "yahoo" || alwaysFireOnAnalyze) onAnalyze?.(state.ticker, state.rango);
  }, [
    state.ticker,
    state.source,
    state.mercadoIOL,
    state.rango,
    state.intervalo,
    defaultToken,
    defaultRefreshToken,
    onTokenRefresh,
    onAnalyze,
    alwaysFireOnAnalyze,
  ]);

  const handleRangoChange = async (rango: RangoHistorico) => {
    setState((s) => ({ ...s, rango }));
    onRangoChange?.(rango);
    if (!state.ticker.trim()) return;
    setState((s) => ({ ...s, isLoadingHistorical: true, errorHistorical: null }));

    if (state.source === "yahoo") {
      const symbol = state.ticker.split(/[\s,]+/)[0].toUpperCase();
      try {
        const bars = await fetchYahooHistorical({ data: { symbol, rango, intervalo: state.intervalo } });
        setState((s) => ({ ...s, historical: bars, isLoadingHistorical: false }));
        onHistoricalReceived?.(bars);
      } catch (e) {
        setState((s) => ({ ...s, errorHistorical: String(e), isLoadingHistorical: false }));
      }
      onAnalyze?.(state.ticker, rango);
    } else if (state.source === "iol") {
      if (alwaysFireOnAnalyze) onAnalyze?.(state.ticker, rango);
      if (!defaultToken) {
        setState((s) => ({ ...s, isLoadingHistorical: false }));
        return;
      }
      const iolSymbol = state.ticker.split(/[\s,]+/)[0].toUpperCase();
      try {
        const historicalResult = await fetchIOLHistorical({
          data: {
            ticker: iolSymbol,
            mercado: state.mercadoIOL,
            token: defaultToken,
            refreshToken: defaultRefreshToken ?? null,
            rango,
          },
        });
        const bars = historicalResult?.data ?? [];
        setState((s) => ({ ...s, historical: bars, isLoadingHistorical: false }));
        onHistoricalReceived?.(bars);
        if (historicalResult?.newToken) {
          onTokenRefresh?.(historicalResult.newToken, historicalResult.newRefreshToken ?? "");
        }
      } catch (e) {
        setState((s) => ({ ...s, errorHistorical: String(e), isLoadingHistorical: false }));
      }
    } else {
      setState((s) => ({ ...s, isLoadingHistorical: false }));
    }
  };

  return (
    <Card className={cn("bg-surface border border-border/60", className)}>
      <CardHeader className="pb-2 py-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground text-sm font-medium">Datos de mercado</CardTitle>
          {state.quote && <DataSourceBadge source={state.source} />}
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {/* Source selector */}
        <div className="flex gap-1">
          <button
            onClick={() => { setState((s) => ({ ...s, source: "yahoo" })); onSourceChange?.("yahoo"); }}
            className={cn(
              "flex-1 h-6 rounded text-[10px] font-medium border transition-colors",
              state.source === "yahoo"
                ? "bg-primary/10 border-primary text-primary"
                : "bg-transparent border-border/60 text-muted-foreground hover:border-primary/40",
            )}
          >
            Yahoo Finance
          </button>
          <button
            onClick={() => { setState((s) => ({ ...s, source: "iol" })); onSourceChange?.("iol"); }}
            disabled={!defaultToken}
            className={cn(
              "flex-1 h-6 rounded text-[10px] font-medium border transition-colors",
              state.source === "iol"
                ? "bg-primary/10 border-primary text-primary"
                : "bg-transparent border-border/60 text-muted-foreground",
              defaultToken
                ? "hover:border-primary/40"
                : "opacity-40 cursor-not-allowed",
            )}
            title={
              defaultToken
                ? "Datos en tiempo real de InvertirOnline"
                : "Inicia sesiÃ³n en IOL (panel superior) para habilitar esta fuente"
            }
          >
            IOL{!defaultToken ? " Â· sin sesiÃ³n" : ""}
          </button>
        </div>

        {/* Ticker + [Mercado solo IOL] + Periodo */}
        <div className="flex gap-2 items-end">
          <div className={cn(state.source === "iol" ? "flex-1" : "flex-[2]")}>
            <Input
              value={state.ticker}
              onChange={(e) => {
                if (disabled) return;
                const v = e.target.value.toUpperCase();
                setState((s) => ({ ...s, ticker: v }));
                onTickerChange?.(v);
              }}
              onKeyDown={(e) => e.key === "Enter" && !disabled && fetchData()}
              disabled={disabled}
              placeholder={
                disabled ? "Mis tenencias IOL" :
                state.source === "yahoo" ? "AAPL, GGAL.BA, SPY..." : "GGAL, AL30, SPY..."
              }
              className="h-7 text-[11px] bg-background/40 border-border/60 text-foreground placeholder:text-muted-foreground/40 focus:border-primary font-mono disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          {/* Mercado: solo para IOL (yfinance no usa mercado) */}
          {state.source === "iol" && (
            <div className="w-[110px]">
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Mercado</Label>
                <Select
                  value={state.mercadoIOL}
                  onValueChange={(v) => { setState((s) => ({ ...s, mercadoIOL: v as MercadoIOL })); onMercadoChange?.(v as MercadoIOL); }}
                >
                  <SelectTrigger className="bg-background/40 border-border/60 text-foreground focus:ring-primary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-surface border-border/60">
                    <SelectItem value="bCBA" className="text-foreground focus:bg-primary/10">
                      BCBA
                    </SelectItem>
                    <SelectItem value="NYSE" className="text-foreground focus:bg-primary/10">
                      NYSE
                    </SelectItem>
                    <SelectItem value="NASDAQ" className="text-foreground focus:bg-primary/10">
                      NASDAQ
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {/* Intervalo: solo para Yahoo */}
          {state.source === "yahoo" && (
            <div className="w-[90px] space-y-1">
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">Intervalo</Label>
              <Select
                value={state.intervalo}
                onValueChange={(v) => handleIntervaloChange(v as IntervaloHistorico)}
              >
                <SelectTrigger className="bg-background/40 border-border/60 text-foreground focus:ring-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface border-border/60">
                  {INTERVALOS.map((i) => (
                    <SelectItem key={i} value={i} className="text-foreground focus:bg-primary/10">
                      {i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="w-[90px] space-y-1">
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">Periodo</Label>
            <Select
              value={state.rango}
              onValueChange={(v) => handleRangoChange(v as RangoHistorico)}
            >
              <SelectTrigger className="bg-background/40 border-border/60 text-foreground focus:ring-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-surface border-border/60">
                {rangosDisponibles(state.source === "yahoo" ? state.intervalo : "1d").map((r) => (
                  <SelectItem key={r} value={r} className="text-foreground focus:bg-primary/10">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* IOL session status */}
        {state.source === "iol" && !defaultToken && (
          <div className="p-3 rounded-md bg-background/40 border border-border/60 text-xs text-muted-foreground">
            IOL requiere inicio de sesion. Inicia sesion desde el panel superior.
          </div>
        )}

        <Button
          onClick={fetchData}
          disabled={disabled || state.isLoadingQuote || state.isLoadingHistorical || !state.ticker.trim()}
          className="w-full bg-primary text-primary-foreground font-semibold hover:bg-primary/80 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {state.isLoadingQuote || state.isLoadingHistorical
            ? "Obteniendo datos..."
            : buttonLabel}
        </Button>

        {/* Always show errors, even when showQuoteCard is false */}
        {!state.isLoadingQuote && state.errorQuote && (
          <div className="p-3 rounded-md bg-[#ff4757]/10 border border-[#ff4757]/30">
            <p className="text-[#ff4757] text-sm">{state.errorQuote}</p>
            <button
              onClick={fetchData}
              className="mt-2 text-[#ff4757] text-xs underline hover:no-underline"
            >
              Reintentar
            </button>
          </div>
        )}

        {showQuoteCard && (
          <>
            {state.isLoadingQuote && (
              <div className="space-y-2">
                <Skeleton className="h-5 w-24 bg-muted/40" />
                <Skeleton className="h-10 w-48 bg-muted/40" />
                <div className="grid grid-cols-4 gap-2">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-12 bg-muted/40" />
                  ))}
                </div>
              </div>
            )}
            {!state.isLoadingQuote && state.quote && !state.errorQuote && (
              <PriceCard quote={state.quote} />
            )}
          </>
        )}

        {showChart && (state.historical.length > 0 || state.isLoadingHistorical) && (
          <div className="space-y-3">
            {state.isLoadingHistorical ? (
              <Skeleton className="w-full bg-muted/40" style={{ height: chartHeight }} />
            ) : state.errorHistorical ? (
              <div className="p-3 rounded-md bg-[#ff4757]/10 border border-[#ff4757]/30">
                <p className="text-[#ff4757] text-sm">{state.errorHistorical}</p>
              </div>
            ) : (
              <HistoricalChart
                data={state.historical}
                height={chartHeight}
                moneda={state.quote?.moneda ?? "USD"}
                ticker={state.ticker}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


export default MarketDataInput;
