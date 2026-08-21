// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CLIENT_ID = import.meta.env.VITE_DOCTA_CLIENT_ID || "";
const CLIENT_SECRET = import.meta.env.VITE_DOCTA_CLIENT_SECRET || "";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  const res = await fetch("https://api.doctacapital.com.ar/api/v1/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: "bonds:read cedears:read stocks:read",
    }),
  });
  if (!res.ok) throw new Error(`Docta auth error: ${res.status}`);
  const j = await res.json();
  cachedToken = { token: j.access_token, expiresAt: Date.now() + (j.expires_in - 60) * 1000 };
  return j.access_token;
}

export interface DoctaCashFlow {
  payment_date: string;
  capital: number;
  interest_amount: number;
  cash_flow: number;
  residual_value: number;
  interest_rate: number;
}

export interface DoctaBondCashFlows {
  ticker: string;
  data: DoctaCashFlow[];
  residual: number;
}

export const fetchBonosCashFlows = createServerFn({ method: "POST" })
  .validator(z.object({ ticker: z.string().min(1) }))
  .handler(async ({ data }): Promise<DoctaBondCashFlows | null> => {
    try {
      const token = await getToken();
      const res = await fetch(
        `https://api.doctacapital.com.ar/api/v1/bonds/analytics/${data.ticker}/cashflow?nominal_units=100`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      if (!res.ok) return null;
      const j = await res.json();
      return {
        ticker: j.ticker,
        data: j.data.map((d: any) => ({
          payment_date: d.payment_date,
          capital: d.capital,
          interest_amount: d.interest_amount,
          cash_flow: d.cash_flow,
          residual_value: d.residual_value,
          interest_rate: d.interest_rate,
        })),
        residual: j.data.length > 0 ? j.data[j.data.length - 1].residual_value : 0,
      };
    } catch {
      return null;
    }
  });

export interface DoctaPricerResult {
  ticker: string;
  clean_price: number;
  dirty_price: number;
  tir: number;
  tea: number;
  duration: number;
  residual_value: number;
  parity_price: number;
}

export const pricerBonosDocta = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ticker: z.string().min(1),
      price: z.number().positive(),
      operation_date: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<DoctaPricerResult | null> => {
    try {
      const token = await getToken();
      const body: any = {
        ticker: data.ticker,
        target: "price",
        value: data.price,
        settlement_entry: "24hs",
      };
      if (data.operation_date) body.operation_date = data.operation_date;
      const res = await fetch("https://api.doctacapital.com.ar/api/v1/analytics/bonds/pricer", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      if (!res.ok) return null;
      const j = await res.json();
      return {
        ticker: j.ticker ?? data.ticker,
        clean_price: j.clean_price,
        dirty_price: j.dirty_price,
        tir: j.tir,
        tea: j.tea,
        duration: j.duration,
        residual_value: j.residual_value,
        parity_price: j.parity_price,
      };
    } catch {
      return null;
    }
  });
