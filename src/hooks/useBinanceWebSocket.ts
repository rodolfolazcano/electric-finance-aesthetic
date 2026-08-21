"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { OrderBook, Ticker24h } from "@/lib/cripto.types";
import { parseDepthToLevels } from "@/lib/cripto.math";

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_MS = 3000;

interface BinanceWsState {
  orderBook: OrderBook | null;
  ticker: Ticker24h | null;
  lastPrice: number | null;
  connected: boolean;
}

function parseTicker(d: any): Ticker24h | null {
  if (!d?.c) return null;
  return {
    symbol: d.s,
    priceChange: parseFloat(d.p),
    priceChangePercent: parseFloat(d.P),
    lastPrice: parseFloat(d.c),
    volume: parseFloat(d.v),
    quoteVolume: parseFloat(d.q),
    highPrice: parseFloat(d.h),
    lowPrice: parseFloat(d.l),
    weightedAvgPrice: parseFloat(d.w),
  };
}

function parseOrderBook(d: any): OrderBook | null {
  if (!d?.bids || !d?.asks) return null;
  const bids = parseDepthToLevels(d.bids);
  const asks = parseDepthToLevels(d.asks);
  const bestBid = bids[0]?.price ?? 0;
  const bestAsk = asks[0]?.price ?? 0;
  if (!bestBid || !bestAsk) return null;
  return {
    bids, asks, bestBid, bestAsk,
    spread: bestAsk - bestBid,
    spreadPct: bestBid > 0 ? ((bestAsk - bestBid) / bestBid) * 100 : 0,
    midPrice: (bestBid + bestAsk) / 2,
  };
}

export function useBinanceWebSocket(symbol: string, testnet = false) {
  const [state, setState] = useState<BinanceWsState>({
    orderBook: null,
    ticker: null,
    lastPrice: null,
    connected: false,
  });
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number>(0);
  const connIdRef = useRef(0);
  const attemptRef = useRef(0);

  const connect = useCallback(() => {
    if (attemptRef.current >= MAX_RECONNECT_ATTEMPTS) return;
    attemptRef.current++;
    const baseSymbol = symbol.toLowerCase();
    const depthStream = testnet ? `${baseSymbol}@depth20` : `${baseSymbol}@depth20@100ms`;
    const streams = [depthStream, `${baseSymbol}@ticker`];
    const host = testnet ? "testnet.binance.vision" : "stream.binance.com:9443";
    const url = `wss://${host}/stream?streams=${streams.join("/")}`;
    const connId = ++connIdRef.current;

    try {
      const ws = new WebSocket(url);
      if (connId !== connIdRef.current) {
        if (ws.readyState === WebSocket.OPEN) ws.close();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (connId !== connIdRef.current) { ws.close(); return; }
        attemptRef.current = 0;
        setState((s) => ({ ...s, connected: true }));
      };

      ws.onmessage = (e) => {
        if (connId !== connIdRef.current) return;
        try {
          const raw = JSON.parse(e.data);
          const isCombined = raw.stream && raw.data;
          const data = isCombined ? raw.data : raw;
          const streamName: string = isCombined ? raw.stream : "";

          if (streamName.endsWith("depth20@100ms") || streamName.endsWith("depth20") || data?.bids) {
            const ob = parseOrderBook(data);
            if (ob) setState((s) => ({ ...s, orderBook: ob }));
          } else if (streamName.endsWith("ticker") || data?.e === "24hrTicker") {
            const tick = parseTicker(data);
            if (tick) setState((s) => ({ ...s, ticker: tick, lastPrice: tick.lastPrice }));
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onclose = () => {
        if (connId !== connIdRef.current) return;
        setState((s) => ({ ...s, connected: false }));
        if (attemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attemptRef.current - 1), 30000);
          reconnectRef.current = window.setTimeout(connect, delay);
        }
      };

      ws.onerror = () => { ws.close(); };
    } catch { /* ignore */ }
  }, [symbol, testnet]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      connIdRef.current++;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
    };
  }, [connect]);

  return state;
}
