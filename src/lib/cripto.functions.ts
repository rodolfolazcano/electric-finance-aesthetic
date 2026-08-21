// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHmac } from "node:crypto";
import type { Kline } from "./cripto.types";

export const fetchBinanceKlines = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        symbol: z.string().min(1).max(20),
        interval: z.string().default("5m"),
        limit: z.number().default(50),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<Kline[]> => {
    const { symbol, interval, limit } = data;
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance klines error: ${res.status}`);
    const raw: any[] = await res.json();
    return raw.map((k: any): Kline => ({
      openTime: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: k[6],
    }));
  });

export const fetchBinanceCommissions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ symbol: z.string().min(1).max(20) }).parse(input))
  .handler(async ({ data }): Promise<{ maker: number; taker: number }> => {
    try {
      const url = `https://api.binance.com/api/v3/account/commission?symbol=${data.symbol.toUpperCase()}`;
      const res = await fetch(url);
      if (!res.ok) return { maker: 0.001, taker: 0.001 };
      const json: any = await res.json();
      return {
        maker: parseFloat(json.makerCommission ?? "0.001"),
        taker: parseFloat(json.takerCommission ?? "0.001"),
      };
    } catch {
      return { maker: 0.001, taker: 0.001 };
    }
  });

export const placeBinanceOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        symbol: z.string().min(1).max(20),
        side: z.enum(["BUY", "SELL"]),
        type: z.enum(["MARKET", "LIMIT", "STOP_LOSS_LIMIT"]),
        quantity: z.number().positive(),
        price: z.number().positive().optional(),
        stopPrice: z.number().positive().optional(),
        apiKey: z.string().min(1),
        apiSecret: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ orderId: number; status: string }> => {
    const { symbol, side, type, quantity, price, stopPrice, apiKey, apiSecret } = data;
    const BASE_URL = "https://testnet.binance.vision";
    const params: Record<string, string> = {
      symbol: symbol.toUpperCase(),
      side,
      type,
      quantity: quantity.toString(),
      timestamp: Date.now().toString(),
      recvWindow: "5000",
    };
    if (type === "LIMIT" || type === "STOP_LOSS_LIMIT") {
      if (!price) throw new Error("Price required for LIMIT/STOP_LOSS_LIMIT orders");
      params.price = price.toString();
      params.timeInForce = "GTC";
    }
    if (type === "STOP_LOSS_LIMIT") {
      if (!stopPrice) throw new Error("stopPrice required for STOP_LOSS_LIMIT orders");
      params.stopPrice = stopPrice.toString();
    }
    const queryString = new URLSearchParams(params).toString();
    const signature = createHmac("sha256", apiSecret).update(queryString).digest("hex");
    const url = `${BASE_URL}/api/v3/order?${queryString}&signature=${signature}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "X-MBX-APIKEY": apiKey },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Binance order error ${res.status}: ${body}`);
    }
    const result: any = await res.json();
    return { orderId: result.orderId, status: result.status };
  });

export const fetchBinanceAccountBalance = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        apiKey: z.string().min(1),
        apiSecret: z.string().min(1),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      balances: { asset: string; free: string; locked: string }[];
      makerCommission: number;
      takerCommission: number;
      canTrade: boolean;
    }> => {
      const { apiKey, apiSecret } = data;
      const BASE_URL = "https://testnet.binance.vision";
      const params: Record<string, string> = {
        timestamp: Date.now().toString(),
        recvWindow: "5000",
      };
      const queryString = new URLSearchParams(params).toString();
      const signature = createHmac("sha256", apiSecret).update(queryString).digest("hex");
      const url = `${BASE_URL}/api/v3/account?${queryString}&signature=${signature}`;
      const res = await fetch(url, { headers: { "X-MBX-APIKEY": apiKey } });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Binance account error ${res.status}: ${body}`);
      }
      const json: any = await res.json();
      return {
        balances: json.balances ?? [],
        makerCommission: json.makerCommission ?? 0,
        takerCommission: json.takerCommission ?? 0,
        canTrade: json.canTrade ?? false,
      };
    },
  );
