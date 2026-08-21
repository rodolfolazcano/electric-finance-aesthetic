import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "./supabase";
import type { Signal, BinanceDepthLevel } from "./cripto.types";

/*
  SQL para crear las tablas en Supabase:

  CREATE TABLE IF NOT EXISTS binance_signals (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    symbol TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    type TEXT NOT NULL,
    entry_price DOUBLE PRECISION NOT NULL,
    sl DOUBLE PRECISION NOT NULL,
    tp DOUBLE PRECISION NOT NULL,
    z_score DOUBLE PRECISION NOT NULL,
    obi DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL DEFAULT 'abierta',
    exit_price DOUBLE PRECISION,
    exit_time BIGINT,
    pnl DOUBLE PRECISION,
    pnl_pct DOUBLE PRECISION,
    exit_reason TEXT,
    binance_order_id BIGINT,
    quantity DOUBLE PRECISION,
    api_key_hash TEXT
  );

  CREATE TABLE IF NOT EXISTS binance_order_book_snapshots (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    symbol TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    best_bid DOUBLE PRECISION,
    best_ask DOUBLE PRECISION,
    spread DOUBLE PRECISION,
    spread_pct DOUBLE PRECISION,
    mid_price DOUBLE PRECISION,
    bids JSONB,
    asks JSONB,
    obi DOUBLE PRECISION,
    z_score DOUBLE PRECISION
  );

  CREATE INDEX IF NOT EXISTS idx_binance_signals_symbol ON binance_signals(symbol);
  CREATE INDEX IF NOT EXISTS idx_binance_signals_created_at ON binance_signals(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_binance_ob_snapshots_symbol ON binance_order_book_snapshots(symbol);
  CREATE INDEX IF NOT EXISTS idx_binance_ob_snapshots_created_at ON binance_order_book_snapshots(created_at DESC);
*/

export const saveSignal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      symbol: z.string().min(1).max(20),
      timestamp: z.number(),
      type: z.enum(["LONG", "SHORT"]),
      entryPrice: z.number().positive(),
      sl: z.number(),
      tp: z.number(),
      zScore: z.number(),
      obi: z.number(),
      status: z.string().default("abierta"),
      exitPrice: z.number().optional(),
      exitTime: z.number().optional(),
      pnl: z.number().optional(),
      pnlPct: z.number().optional(),
      exitReason: z.string().optional(),
      binanceOrderId: z.number().optional(),
      quantity: z.number().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      if (!supabase) return { success: false };
      const { error } = await supabase.from("binance_signals").insert({
        symbol: data.symbol,
        timestamp: data.timestamp,
        type: data.type,
        entry_price: data.entryPrice,
        sl: data.sl,
        tp: data.tp,
        z_score: data.zScore,
        obi: data.obi,
        status: data.status,
        exit_price: data.exitPrice ?? null,
        exit_time: data.exitTime ?? null,
        pnl: data.pnl ?? null,
        pnl_pct: data.pnlPct ?? null,
        exit_reason: data.exitReason ?? null,
        binance_order_id: data.binanceOrderId ?? null,
        quantity: data.quantity ?? null,
      });
      if (error) throw new Error(error.message);
      return { success: true };
    } catch {
      return { success: false };
    }
  });

export const updateSignal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      timestamp: z.number(),
      status: z.string(),
      exitPrice: z.number().optional(),
      exitTime: z.number().optional(),
      pnl: z.number().optional(),
      pnlPct: z.number().optional(),
      exitReason: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!supabase) return { success: false };
    const { error } = await supabase
      .from("binance_signals")
      .update({
        status: data.status,
        exit_price: data.exitPrice ?? null,
        exit_time: data.exitTime ?? null,
        pnl: data.pnl ?? null,
        pnl_pct: data.pnlPct ?? null,
        exit_reason: data.exitReason ?? null,
      })
      .eq("timestamp", data.timestamp);
    if (error) throw new Error(`Supabase update signal error: ${error.message}`);
    return { success: true };
  });

export const getSignalHistory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      symbol: z.string().min(1).max(20).optional(),
      limit: z.number().default(100),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      if (!supabase) return [];
      let query = supabase
        .from("binance_signals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(data.limit);
      if (data.symbol) query = query.eq("symbol", data.symbol);
      const { data: rows, error } = await query;
      if (error) return [];
      return rows ?? [];
    } catch {
      return [];
    }
  });

export const saveOrderBookSnapshot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      symbol: z.string().min(1).max(20),
      timestamp: z.number(),
      bestBid: z.number(),
      bestAsk: z.number(),
      spread: z.number(),
      spreadPct: z.number(),
      midPrice: z.number(),
      bids: z.array(z.object({ price: z.number(), volume: z.number(), total: z.number() })),
      asks: z.array(z.object({ price: z.number(), volume: z.number(), total: z.number() })),
      obi: z.number().optional(),
      zScore: z.number().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!supabase) return { success: false };
    const { error } = await supabase.from("binance_order_book_snapshots").insert({
      symbol: data.symbol,
      timestamp: data.timestamp,
      best_bid: data.bestBid,
      best_ask: data.bestAsk,
      spread: data.spread,
      spread_pct: data.spreadPct,
      mid_price: data.midPrice,
      bids: JSON.stringify(data.bids),
      asks: JSON.stringify(data.asks),
      obi: data.obi ?? null,
      z_score: data.zScore ?? null,
    });
    if (error) throw new Error(`Supabase insert OB snapshot error: ${error.message}`);
    return { success: true };
  });

export const getOrderBookHistory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      symbol: z.string().min(1).max(20),
      limit: z.number().default(200),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!supabase) return [];
    const { data: rows, error } = await supabase
      .from("binance_order_book_snapshots")
      .select("*")
      .eq("symbol", data.symbol)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(`Supabase select OB history error: ${error.message}`);
    return rows;
  });
