"use client";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BinancePairsPanel } from "./BinancePairsPanel";
import { BinanceAccountPanel } from "./BinanceAccountPanel";
import { EstrategiasPanel } from "./cripto/EstrategiasPanel";
import { PairsCryptoPanel } from "./cripto/PairsCryptoPanel";

export const VALID_SUBTABS = ["pares", "binance", "cuenta", "backtesting"] as const;

export function CriptoTab({ initialSubTab }: { initialSubTab?: string } = {}) {
  const [subTab, setSubTab] = useState<(typeof VALID_SUBTABS)[number]>(() =>
    (VALID_SUBTABS as readonly string[]).includes(initialSubTab ?? "") ? (initialSubTab as (typeof VALID_SUBTABS)[number]) : "pares"
  );

  return (
    <Tabs value={subTab} onValueChange={(v) => setSubTab(v as (typeof VALID_SUBTABS)[number])} className="w-full">
      <TabsList className="flex flex-wrap h-auto gap-1 p-1 bg-muted/20 rounded-lg w-full justify-start">
        <TabsTrigger
          value="pares"
          className="text-[14px] px-4 py-2 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
        >
          Pares Binance
        </TabsTrigger>
        <TabsTrigger
          value="binance"
          className="text-[14px] px-4 py-2 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
        >
          Binance
        </TabsTrigger>
        <TabsTrigger
          value="cuenta"
          className="text-[14px] px-4 py-2 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
        >
          Cuenta
        </TabsTrigger>
        <TabsTrigger
          value="backtesting"
          className="text-[14px] px-4 py-2 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
        >
          Backtesting
        </TabsTrigger>
      </TabsList>
      <TabsContent value="pares" className="mt-4">
        <BinancePairsPanel />
      </TabsContent>
      <TabsContent value="binance" className="mt-4">
        <BinanceAccountPanel />
      </TabsContent>
      <TabsContent value="cuenta" className="mt-4">
        <BinanceAccountPanel />
      </TabsContent>
      <TabsContent value="backtesting" className="mt-4">
        <PairsCryptoPanel />
      </TabsContent>
    </Tabs>
  );
}
