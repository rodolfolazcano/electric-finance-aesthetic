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
      <TabsList className="flex flex-wrap h-auto gap-1 p-1 bg-muted/20 rounded-lg w-full justify-start">
        <TabsTrigger
          value="pares"
          className="text-[14px] px-4 py-2 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
        >
          Pares Binance
        </TabsTrigger>
        <TabsTrigger
          value="arbitraje"
          className="text-[14px] px-4 py-2 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
        >
          Arbitraje P2P
        </TabsTrigger>
        <TabsTrigger
          value="cuenta"
          className="text-[14px] px-4 py-2 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
        >
          Cuenta Binance
        </TabsTrigger>
        <TabsTrigger
          value="estrategias"
          className="text-[14px] px-4 py-2 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
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
