// @ts-nocheck
"use client";
import { useMemo, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCriptoYaPolling } from "@/hooks/useCriptoYaPolling";
import { calcularSpreadArbitraje } from "@/lib/cripto.math";
import type {
  ArbitrajeOportunidad,
  SpreadHistoryPoint,
  ExchangeCotizacion,
} from "@/lib/cripto.types";
import { ExchangeCompareTable } from "./ExchangeCompareTable";
import { ArbitrajeCalculadora } from "./ArbitrajeCalculadora";
import { SpreadHistoryChart } from "./SpreadHistoryChart";

function fmtNum(n: number | null | undefined, dp = 2) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function ArbitrajeP2PPanel() {
  const { dolar, usdtExchanges, loading, lastUpdate } = useCriptoYaPolling(30000);
  const spreadHistoryRef = useRef<SpreadHistoryPoint[]>([]);

  // Real fee for a given exchange (buy side: totalAsk/ask - 1, sell side: 1 - totalBid/bid)
  function getFee(exchange: string, side: "buy" | "sell"): number {
    const ex = usdtExchanges?.[exchange];
    if (!ex || !ex.totalAsk || !ex.totalBid) return 0.001;
    if (side === "buy") return Math.max(0, (ex.totalAsk - ex.ask) / ex.ask);
    return Math.max(0, (ex.bid - ex.totalBid) / ex.bid);
  }

  // Construir lista de exchanges con fees reales
  const exchangeList = useMemo(() => {
    if (!usdtExchanges) return [];
    return Object.entries(usdtExchanges)
      .filter(([_, v]) => v.bid > 0 && v.ask > 0)
      .map(([name, v]) => ({
        exchange: name,
        compra: v.ask,
        venta: v.bid,
        spread: 0,
        fee: 0,
        spreadNeto: 0,
      }));
  }, [usdtExchanges]);

  // Oportunidades de arbitraje
  const oportunidades = useMemo((): ArbitrajeOportunidad[] => {
    const result: ArbitrajeOportunidad[] = [];
    if (!dolar || !usdtExchanges) return result;

    const entries = Object.entries(usdtExchanges).filter(([_, v]) => v.bid > 0 && v.ask > 0);
    const mejorCompra = entries.reduce(
      (best, curr) => (curr[1].ask < best[1].ask ? curr : best),
      entries[0],
    );
    const mejorVenta = entries.reduce(
      (best, curr) => (curr[1].bid > best[1].bid ? curr : best),
      entries[0],
    );

    if (mejorCompra && mejorVenta) {
      const feeBuy = getFee(mejorCompra[0], "buy");
      const feeSell = getFee(mejorVenta[0], "sell");
      const arb = calcularSpreadArbitraje(mejorCompra[1].ask, mejorVenta[1].bid, feeBuy, feeSell);
      result.push({
        tipo: "entre-exchanges",
        descripcion: `Comprar en ${mejorCompra[0]} y vender en ${mejorVenta[0]}`,
        spreadBruto: arb.bruto,
        costos: feeBuy + feeSell,
        spreadNeto: arb.neto,
        viable: arb.viable,
        exchangeCompra: mejorCompra[0],
        exchangeVenta: mejorVenta[0],
        precioCompra: mejorCompra[1].ask,
        precioVenta: mejorVenta[1].bid,
      });
    }

    if (dolar.blue) {
      const mejorVentaUsdt = entries.reduce(
        (best, curr) => (curr[1].bid > best[1].bid ? curr : best),
        entries[0],
      );
      if (mejorVentaUsdt) {
        const feeSell = getFee(mejorVentaUsdt[0], "sell");
        const arb = calcularSpreadArbitraje(dolar.blue.compra, mejorVentaUsdt[1].bid, 0, feeSell);
        result.push({
          tipo: "usdt-vs-blue",
          descripcion: "Comprar USD blue, vender USDT",
          spreadBruto: arb.bruto,
          costos: feeSell,
          spreadNeto: arb.neto,
          viable: arb.viable,
          precioCompra: dolar.blue.compra,
          precioVenta: mejorVentaUsdt[1].bid,
        });
      }
    }

    if (dolar.mep > 0) {
      const mejorVentaUsdt = entries.reduce(
        (best, curr) => (curr[1].bid > best[1].bid ? curr : best),
        entries[0],
      );
      if (mejorVentaUsdt) {
        const feeSell = getFee(mejorVentaUsdt[0], "sell");
        const arb = calcularSpreadArbitraje(dolar.mep, mejorVentaUsdt[1].bid, 0, feeSell);
        result.push({
          tipo: "usdt-vs-mep",
          descripcion: "Comprar MEP, vender USDT",
          spreadBruto: arb.bruto,
          costos: feeSell,
          spreadNeto: arb.neto,
          viable: arb.viable,
          precioCompra: dolar.mep,
          precioVenta: mejorVentaUsdt[1].bid,
        });
      }
    }

    if (dolar.ccl > 0) {
      const mejorVentaUsdt = entries.reduce(
        (best, curr) => (curr[1].bid > best[1].bid ? curr : best),
        entries[0],
      );
      if (mejorVentaUsdt) {
        const feeSell = getFee(mejorVentaUsdt[0], "sell");
        const arb = calcularSpreadArbitraje(dolar.ccl, mejorVentaUsdt[1].bid, 0, feeSell);
        result.push({
          tipo: "usdt-vs-ccl",
          descripcion: "Comprar CCL, vender USDT",
          spreadBruto: arb.bruto,
          costos: feeSell,
          spreadNeto: arb.neto,
          viable: arb.viable,
          precioCompra: dolar.ccl,
          precioVenta: mejorVentaUsdt[1].bid,
        });
      }
    }

    return result;
  }, [dolar, usdtExchanges]);

  // Acumular histórico de spreads
  useEffect(() => {
    if (oportunidades.length > 0) {
      const usdtBlue = oportunidades.find((o) => o.tipo === "usdt-vs-blue")?.spreadNeto ?? null;
      const usdtMep = oportunidades.find((o) => o.tipo === "usdt-vs-mep")?.spreadNeto ?? null;
      const usdtCcl = oportunidades.find((o) => o.tipo === "usdt-vs-ccl")?.spreadNeto ?? null;
      spreadHistoryRef.current.push({ timestamp: Date.now(), usdtBlue, usdtMep, usdtCcl });
      if (spreadHistoryRef.current.length > 240) spreadHistoryRef.current.shift();
    }
  }, [oportunidades]);

  // Mejor oferta
  const mejorCompra = useMemo(() => {
    if (!usdtExchanges) return null;
    const entries = Object.entries(usdtExchanges).filter(([_, v]) => v.ask > 0);
    return entries.reduce((best, curr) => (curr[1].ask < best[1].ask ? curr : best), entries[0]);
  }, [usdtExchanges]);

  const mejorVenta = useMemo(() => {
    if (!usdtExchanges) return null;
    const entries = Object.entries(usdtExchanges).filter(([_, v]) => v.bid > 0);
    return entries.reduce((best, curr) => (curr[1].bid > best[1].bid ? curr : best), entries[0]);
  }, [usdtExchanges]);

  const spreadMaximo = useMemo(() => {
    if (!mejorCompra || !mejorVenta) return null;
    return ((mejorVenta[1].bid - mejorCompra[1].ask) / mejorCompra[1].ask) * 100;
  }, [mejorCompra, mejorVenta]);

  const [lastUpdateStr, setLastUpdateStr] = useState("");

  useEffect(() => {
    if (!lastUpdate) return;
    const tick = () => setLastUpdateStr(`hace ${Math.round((Date.now() - lastUpdate) / 1000)}s`);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastUpdate]);

  return (
    <div className="space-y-4">
      {/* Resumen cotizaciones — horizontal DF */}
      <Card className="bg-surface border-border/60">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="mono text-sm font-medium">
              USDT/ARS — Mejores cotizaciones
            </CardTitle>
            <span className="text-[13px] text-muted-foreground">
              {lastUpdate ? lastUpdateStr : ""}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando cotizaciones...</p>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="mono w-full text-[14px]">
                <thead>
                  <tr className="border-b border-border/40 text-[13px] text-muted-foreground uppercase tracking-wider">
                    <th className="px-3 py-1.5 text-left">Indicador</th>
                    <th className="px-3 py-1.5 text-right">Valor</th>
                    <th className="px-3 py-1.5 text-right">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/20">
                    <td className="px-3 py-1.5 text-muted-foreground">Compra más barata</td>
                    <td className="px-3 py-1.5 text-right font-medium text-green-400">
                      {mejorCompra ? `$${fmtNum(mejorCompra[1].ask)}` : "\u2014"}
                    </td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground">
                      {mejorCompra ? mejorCompra[0] : ""}
                    </td>
                  </tr>
                  <tr className="border-b border-border/20">
                    <td className="px-3 py-1.5 text-muted-foreground">Venta más cara</td>
                    <td className="px-3 py-1.5 text-right font-medium text-red-400">
                      {mejorVenta ? `$${fmtNum(mejorVenta[1].bid)}` : "\u2014"}
                    </td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground">
                      {mejorVenta ? mejorVenta[0] : ""}
                    </td>
                  </tr>
                  <tr className="border-b border-border/20">
                    <td className="px-3 py-1.5 text-muted-foreground">Spread máximo</td>
                    <td
                      className={`px-3 py-1.5 text-right font-medium ${(spreadMaximo ?? 0) > 0.5 ? "text-green-400" : "text-yellow-400"}`}
                    >
                      {spreadMaximo != null ? `${fmtNum(spreadMaximo, 2)}%` : "\u2014"}
                      {(spreadMaximo ?? 0) > 0.5 && <span className="ml-1"> VIABLE</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground">
                      {mejorCompra && mejorVenta ? `${mejorCompra[0]} → ${mejorVenta[0]}` : ""}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-muted-foreground">Blue</td>
                    <td className="px-3 py-1.5 text-right font-medium">
                      {dolar?.blue
                        ? `$${fmtNum(dolar.blue.compra)} / $${fmtNum(dolar.blue.venta)}`
                        : "\u2014"}
                    </td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground">compra / venta</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Oportunidades de arbitraje */}
      {oportunidades.length > 0 && (
        <Card className="bg-surface border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
              Oportunidades de Arbitraje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {oportunidades.map((o) => (
                <div
                  key={o.tipo}
                  className={`rounded-md border p-2 text-[14px] font-mono ${o.viable ? "border-green-500/30 bg-green-500/10" : "border-border/30 bg-background/40"}`}
                >
                  <div className="text-[13px] text-muted-foreground mb-1">{o.descripcion}</div>
                  <div className="flex justify-between">
                    <span>Bruto:</span>
                    <span className={o.spreadBruto > 0 ? "text-green-400" : "text-red-400"}>
                      {fmtNum(o.spreadBruto * 100, 2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Costos:</span>
                    <span className="text-yellow-400">{fmtNum(o.costos * 100, 2)}%</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Neto:</span>
                    <span className={o.viable ? "text-green-400" : "text-red-400"}>
                      {fmtNum(o.spreadNeto * 100, 2)}%
                    </span>
                  </div>
                  {o.precioCompra && o.precioVenta && (
                    <div className="flex justify-between text-[13px] text-muted-foreground mt-1">
                      <span>
                        ${fmtNum(o.precioCompra)} → ${fmtNum(o.precioVenta)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calculadora de Arbitraje — full width, arriba del DF */}
      <Card className="bg-surface border-border/60">
        <CardContent className="p-4">
          <ArbitrajeCalculadora exchanges={exchangeList} usdtExchanges={usdtExchanges} />
        </CardContent>
      </Card>

      {/* Exchange comparison table — full width */}
      <Card className="bg-surface border-border/60">
        <CardContent className="p-4">
          <ExchangeCompareTable data={usdtExchanges} />
        </CardContent>
      </Card>

      {/* Spread history */}
      <Card className="bg-surface border-border/60">
        <CardContent className="p-4">
          <SpreadHistoryChart history={spreadHistoryRef.current} />
        </CardContent>
      </Card>

      {/* Panel comparación tipos de cambio */}
      {dolar && (
        <Card className="bg-surface border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
              Comparación Tipos de Cambio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 text-[14px] font-mono">
              <div className="rounded-md bg-background/40 border border-border/60 p-2">
                <div className="text-[13px] text-muted-foreground">Blue</div>
                <div>
                  ${fmtNum(dolar.blue.compra)} / ${fmtNum(dolar.blue.venta)}
                </div>
              </div>
              <div className="rounded-md bg-background/40 border border-border/60 p-2">
                <div className="text-[13px] text-muted-foreground">MEP</div>
                <div>${fmtNum(dolar.mep)}</div>
              </div>
              <div className="rounded-md bg-background/40 border border-border/60 p-2">
                <div className="text-[13px] text-muted-foreground">CCL</div>
                <div>${fmtNum(dolar.ccl)}</div>
              </div>
              <div className="rounded-md bg-background/40 border border-border/60 p-2">
                <div className="text-[13px] text-muted-foreground">Oficial</div>
                <div>
                  ${fmtNum(dolar.oficial.compra)} / ${fmtNum(dolar.oficial.venta)}
                </div>
              </div>
            </div>
            <div className="mt-2 space-y-1 text-[14px] font-mono">
              {oportunidades
                .filter((o) => o.tipo.startsWith("usdt-vs-"))
                .map((o) => (
                  <div
                    key={o.tipo}
                    className={`flex justify-between rounded-md px-2 py-1 ${o.viable ? "bg-green-500/10" : "bg-background/40"}`}
                  >
                    <span>
                      {o.tipo === "usdt-vs-blue"
                        ? "USDT vs Blue"
                        : o.tipo === "usdt-vs-mep"
                          ? "USDT vs MEP"
                          : "USDT vs CCL"}
                      :
                    </span>
                    <span className={o.viable ? "text-green-400" : "text-red-400"}>
                      {fmtNum(o.spreadNeto * 100, 2)}% {o.viable ? "" : ""}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
