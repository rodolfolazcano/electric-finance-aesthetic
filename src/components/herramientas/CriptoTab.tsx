"use client";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const SUBTABS: { key: SubTab; label: string }[] = [
  { key: "hft", label: "HFT Bot" },
  { key: "pares", label: "Pares OBI" },
  { key: "estrategias", label: "BB+RSI" },
  { key: "mae-mfe", label: "MAE/MFE" },
  { key: "pairs", label: "Pairs" },
  { key: "quant-lab", label: "Quant Lab" },
  { key: "scanner", label: "Scanner" },
  { key: "mtf", label: "MTF" },
  { key: "capm", label: "CAPM" },
  { key: "reversal", label: "Reversal" },
  { key: "cuenta", label: "Cuenta" },
];

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
      {/* Tabs horizontales duplican el panel lateral — visibles solo en móvil (< lg) */}
      <TabsList
        className="flex flex-wrap h-auto gap-1 p-1 bg-muted/20 rounded-lg w-full justify-start lg:hidden"
        aria-label="Navegación cripto (móvil)"
      >
        {SUBTABS.map((t) => (
          <TabsTrigger
            key={t.key}
            value={t.key}
            className="text-[14px] px-4 py-2 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
          >
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

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
