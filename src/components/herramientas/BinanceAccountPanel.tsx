// @ts-nocheck
"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import {
  fetchBinanceAccount,
  fetchBinanceBalances,
  fetchBinanceOpenOrders,
  fetchBinanceTrades,
} from "@/lib/binance.functions";
import type { BinanceOrder, BinanceTrade } from "@/lib/binance-auth";

function fmt(n: string | number | null | undefined, dp = 4) {
  if (n == null) return "\u2014";
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (!Number.isFinite(v)) return "\u2014";
  return v.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function BinanceAccountPanel() {
  const [account, setAccount] = useState<{
    makerCommission: number;
    takerCommission: number;
    canTrade: boolean;
    canWithdraw: boolean;
    canDeposit: boolean;
  } | null>(null);
  const [balances, setBalances] = useState<{ asset: string; free: string; locked: string }[]>([]);
  const [orders, setOrders] = useState<BinanceOrder[]>([]);
  const [trades, setTrades] = useState<BinanceTrade[]>([]);
  const [orderSymbol, setOrderSymbol] = useState("");
  const [tradeSymbol, setTradeSymbol] = useState("BTCUSDT");

  const fetchAccount = useServerFn(fetchBinanceAccount);
  const fetchBalances = useServerFn(fetchBinanceBalances);
  const fetchOrders = useServerFn(fetchBinanceOpenOrders);
  const fetchTrades = useServerFn(fetchBinanceTrades);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [acc, bal] = await Promise.all([fetchAccount(), fetchBalances()]);
      setAccount(acc);
      setBalances(bal);
    } catch (e: any) {
      setError(e.message || "Error al conectar con Binance");
    }
    setLoading(false);
  };

  const loadOrders = async () => {
    try {
      const result = await fetchOrders({ data: { symbol: orderSymbol || undefined } });
      setOrders(result);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const loadTrades = async () => {
    if (!tradeSymbol) return;
    try {
      const result = await fetchTrades({ data: { symbol: tradeSymbol, limit: 20 } });
      setTrades(result);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const totalUsdt = balances
    .filter((b) => b.asset === "USDT")
    .reduce((sum, b) => sum + parseFloat(b.free) + parseFloat(b.locked), 0);

  return (
    <div className="space-y-4">
      <Card className="bg-surface border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-foreground text-sm font-medium">
              Cuenta Binance Testnet
            </CardTitle>
            {account && (
              <Button
                variant="outline"
                size="sm"
                onClick={loadAll}
                disabled={loading}
                className="h-7 text-[10px] border-border/60"
              >
                {loading ? "Cargando..." : "Actualizar"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
              {error}
            </div>
          )}
          {!account && !loading && (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-[11px] text-muted-foreground text-center">
                Conectá con tu cuenta demo de Binance para ver balances, órdenes y trades.
              </p>
              <Button
                onClick={loadAll}
                className="bg-primary text-primary-foreground font-semibold hover:bg-primary/80 h-8 text-xs"
              >
                Conectar con Binance
              </Button>
            </div>
          )}
          {loading && (
            <div className="flex justify-center py-6">
              <p className="text-[11px] text-muted-foreground">Conectando con Binance Testnet...</p>
            </div>
          )}
          {account && (
            <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4 text-[11px] font-mono">
              <div>
                <span className="text-muted-foreground">Maker</span>
                <br />
                {fmt(account.makerCommission * 100, 3)}%
              </div>
              <div>
                <span className="text-muted-foreground">Taker</span>
                <br />
                {fmt(account.takerCommission * 100, 3)}%
              </div>
              <div>
                <span className="text-muted-foreground">Trade</span>
                <br />
                {account.canTrade ? "✓" : "✗"}
              </div>
              <div>
                <span className="text-muted-foreground">USDT Libre</span>
                <br />
                {fmt(totalUsdt, 2)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-surface border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Balances
          </CardTitle>
        </CardHeader>
        <CardContent>
          {balances.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">No hay balances con saldo</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/40">
                    <th className="text-left py-1 pr-3">Asset</th>
                    <th className="text-right py-1 pr-3">Libre</th>
                    <th className="text-right py-1">Bloqueado</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={b.asset} className="border-b border-border/20">
                      <td className="py-1 pr-3 font-medium">{b.asset}</td>
                      <td className="text-right py-1 pr-3">{fmt(b.free, 4)}</td>
                      <td className="text-right py-1">{fmt(b.locked, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-surface border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Órdenes Abiertas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            <Input
              value={orderSymbol}
              onChange={(e) => setOrderSymbol(e.target.value.toUpperCase())}
              placeholder="Symbol (opcional)"
              className="h-7 text-[11px] bg-background/40 border-border/60 font-mono w-40"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={loadOrders}
              className="h-7 text-[10px] border-border/60"
            >
              Buscar
            </Button>
          </div>
          {orders.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">Sin órdenes abiertas</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/40">
                    <th className="text-left py-1 pr-2">Symbol</th>
                    <th className="text-left py-1 pr-2">Side</th>
                    <th className="text-left py-1 pr-2">Type</th>
                    <th className="text-right py-1 pr-2">Precio</th>
                    <th className="text-right py-1 pr-2">Cant.</th>
                    <th className="text-right py-1">Ejec.</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.orderId} className="border-b border-border/20">
                      <td className="py-1 pr-2">{o.symbol}</td>
                      <td
                        className={`py-1 pr-2 ${o.side === "BUY" ? "text-green-400" : "text-red-400"}`}
                      >
                        {o.side}
                      </td>
                      <td className="py-1 pr-2">{o.type}</td>
                      <td className="text-right py-1 pr-2">{fmt(o.price)}</td>
                      <td className="text-right py-1 pr-2">{fmt(o.origQty)}</td>
                      <td className="text-right py-1">{fmt(o.executedQty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-surface border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Trades Recientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            <Input
              value={tradeSymbol}
              onChange={(e) => setTradeSymbol(e.target.value.toUpperCase())}
              placeholder="Symbol"
              className="h-7 text-[11px] bg-background/40 border-border/60 font-mono w-40"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={loadTrades}
              className="h-7 text-[10px] border-border/60"
            >
              Buscar
            </Button>
          </div>
          {trades.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">Sin trades recientes</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/40">
                    <th className="text-left py-1 pr-2">Hora</th>
                    <th className="text-left py-1 pr-2">Side</th>
                    <th className="text-right py-1 pr-2">Precio</th>
                    <th className="text-right py-1 pr-2">Cant.</th>
                    <th className="text-right py-1 pr-2">Total</th>
                    <th className="text-right py-1">Comisión</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => (
                    <tr key={t.id} className="border-b border-border/20">
                      <td className="py-1 pr-2">{new Date(t.time).toLocaleTimeString("es-AR")}</td>
                      <td className={`py-1 pr-2 ${t.isBuyer ? "text-green-400" : "text-red-400"}`}>
                        {t.isBuyer ? "BUY" : "SELL"}
                      </td>
                      <td className="text-right py-1 pr-2">{fmt(t.price)}</td>
                      <td className="text-right py-1 pr-2">{fmt(t.qty)}</td>
                      <td className="text-right py-1 pr-2">{fmt(t.quoteQty, 2)}</td>
                      <td className="text-right py-1">
                        {fmt(t.commission, 6)} {t.commissionAsset}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
