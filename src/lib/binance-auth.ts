// @ts-nocheck
import { createHmac } from "node:crypto";

let timeOffset = 0;
let lastTimeSync = 0;

async function syncTime(baseUrl: string): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}/api/v3/time`);
    const { serverTime } = await res.json();
    timeOffset = serverTime - Date.now();
    lastTimeSync = Date.now();
  } catch {
    // fallback: usar reloj local
  }
}

function getBinanceConfig() {
  return {
    baseUrl: import.meta.env.VITE_BINANCE_BASE_URL || "https://testnet.binance.vision",
    apiKey: import.meta.env.VITE_BINANCE_API_KEY || "",
    secret: import.meta.env.VITE_BINANCE_SECRET || "",
  };
}

export function sign(queryString: string, secret: string): string {
  return createHmac("sha256", secret).update(queryString).digest("hex");
}

export async function signedRequest<T>(
  baseUrl: string,
  path: string,
  params: Record<string, string | number>,
  apiKey: string,
  secret: string,
  method: "GET" | "POST" | "DELETE" = "GET",
): Promise<T> {
  if (!apiKey || !secret) throw new Error("API credentials missing");
  if (!lastTimeSync || Date.now() - lastTimeSync > 60000) await syncTime(baseUrl);
  const timestamp = Date.now() + timeOffset;
  const queryObj = { ...params, timestamp, recvWindow: "5000" };
  const qs = new URLSearchParams(Object.entries(queryObj).map(([k, v]) => [k, String(v)])).toString();
  const signature = sign(qs, secret);
  const url = `${baseUrl}${path}?${qs}&signature=${signature}`;
  const res = await fetch(url, { method, headers: { "X-MBX-APIKEY": apiKey } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Binance ${method} ${path} ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const BINANCE_BASES = {
  spotTestnet: "https://testnet.binance.vision",
  futuresDemo: "https://demo-fapi.binance.com",
} as const;

export async function binanceSignedGet<T>(
  path: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const { baseUrl, apiKey, secret } = getBinanceConfig();

  if (!apiKey || !secret) {
    throw new Error(
      "Binance API credentials not configured. Set VITE_BINANCE_API_KEY and VITE_BINANCE_SECRET in .env.local",
    );
  }

  if (!lastTimeSync || Date.now() - lastTimeSync > 60000) {
    await syncTime(baseUrl);
  }

  const timestamp = Date.now() + timeOffset;
  const queryObj = { ...params, timestamp, recvWindow: "5000" };
  const queryString = new URLSearchParams(
    Object.entries(queryObj).map(([k, v]) => [k, String(v)]),
  ).toString();
  const signature = sign(queryString, secret);

  const url = `${baseUrl}${path}?${queryString}&signature=${signature}`;
  const res = await fetch(url, {
    headers: { "X-MBX-APIKEY": apiKey },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Binance API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export interface BinanceAccountInfo {
  makerCommission: number;
  takerCommission: number;
  buyerCommission: number;
  sellerCommission: number;
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  accountType: string;
  balances: BinanceBalance[];
}

export interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

export interface BinanceOrder {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  type: string;
  side: string;
  stopPrice: string;
  time: number;
  updateTime: number;
}

export interface BinanceTrade {
  id: number;
  symbol: string;
  orderId: number;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
  isMaker: boolean;
  isBestMatch: boolean;
}
