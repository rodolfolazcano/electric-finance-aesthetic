"use client";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BinancePairsPanel } from "./BinancePairsPanel";
import { ArbitrajeP2PPanel } from "./ArbitrajeP2PPanel";
import { BinanceAccountPanel } from "./BinanceAccountPanel";
import { EstrategiasPanel } from "./cripto/EstrategiasPanel";

export function CriptoTab() {
  const [subTab, setSubTab] = useState("pares");

  return (
    <Tabs value={subTab} onValueChange={setSubTab} className="w-full">
      <TabsList className="w-full justify-start gap-0 rounded-none border-b border-border/60 bg-transparent p-0">
        <TabsTrigger
          value="pares"
          className="relative rounded-none border-b-2 border-transparent px-4 py-2 text-xs font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
        >
          Pares Binance
        </TabsTrigger>
        <TabsTrigger
          value="arbitraje"
          className="relative rounded-none border-b-2 border-transparent px-4 py-2 text-xs font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
        >
          Arbitraje P2P
        </TabsTrigger>
        <TabsTrigger
          value="cuenta"
          className="relative rounded-none border-b-2 border-transparent px-4 py-2 text-xs font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
        >
          Cuenta Binance
        </TabsTrigger>
        <TabsTrigger
          value="estrategias"
          className="relative rounded-none border-b-2 border-transparent px-4 py-2 text-xs font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
        >
          Estrategias
        </TabsTrigger>
      </TabsList>
      <TabsContent value="pares" className="mt-4">
        <BinancePairsPanel />
      </TabsContent>
      <TabsContent value="arbitraje" className="mt-4">
        <ArbitrajeP2PPanel />
      </TabsContent>
      <TabsContent value="cuenta" className="mt-4">
        <BinanceAccountPanel />
      </TabsContent>
      <TabsContent value="estrategias" className="mt-4">
        <EstrategiasPanel />
      </TabsContent>
    </Tabs>
  );
}
