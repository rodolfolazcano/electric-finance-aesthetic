"use client";
import { useEffect, useState } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { BinancePairsPanel } from "./BinancePairsPanel";
import { BinanceAccountPanel } from "./BinanceAccountPanel";
import { EstrategiasPanel } from "./cripto/EstrategiasPanel";
import { PairsCryptoPanel } from "./cripto/PairsCryptoPanel";
import { QuantLabPanel } from "./cripto/QuantLabPanel";
import { HftTradingPanel } from "./cripto/HftTradingPanel";
import { MaeMfePanel } from "./cripto/MaeMfePanel";
import { ScannerPanel } from "./cripto/ScannerPanel";
import { MtfPanel } from "./cripto/MtfPanel";
import { CapmCryptoPanel } from "./cripto/CapmCryptoPanel";
import { ReversalPanel } from "./cripto/ReversalPanel";

export const VALID_SUBTABS = [
  "hft",
  "pares",
  "estrategias",
  "mae-mfe",
  "pairs",
  "quant-lab",
  "scanner",
  "mtf",
  "capm",
  "reversal",
  "cuenta",
] as const;

type SubTab = (typeof VALID_SUBTABS)[number];

const LEGACY_MAP: Record<string, SubTab> = {
  binance: "cuenta",
  backtesting: "pairs",
};

function Placeholder({ label }: { label: string }) {
  return (
    <Card className="border-border/40 bg-background/30">
      <CardContent className="p-8 text-center text-sm text-muted-foreground">
        {label} — próximamente. Esta sección se habilitará en la siguiente fase.
      </CardContent>
    </Card>
  );
}

export function CriptoTab({
  initialSubTab,
  onSubTabChange,
}: {
  initialSubTab?: string;
  onSubTabChange?: (subTab: string) => void;
} = {}) {
  const resolve = (v?: string): SubTab => {
    if (!v) return "pares";
    const mapped = LEGACY_MAP[v] ?? v;
    return (VALID_SUBTABS as readonly string[]).includes(mapped) ? (mapped as SubTab) : "pares";
  };

  const [subTab, setSubTab] = useState<SubTab>(() => resolve(initialSubTab));

  useEffect(() => {
    if (initialSubTab == null) return;
    const r = resolve(initialSubTab);
    if (r !== subTab) setSubTab(r);
  }, [initialSubTab]);

  const handleChange = (v: string) => {
    const next = v as SubTab;
    setSubTab(next);
    onSubTabChange?.(next);
  };

  return (
    <Tabs value={subTab} onValueChange={handleChange} className="w-full">
      <TabsContent value="hft" className="mt-4">
        <HftTradingPanel />
      </TabsContent>

      <TabsContent value="pares" className="mt-4">
        <BinancePairsPanel />
      </TabsContent>

      <TabsContent value="estrategias" className="mt-4">
        <EstrategiasPanel />
      </TabsContent>

      <TabsContent value="mae-mfe" className="mt-4">
        <MaeMfePanel />
      </TabsContent>

      <TabsContent value="pairs" className="mt-4">
        <PairsCryptoPanel />
      </TabsContent>

      <TabsContent value="quant-lab" className="mt-4">
        <QuantLabPanel />
      </TabsContent>

      <TabsContent value="scanner" className="mt-4">
        <ScannerPanel />
      </TabsContent>

      <TabsContent value="mtf" className="mt-4">
        <MtfPanel />
      </TabsContent>

      <TabsContent value="capm" className="mt-4">
        <CapmCryptoPanel />
      </TabsContent>

      <TabsContent value="reversal" className="mt-4">
        <ReversalPanel />
      </TabsContent>

      <TabsContent value="cuenta" className="mt-4">
        <BinanceAccountPanel />
      </TabsContent>
    </Tabs>
  );
}
