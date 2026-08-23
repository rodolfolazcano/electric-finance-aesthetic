// @ts-nocheck
/**
 * HFT Execution Adapter — dual venue (spot testnet + futures demo)
 * Port de bot binance.py.py: órdenes nativas, filtros LOT/PRICE, GTX post-only, reduceOnly, OCO manual.
 * Todas las funciones son serverFns (firma HMAC server-side). Keys vienen de localStorage → args.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHmac } from "node:crypto";

const SPOT_BASE = "https://testnet.binance.vision";
const FUTURES_BASE = "https://demo-fapi.binance.com";

// ─── helpers firma ──────────────────────────────────────────────────────────
function sign(qs: string, secret: string): string {
  return createHmac("sha256", secret).update(qs).digest("hex");
}

async function getServerTime(base: string): Promise<number> {
  try {
    const r = await fetch(`${base}/fapi/v1/time`.replace("/fapi", base.includes("fapi") ? "/fapi" : "/api"));
    // fallback para spot
    const url = base.includes("fapi") ? `${base}/fapi/v1/time` : `${base}/api/v3/time`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const j: any = await res.json();
    return j.serverTime ?? Date.now();
  } catch {
    return Date.now();
  }
}

function formatByStep(value: number, step: number): string {
  if (!step || step <= 0) return value.toString();
  const prec = Math.max(0, Math.round(-Math.log10(step)));
  const floored = Math.floor(value / step) * step;
  // para qty usar floor, para price usar round
  return floored.toFixed(prec);
}
function formatPrice(value: number, tick: number): string {
  if (!tick || tick <= 0) return value.toFixed(2);
  const prec = Math.max(0, Math.round(-Math.log10(tick)));
  const rounded = Math.round(value / tick) * tick;
  return rounded.toFixed(prec);
}

// ─── Exchange filters (cacheada en memoria server, TTL 5min) ───────────────
let filtersCache: Record<string, { step: number; tick: number; ts: number }> = {};

async function getFilters(base: string, symbol: string, apiKey: string, apiSecret: string): Promise<{ step: number; tick: number }> {
  const key = `${base}:${symbol}`;
  const cached = filtersCache[key];
  if (cached && Date.now() - cached.ts < 300000) return { step: cached.step, tick: cached.tick };
  try {
    const path = base.includes("fapi") ? "/fapi/v1/exchangeInfo" : "/api/v3/exchangeInfo";
    // exchangeInfo es público, no necesita firma
    const url = `${base}${path}?symbol=${symbol.toUpperCase()}`;
    const r = await fetch(url);
    const j: any = await r.json();
    const s = (j.symbols ?? []).find((x: any) => x.symbol === symbol.toUpperCase());
    let step = 0.001, tick = 0.1;
    for (const f of s?.filters ?? []) {
      if (f.filterType === "LOT_SIZE") step = parseFloat(f.stepSize);
      if (f.filterType === "PRICE_FILTER") tick = parseFloat(f.tickSize);
    }
    filtersCache[key] = { step, tick, ts: Date.now() };
    return { step, tick };
  } catch {
    return { step: 0.001, tick: 0.1 };
  }
}

// ─── SPOT: commissions firmadas (fix del bug) ───────────────────────────────
export const fetchSpotCommissionsSigned = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ symbol: z.string(), apiKey: z.string().min(1), apiSecret: z.string().min(1) }).parse(i))
  .handler(async ({ data }): Promise<{ maker: number; taker: number }> => {
    const { symbol, apiKey, apiSecret } = data;
    try {
      const ts = await getServerTime(SPOT_BASE);
      const params: Record<string, string> = { symbol: symbol.toUpperCase(), timestamp: String(ts), recvWindow: "5000" };
      const qs = new URLSearchParams(params).toString();
      const sig = sign(qs, apiSecret);
      const url = `${SPOT_BASE}/api/v3/account?${qs}&signature=${sig}`;
      const r = await fetch(url, { headers: { "X-MBX-APIKEY": apiKey } });
      if (!r.ok) return { maker: 0.001, taker: 0.001 };
      const j: any = await r.json();
      // makerCommission/takerCommission vienen en basis points (ej 10 = 0.001)
      const maker = (j.makerCommission ?? 10) / 10000;
      const taker = (j.takerCommission ?? 10) / 10000;
      return { maker, taker };
    } catch {
      return { maker: 0.001, taker: 0.001 };
    }
  });

// ─── FUTURES: commissions ───────────────────────────────────────────────────
export const fetchFuturesCommissions = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ symbol: z.string(), apiKey: z.string().min(1), apiSecret: z.string().min(1) }).parse(i))
  .handler(async ({ data }): Promise<{ maker: number; taker: number }> => {
    const { symbol, apiKey, apiSecret } = data;
    try {
      const ts = await getServerTime(FUTURES_BASE);
      const params: Record<string, string> = { symbol: symbol.toUpperCase(), timestamp: String(ts), recvWindow: "5000" };
      const qs = new URLSearchParams(params).toString();
      const sig = sign(qs, apiSecret);
      const url = `${FUTURES_BASE}/fapi/v1/commissionRate?${qs}&signature=${sig}`;
      const r = await fetch(url, { headers: { "X-MBX-APIKEY": apiKey } });
      if (!r.ok) return { maker: 0.0002, taker: 0.0004 };
      const j: any = await r.json();
      return { maker: parseFloat(j.makerCommissionRate ?? "0.0002"), taker: parseFloat(j.takerCommissionRate ?? "0.0004") };
    } catch {
      return { maker: 0.0002, taker: 0.0004 };
    }
  });

// ─── FUTURES: configurar cuenta (hedge mode + leverage + margen cruzado) ────
export const configureFuturesAccount = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ symbol: z.string(), leverage: z.number().min(1).max(125).default(10), apiKey: z.string().min(1), apiSecret: z.string().min(1) }).parse(i))
  .handler(async ({ data }): Promise<{ hedge: string; leverage: string; margin: string }> => {
    const { symbol, leverage, apiKey, apiSecret } = data;
    const results: any = { hedge: "ok", leverage: "ok", margin: "ok" };
    try {
      let ts = await getServerTime(FUTURES_BASE);
      let qs = new URLSearchParams({ dualSidePosition: "true", timestamp: String(ts) }).toString();
      let sig = sign(qs, apiSecret);
      let r = await fetch(`${FUTURES_BASE}/fapi/v1/positionSide/dual?${qs}&signature=${sig}`, { method: "POST", headers: { "X-MBX-APIKEY": apiKey } });
      let j: any = await r.json().catch(() => ({}));
      if (j.code === -4059) results.hedge = "already";
      else if (j.code) results.hedge = j.msg;

      ts = await getServerTime(FUTURES_BASE);
      qs = new URLSearchParams({ symbol: symbol.toUpperCase(), leverage: String(leverage), timestamp: String(ts) }).toString();
      sig = sign(qs, apiSecret);
      r = await fetch(`${FUTURES_BASE}/fapi/v1/leverage?${qs}&signature=${sig}`, { method: "POST", headers: { "X-MBX-APIKEY": apiKey } });
      j = await r.json().catch(() => ({}));
      if (j.code) results.leverage = j.msg;

      ts = await getServerTime(FUTURES_BASE);
      qs = new URLSearchParams({ symbol: symbol.toUpperCase(), marginType: "CROSSED", timestamp: String(ts) }).toString();
      sig = sign(qs, apiSecret);
      r = await fetch(`${FUTURES_BASE}/fapi/v1/marginType?${qs}&signature=${sig}`, { method: "POST", headers: { "X-MBX-APIKEY": apiKey } });
      j = await r.json().catch(() => ({}));
      if (j.code === -4046) results.margin = "already";
      else if (j.code) results.margin = j.msg;
    } catch (e: any) {
      results.error = String(e?.message ?? e);
    }
    return results;
  });

// ─── FUTURES: colocar orden ─────────────────────────────────────────────────
export const placeFuturesOrder = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        symbol: z.string().min(1),
        side: z.enum(["BUY", "SELL"]),
        positionSide: z.enum(["LONG", "SHORT", "BOTH"]).default("BOTH"),
        type: z.enum(["MARKET", "LIMIT", "STOP_MARKET", "TAKE_PROFIT_MARKET"]),
        quantity: z.number().positive(),
        price: z.number().positive().optional(),
        stopPrice: z.number().positive().optional(),
        reduceOnly: z.boolean().optional(),
        apiKey: z.string().min(1),
        apiSecret: z.string().min(1),
      })
      .parse(i),
  )
  .handler(async ({ data }): Promise<{ orderId: number; status: string; avgPrice?: string; raw: any }> => {
    const { symbol, side, positionSide, type, quantity, price, stopPrice, reduceOnly, apiKey, apiSecret } = data;
    const { step, tick } = await getFilters(FUTURES_BASE, symbol, apiKey, apiSecret);
    const ts = await getServerTime(FUTURES_BASE);
    const params: Record<string, string> = {
      symbol: symbol.toUpperCase(),
      side,
      positionSide,
      type,
      quantity: formatByStep(quantity, step),
      timestamp: String(ts),
      recvWindow: "5000",
    };
    if (type === "LIMIT") {
      if (!price) throw new Error("price required for LIMIT");
      params.price = formatPrice(price, tick);
      params.timeInForce = "GTX"; // post-only maker
    }
    if (type === "STOP_MARKET" || type === "TAKE_PROFIT_MARKET") {
      if (!stopPrice) throw new Error("stopPrice required for STOP/TAKE_PROFIT_MARKET");
      params.stopPrice = formatPrice(stopPrice, tick);
      params.closePosition = "false";
    }
    if (reduceOnly) params.reduceOnly = "true";

    const qs = new URLSearchParams(params).toString();
    const sig = sign(qs, apiSecret);
    const url = `${FUTURES_BASE}/fapi/v1/order?${qs}&signature=${sig}`;
    const r = await fetch(url, { method: "POST", headers: { "X-MBX-APIKEY": apiKey } });
    const j: any = await r.json();
    if (!r.ok || j.code) throw new Error(`Futures order error: ${JSON.stringify(j)}`);
    return { orderId: j.orderId, status: j.status, avgPrice: j.avgPrice, raw: j };
  });

// ─── FUTURES: cancelar orden ────────────────────────────────────────────────
export const cancelFuturesOrder = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ symbol: z.string().min(1), orderId: z.number(), apiKey: z.string().min(1), apiSecret: z.string().min(1) }).parse(i))
  .handler(async ({ data }): Promise<{ msg: string }> => {
    const { symbol, orderId, apiKey, apiSecret } = data;
    const ts = await getServerTime(FUTURES_BASE);
    const params: Record<string, string> = { symbol: symbol.toUpperCase(), orderId: String(orderId), timestamp: String(ts), recvWindow: "5000" };
    const qs = new URLSearchParams(params).toString();
    const sig = sign(qs, apiSecret);
    const url = `${FUTURES_BASE}/fapi/v1/order?${qs}&signature=${sig}`;
    const r = await fetch(url, { method: "DELETE", headers: { "X-MBX-APIKEY": apiKey } });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok && j.code) throw new Error(`Cancel error: ${JSON.stringify(j)}`);
    return { msg: "ok" };
  });

// ─── FUTURES: posiciones abiertas ───────────────────────────────────────────
export const getFuturesPositionRisk = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ symbol: z.string().optional(), apiKey: z.string().min(1), apiSecret: z.string().min(1) }).parse(i))
  .handler(async ({ data }): Promise<any[]> => {
    const { symbol, apiKey, apiSecret } = data;
    const ts = await getServerTime(FUTURES_BASE);
    const params: Record<string, string> = { timestamp: String(ts), recvWindow: "5000" };
    if (symbol) params.symbol = symbol.toUpperCase();
    const qs = new URLSearchParams(params).toString();
    const sig = sign(qs, apiSecret);
    const url = `${FUTURES_BASE}/fapi/v2/positionRisk?${qs}&signature=${sig}`;
    const r = await fetch(url, { headers: { "X-MBX-APIKEY": apiKey } });
    if (!r.ok) throw new Error(`positionRisk error ${r.status}`);
    return (await r.json()) as any[];
  });

export const getFuturesOpenOrders = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ symbol: z.string().optional(), apiKey: z.string().min(1), apiSecret: z.string().min(1) }).parse(i))
  .handler(async ({ data }): Promise<any[]> => {
    const { symbol, apiKey, apiSecret } = data;
    const ts = await getServerTime(FUTURES_BASE);
    const params: Record<string, string> = { timestamp: String(ts), recvWindow: "5000" };
    if (symbol) params.symbol = symbol.toUpperCase();
    const qs = new URLSearchParams(params).toString();
    const sig = sign(qs, apiSecret);
    const url = `${FUTURES_BASE}/fapi/v1/openOrders?${qs}&signature=${sig}`;
    const r = await fetch(url, { headers: { "X-MBX-APIKEY": apiKey } });
    if (!r.ok) throw new Error(`openOrders error ${r.status}`);
    return (await r.json()) as any[];
  });

// ─── SPOT: OCO (para SL/TP nativos en spot) ─────────────────────────────────
export const placeSpotOco = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        symbol: z.string().min(1),
        side: z.enum(["BUY", "SELL"]),
        quantity: z.number().positive(),
        price: z.number().positive(), // limit maker
        stopPrice: z.number().positive(),
        stopLimitPrice: z.number().positive(),
        apiKey: z.string().min(1),
        apiSecret: z.string().min(1),
      })
      .parse(i),
  )
  .handler(async ({ data }): Promise<{ orderListId: number; raw: any }> => {
    const { symbol, side, quantity, price, stopPrice, stopLimitPrice, apiKey, apiSecret } = data;
    const { step, tick } = await getFilters(SPOT_BASE, symbol, apiKey, apiSecret);
    const ts = await getServerTime(SPOT_BASE);
    const params: Record<string, string> = {
      symbol: symbol.toUpperCase(),
      side,
      quantity: formatByStep(quantity, step),
      price: formatPrice(price, tick),
      stopPrice: formatPrice(stopPrice, tick),
      stopLimitPrice: formatPrice(stopLimitPrice, tick),
      stopLimitTimeInForce: "GTC",
      timestamp: String(ts),
      recvWindow: "5000",
    };
    const qs = new URLSearchParams(params).toString();
    const sig = sign(qs, apiSecret);
    const url = `${SPOT_BASE}/api/v3/order/oco?${qs}&signature=${sig}`;
    const r = await fetch(url, { method: "POST", headers: { "X-MBX-APIKEY": apiKey } });
    const j: any = await r.json();
    if (!r.ok || j.code) throw new Error(`OCO error: ${JSON.stringify(j)}`);
    return { orderListId: j.orderListId, raw: j };
  });

// ─── Kill switch: cancela todo + cierra posición a mercado ──────────────────
export const killSwitchFutures = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ symbol: z.string().min(1), apiKey: z.string().min(1), apiSecret: z.string().min(1) }).parse(i))
  .handler(async ({ data }): Promise<{ canceled: number; closed: boolean }> => {
    const { symbol, apiKey, apiSecret } = data;
    // 1. cancelar abiertas
    let canceled = 0;
    try {
      const open = await getFuturesOpenOrders({ data: { symbol, apiKey, apiSecret } } as any).then((r: any) => r);
      // Nota: getFuturesOpenOrders es serverFn, no se puede llamar directo así en handler; hacerlo vía fetch manual
    } catch {}
    // fetch manual para no anidar serverFns
    try {
      const ts = await getServerTime(FUTURES_BASE);
      const qs = new URLSearchParams({ symbol: symbol.toUpperCase(), timestamp: String(ts), recvWindow: "5000" }).toString();
      const sig = sign(qs, apiSecret);
      const r = await fetch(`${FUTURES_BASE}/fapi/v1/openOrders?${qs}&signature=${sig}`, { headers: { "X-MBX-APIKEY": apiKey } });
      if (r.ok) {
        const orders: any[] = await r.json();
        for (const o of orders) {
          try {
            const ts2 = await getServerTime(FUTURES_BASE);
            const q2 = new URLSearchParams({ symbol: symbol.toUpperCase(), orderId: String(o.orderId), timestamp: String(ts2), recvWindow: "5000" }).toString();
            const s2 = sign(q2, apiSecret);
            await fetch(`${FUTURES_BASE}/fapi/v1/order?${q2}&signature=${s2}`, { method: "DELETE", headers: { "X-MBX-APIKEY": apiKey } });
            canceled++;
          } catch {}
        }
      }
    } catch {}
    // 2. cerrar posición a mercado (si existe)
    let closed = false;
    try {
      const ts = await getServerTime(FUTURES_BASE);
      const qs = new URLSearchParams({ symbol: symbol.toUpperCase(), timestamp: String(ts), recvWindow: "5000" }).toString();
      const sig = sign(qs, apiSecret);
      const r = await fetch(`${FUTURES_BASE}/fapi/v2/positionRisk?${qs}&signature=${sig}`, { headers: { "X-MBX-APIKEY": apiKey } });
      if (r.ok) {
        const pos: any[] = await r.json();
        for (const p of pos) {
          const amt = parseFloat(p.positionAmt ?? "0");
          if (Math.abs(amt) > 0) {
            const side: "BUY" | "SELL" = amt > 0 ? "SELL" : "BUY";
            const qty = Math.abs(amt);
            const pSide = amt > 0 ? "LONG" : "SHORT";
            const ts2 = await getServerTime(FUTURES_BASE);
            const q2: Record<string, string> = {
              symbol: symbol.toUpperCase(),
              side,
              positionSide: pSide,
              type: "MARKET",
              quantity: qty.toString(),
              timestamp: String(ts2),
              recvWindow: "5000",
            };
            const qs2 = new URLSearchParams(q2).toString();
            const s2 = sign(qs2, apiSecret);
            const rr = await fetch(`${FUTURES_BASE}/fapi/v1/order?${qs2}&signature=${s2}`, { method: "POST", headers: { "X-MBX-APIKEY": apiKey } });
            if (rr.ok) closed = true;
          }
        }
      }
    } catch {}
    return { canceled, closed };
  });
