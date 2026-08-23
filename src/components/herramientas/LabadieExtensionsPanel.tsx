import { useMemo, useState } from "react";
import { mcPrecioOpcion } from "@/lib/labadie/mc-pricing";
import { twapSchedule, vwapSchedule, povSchedule } from "@/lib/labadie/execution-scheduling";
import { quotesExponencialABM, quotesExponencialOU } from "@/lib/labadie/market-making";
import { shootingMeanReverting } from "@/lib/labadie/validation";
import { jarqueBera, ci95Mean } from "@/lib/math/stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Panel demo de las extensiones Labadie (papers Fodra-Labadie, electronic-trading, memoire).
 * No se monta automáticamente en herramientas.tsx — importar manualmente donde se desee:
 *   import LabadieExtensionsPanel from "@/components/herramientas/LabadieExtensionsPanel"
 */
export default function LabadieExtensionsPanel() {
  const [sigma] = useState(0.2);
  const mc = useMemo(() => mcPrecioOpcion({ S: 100, K: 100, T: 1, r: 0.05, sigma, tipo: "call", nSims: 20000, seed: 42 }), [sigma]);
  const twap = useMemo(() => twapSchedule({ nSteps: 10 }), []);
  const vwap = useMemo(() => vwapSchedule({ nSteps: 10, volumeProfile: [5, 10, 15, 20, 25, 25, 20, 15, 10, 5] }), []);
  const pov = useMemo(() => povSchedule({ nSteps: 10, participation: 0.1 }), []);
  const qABM = useMemo(() => quotesExponencialABM({ s: 100, q: 0, t: 0, T: 1, k: 100, gamma: 0.1, eta: 0.0001, sigma: 0.05, b: 0 }), []);
  const qOU = useMemo(() => quotesExponencialOU({ s: 95, q: 1, t: 0, T: 1, k: 100, gamma: 0.1, eta: 0.0001, sigma: 0.05, a: 1, mu: 100 }), []);
  const shoot = useMemo(() => shootingMeanReverting({ N: 20, gamma: 0.3, lambda: 0.2 }), []);
  const jb = useMemo(() => jarqueBera(Array.from({ length: 200 }, () => Math.random())), []);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader><CardTitle>MC Pricing (GBM exacto + antitéticas + IC95%)</CardTitle></CardHeader>
        <CardContent>Precio MC: {mc.precio.toFixed(2)} — IC95% [{mc.ic95[0].toFixed(2)}, {mc.ic95[1].toFixed(2)}] — n={mc.nSims}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Scheduling TWAP / VWAP / PoV</CardTitle></CardHeader>
        <CardContent className="text-sm">TWAP(10) Σ={twap.reduce((s, x) => s + x.volume, 0).toFixed(3)} | VWAP U-shape: {vwap[0].volume.toFixed(3)}→{vwap[5].volume.toFixed(3)} | PoV 10% capacidad={pov.totalCapacity.toFixed(2)}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Market-Making Fodra-Labadie (cerrado)</CardTitle></CardHeader>
        <CardContent className="text-sm">ABM δAsk={qABM.deltaAsk.toFixed(4)} δBid={qABM.deltaBid.toFixed(4)} ψ*={qABM.psiStar.toFixed(4)} | OU E[S]={qOU.expectedS.toFixed(2)} ψ*={qOU.psiStar.toFixed(4)}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Shooting Mean-Reverting (memoire §5)</CardTitle></CardHeader>
        <CardContent className="text-sm">α*={shoot.alphaStar.toFixed(4)} x_N+1={shoot.xNp1.toExponential(2)} volΣ={shoot.curve.reduce((s, c) => s + c.volume, 0).toFixed(3)}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Stats: Jarque-Bera & CI95 mean</CardTitle></CardHeader>
        <CardContent className="text-sm">JB={jb.jb.toFixed(2)} p={jb.pValue.toFixed(3)} isNormal={String(jb.isNormal)} | CI95 mean: [{ci95Mean([1,2,3,4,5,6,7,8,9,10])[0].toFixed(2)}, {ci95Mean([1,2,3,4,5,6,7,8,9,10])[1].toFixed(2)}]</CardContent>
      </Card>
    </div>
  );
}
