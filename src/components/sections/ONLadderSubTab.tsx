// @ts-nocheck
import { Fragment, useCallback, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Cell, AreaChart, Area } from "recharts";
import type { IOLCotizacion } from "@/lib/iol-cotizaciones.functions";

interface ONData {
  ticker: string; emisor: string; sector: string; isin: string;
  cuponPct: number; vencimiento: string; moneda: string;
  tipoAmortizacion: "Bullet" | "Sinkable";
  montoEmision: number; precio: number; variacion: number;
  tir: number; tna: number; paridad: number; valorTecnico: number;
  duration: number; currentYield: number;
  pagosPendientes: number; pagoMensual: number;
  cashflow: { fecha: string; cupon: number; amort: number; total: number }[];
}

const ONS: ONData[] = [
  { ticker:"CP38O", emisor:"CGC 2030", sector:"Energía", isin:"USP3063DAC67", cuponPct:11.875, vencimiento:"2030-11-28", moneda:"USD", tipoAmortizacion:"Bullet", montoEmision:500_000_000, precio:1616.00, variacion:0, tir:10.62, tna:10.36, paridad:1.051212, valorTecnico:1.015833, duration:3.17, currentYield:11.29, pagosPendientes:9, pagoMensual:59.38,
    cashflow:[["2026-11-28",59.38,0,59.38],["2027-05-28",59.38,0,59.38],["2027-11-28",59.38,0,59.38],["2028-05-28",59.38,0,59.38],["2028-11-28",59.38,0,59.38],["2029-05-28",59.38,0,59.38],["2029-11-28",59.38,0,59.38],["2030-05-28",59.38,0,59.38],["2030-11-28",59.38,1000,1059.38]].map(([f,c,a,t])=>({fecha:f as string,cupon:c as number,amort:a as number,total:t as number}))},
  { ticker:"MGCRO", emisor:"Pampa Energía 2037", sector:"Energía", isin:"USP7464EAY25", cuponPct:7.75, vencimiento:"2037-11-14", moneda:"USD", tipoAmortizacion:"Bullet", montoEmision:950_000_000, precio:1617.00, variacion:0.59, tir:7.16, tna:7.03, paridad:1.054443, valorTecnico:1.013347, duration:7.23, currentYield:7.34, pagosPendientes:23, pagoMensual:38.75,
    cashflow:Array.from({length:23},(_,i)=>{const d=new Date(2026,10,14);d.setMonth(d.getMonth()+i*6);const p=d.toISOString().slice(0,10);return{fecha:p,cupon:38.75,amort:i===22?1000:0,total:i===22?1038.75:38.75};})},
  { ticker:"PLC7O", emisor:"Pluspetrol Cl.7", sector:"Energía", isin:"USP7924AAD02", cuponPct:7.55, vencimiento:"2037-09-30", moneda:"USD", tipoAmortizacion:"Sinkable", montoEmision:450_000_000, precio:1538.50, variacion:0.29, tir:7.49, tna:7.42, paridad:1.013244, valorTecnico:1.003356, duration:6.79, currentYield:7.45, pagosPendientes:22, pagoMensual:37.75,
    cashflow:Array.from({length:22},(_,i)=>{const d=new Date(2027,2,30);d.setMonth(d.getMonth()+i*6);const p=d.toISOString().slice(0,10);const amort=i===17?330:i===19?330:i===21?340:0;const cup=i===0?56.63:i>17?[25.29,25.29,12.83,12.83][i-18]:37.75;return{fecha:p,cupon:cup,amort:amort,total:cup+amort};})},
  { ticker:"TLCTO", emisor:"Telecom 2036", sector:"Serv. de comunicación", isin:"USP9028NCE96", cuponPct:8.50, vencimiento:"2036-01-20", moneda:"USD", tipoAmortizacion:"Sinkable", montoEmision:600_000_000, precio:1700.90, variacion:-0.27, tir:7.37, tna:7.24, paridad:1.079115, valorTecnico:1.041556, duration:5.90, currentYield:7.85, pagosPendientes:20, pagoMensual:42.50,
    cashflow:Array.from({length:20},(_,i)=>{const d=new Date(2026,6,20);d.setMonth(d.getMonth()+i*6);const p=d.toISOString().slice(0,10);const amort=i===17?500:i===19?500:0;const cup=i>=17?[42.50,21.25,21.25][i-17]:42.50;return{fecha:p,cupon:cup,amort:amort,total:cup+amort};})},
  { ticker:"PLC4O", emisor:"Pluspetrol Cl.4", sector:"Energía", isin:"USP7924AAA62", cuponPct:8.50, vencimiento:"2032-05-30", moneda:"USD", tipoAmortizacion:"Bullet", montoEmision:450_000_000, precio:1655.10, variacion:0.03, tir:6.88, tna:6.76, paridad:1.081943, valorTecnico:1.010861, duration:4.44, currentYield:7.85, pagosPendientes:12, pagoMensual:42.50,
    cashflow:Array.from({length:12},(_,i)=>{const d=new Date(2026,10,30);d.setMonth(d.getMonth()+i*6);const p=d.toISOString().slice(0,10);return{fecha:p,cupon:42.50,amort:i===11?1000:0,total:i===11?1042.50:42.50};})},
  { ticker:"TSC4O", emisor:"TGS 2035", sector:"Energía", isin:"USP9308RBB89", cuponPct:7.75, vencimiento:"2035-11-20", moneda:"USD", tipoAmortizacion:"Bullet", montoEmision:500_000_000, precio:1631.70, variacion:0.10, tir:6.88, tna:6.78, paridad:1.065387, valorTecnico:1.012056, duration:6.39, currentYield:7.27, pagosPendientes:19, pagoMensual:38.75,
    cashflow:Array.from({length:19},(_,i)=>{const d=new Date(2026,10,20);d.setMonth(d.getMonth()+i*6);const p=d.toISOString().slice(0,10);return{fecha:p,cupon:38.75,amort:i===18?1000:0,total:i===18?1038.75:38.75};})},
  { ticker:"IRCPO", emisor:"IRSA 2035", sector:"Bienes raíces", isin:"USP58809BU07", cuponPct:8.00, vencimiento:"2035-03-31", moneda:"USD", tipoAmortizacion:"Sinkable", montoEmision:300_000_000, precio:1662.00, variacion:0.13, tir:6.83, tna:6.72, paridad:1.073928, valorTecnico:1.023556, duration:5.47, currentYield:7.44, pagosPendientes:18, pagoMensual:40.00,
    cashflow:Array.from({length:18},(_,i)=>{const d=new Date(2026,8,30);d.setMonth(d.getMonth()+i*6);const p=d.toISOString().slice(0,10);const amort=i===13?330:i===15?330:i===17?340:0;const cup=i>=13?[40,26.80,26.80,13.60,13.60][i-13]:40;return{fecha:p,cupon:cup,amort:amort,total:cup+amort};})},
  { ticker:"YM34O", emisor:"YPF 2034", sector:"Energía", isin:"USP989MJBY67", cuponPct:8.25, vencimiento:"2034-01-17", moneda:"USD", tipoAmortizacion:"Sinkable", montoEmision:1_100_000_000, precio:1708.00, variacion:0.64, tir:6.68, tna:6.57, paridad:1.085136, valorTecnico:1.041021, duration:4.77, currentYield:7.58, pagosPendientes:16, pagoMensual:41.25,
    cashflow:Array.from({length:16},(_,i)=>{const d=new Date(2026,6,17);d.setMonth(d.getMonth()+i*6);const p=d.toISOString().slice(0,10);const amort=i===11?300:i===13?300:i===15?400:0;const cup=i>=11?[41.25,28.88,28.88,16.50,16.50][i-11]:41.25;return{fecha:p,cupon:cup,amort:amort,total:cup+amort};})},
  { ticker:"VSCXO", emisor:"Vista Energy 2038", sector:"Energía", isin:"USP9659RAD00", cuponPct:7.875, vencimiento:"2038-04-08", moneda:"USD", tipoAmortizacion:"Sinkable", montoEmision:500_000_000, precio:1643.50, variacion:0.09, tir:7.13, tna:7.06, paridad:1.043, valorTecnico:1.008, duration:7.65, currentYield:7.65, pagosPendientes:24, pagoMensual:39.40,
    cashflow:Array.from({length:24},(_,i)=>{const d=new Date(2026,9,8);d.setMonth(d.getMonth()+i*6);const p=d.toISOString().slice(0,10);const amort=i===19?330:i===21?330:i===23?340:0;const cup=i>=19?[39.40,26.40,26.40,13.40,13.40][i-19]:39.40;return{fecha:p,cupon:cup,amort:amort,total:cup+amort};})},
  { ticker:"YMCXO", emisor:"YPF Clase XXXI 2031", sector:"Energía", isin:"USP989MJBV29", cuponPct:8.75, vencimiento:"2031-09-11", moneda:"USD", tipoAmortizacion:"Sinkable", montoEmision:500_000_000, precio:1713.60, variacion:-0.13, tir:6.24, tna:6.14, paridad:1.098708, valorTecnico:1.030382, duration:3.56, currentYield:7.94, pagosPendientes:11, pagoMensual:43.75,
    cashflow:Array.from({length:11},(_,i)=>{const d=new Date(2026,8,11);d.setMonth(d.getMonth()+i*6);const p=d.toISOString().slice(0,10);const amort=i===7?500:i===9?500:i===10?500:0;const cup=43.75;return{fecha:p,cupon:cup,amort:amort,total:cup+amort};})},
  { ticker:"DNCAO", emisor:"Edenor 2033", sector:"Utilidades", isin:"USP3710FBA14", cuponPct:9.5, vencimiento:"2033-04-28", moneda:"USD", tipoAmortizacion:"Sinkable", montoEmision:550_000_000, precio:1596.00, variacion:0.56, tir:8.91, tna:8.72, paridad:1.033737, valorTecnico:1.020583, duration:4.13, currentYield:9.18, pagosPendientes:14, pagoMensual:47.50,
    cashflow:Array.from({length:14},(_,i)=>{const d=new Date(2026,9,28);d.setMonth(d.getMonth()+i*6);const p=d.toISOString().slice(0,10);const amort=i===9?333.3:i===11?333.3:i===13?333.4:0;const cup=i>=9?[47.50,31.70,31.70,15.80,15.80][i-9]:47.50;return{fecha:p,cupon:cup,amort:amort,total:cup+amort};})},
  { ticker:"TSC3O", emisor:"TGS Clase 3 2031", sector:"Energía", isin:"USP9308RBA07", cuponPct:8.5, vencimiento:"2031-07-24", moneda:"USD", tipoAmortizacion:"Bullet", montoEmision:490_000_000, precio:1718.80, variacion:0.46, tir:6.34, tna:6.24, paridad:1.092742, valorTecnico:1.040139, duration:3.84, currentYield:7.75, pagosPendientes:11, pagoMensual:42.50,
    cashflow:Array.from({length:11},(_,i)=>{const d=new Date(2026,6,24);d.setMonth(d.getMonth()+i*6);const p=d.toISOString().slice(0,10);return{fecha:p,cupon:42.50,amort:i===10?1000:0,total:i===10?1042.50:42.50};})},
];

const fmt = (n:number,d=2)=>n.toLocaleString('es-AR',{minimumFractionDigits:d,maximumFractionDigits:d});
const SECTOR_COLORS: Record<string,string> = { "Energía":"#10B981", "Bienes raíces":"#E8B25A", "Serv. de comunicación":"#6EA8FE", "Utilidades":"#8B5CF6" };

export function ONLadderSubTab({ iolData }: { iolData?: IOLCotizacion[] }) {
  const [sortBy, setSortBy] = useState<"tir"|"vencimiento"|"precio"|"sector">("vencimiento");
  const [filterSector, setFilterSector] = useState("");
  const [nominales, setNominales] = useState<Record<string,number>>(()=>Object.fromEntries(ONS.map(o=>[o.ticker,1000])));
  const sectores = [...new Set(ONS.map(o=>o.sector))].sort();

  const iolPriceMap = useMemo(()=>{
    const m = new Map<string,{precio:number;variacion:number}>();
    if(!iolData) return m;
    for(const item of iolData){
      if(item.precio > 0) m.set(item.simbolo.toUpperCase(), {precio:item.precio, variacion:item.variacionPct});
    }
    return m;
  },[iolData]);

  const sorted = useMemo(()=>{
    let arr = [...ONS];
    // Apply IOL prices to override hardcoded data
    for(const on of arr){
      const iol = iolPriceMap.get(on.ticker.toUpperCase());
      if(iol){
        on.precio = iol.precio;
        on.variacion = iol.variacion;
      }
    }
    if(filterSector) arr = arr.filter(o=>o.sector===filterSector);
    if(sortBy==="tir") arr.sort((a,b)=>b.tir-a.tir);
    else if(sortBy==="vencimiento") arr.sort((a,b)=>a.vencimiento.localeCompare(b.vencimiento));
    else if(sortBy==="precio") arr.sort((a,b)=>b.precio-a.precio);
    else if(sortBy==="sector") arr.sort((a,b)=>a.sector.localeCompare(b.sector));
    return arr;
  },[sortBy,filterSector,iolPriceMap]);

  const ladder = useMemo(()=>{
    const monthMap = new Map<string,{fecha:string;pagos:{ticker:string;total:number;tipo:string}[];totalMes:number}>();
    for(const on of sorted){
      const q = nominales[on.ticker] ?? 1000;
      for(const cf of on.cashflow){
        const m = cf.fecha.slice(0,7);
        if(!monthMap.has(m)) monthMap.set(m,{fecha:m,pagos:[],totalMes:0});
        const e = monthMap.get(m)!;
        const scaled = Math.round(cf.total*q/1000*100)/100;
        e.pagos.push({ticker:on.ticker,total:scaled,tipo:cf.amort>0?"amort":"cupon"});
        e.totalMes += scaled;
      }
    }
    return Array.from(monthMap.values()).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  },[sorted,nominales]);

  // News state
  const [newsTicker, setNewsTicker] = useState("");
  const [news, setNews] = useState<{title:string;link:string;source:string;date:string}[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  const fetchNews = useCallback(async(ticker:string)=>{
    const emisor = ONS.find(o=>o.ticker===ticker)?.emisor || ticker;
    setNewsTicker(ticker);
    setNewsLoading(true);
    try{
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch(`${base}/api/news/infobae?q=${encodeURIComponent(emisor + " obligacion negociable")}&count=5`, {signal:AbortSignal.timeout(8000)});
      if(res.ok){ const d=await res.json(); setNews(d.news||[]); }
      else setNews([]);
    }catch{setNews([]);}
    setNewsLoading(false);
  },[]);

  // Portfolio stats
  const portfolioStats = useMemo(()=>{
    const maxTIR = Math.max(...ONS.map(o=>o.tir));
    const minTIR = Math.min(...ONS.map(o=>o.tir));
    const totalNominal = Object.values(nominales).reduce((a,b)=>a+b,0);
    const inversionTotal = sorted.reduce((s,on)=>s + (on.precio/1000)*(nominales[on.ticker]||0), 0);
    // Weighted avg TIR by nominal amount
    const tirPonderada = totalNominal > 0
      ? sorted.reduce((s,on)=>s + on.tir*(nominales[on.ticker]||0), 0) / totalNominal
      : 0;
    const durPonderada = totalNominal > 0
      ? sorted.reduce((s,on)=>s + on.duration*(nominales[on.ticker]||0), 0) / totalNominal
      : 0;
    const cyPonderado = totalNominal > 0
      ? sorted.reduce((s,on)=>s + on.currentYield*(nominales[on.ticker]||0), 0) / totalNominal
      : 0;
    // Sector breakdown
    const sectorMap = new Map<string,number>();
    for(const on of sorted){
      const q = nominales[on.ticker]||0;
      if(q>0) sectorMap.set(on.sector, (sectorMap.get(on.sector)||0) + q*(on.precio/1000));
    }
    const sectores = Array.from(sectorMap.entries()).sort((a,b)=>b[1]-a[1]);
    // Maturity breakdown by year
    const yearMap = new Map<string,number>();
    for(const on of sorted){
      const year = on.vencimiento.slice(0,4);
      const q = nominales[on.ticker]||0;
      if(q>0) yearMap.set(year, (yearMap.get(year)||0) + q);
    }
    const plazos = Array.from(yearMap.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
    // Cashflow: cupones reales + VN a devolver (amort = valor nominal)
    let totalCupones = 0;
    let totalVN = 0;
    for(const on of sorted){
      const q = nominales[on.ticker]||0;
      totalVN += q;
      for(const cf of on.cashflow){
        totalCupones += cf.cupon * q / 1000;
      }
    }
    const totalFlujo = totalCupones + totalVN;
    const ganancia = totalFlujo - inversionTotal;
    return {
      maxTIR: ONS.find(o=>o.tir===maxTIR)!, minTIR: ONS.find(o=>o.tir===minTIR)!,
      tirPonderada, durPonderada, cyPonderado,
      inversionTotal, totalNominal, totalFlujo, totalCupones, totalAmort: totalVN, ganancia,
      sectores, plazos, total: sorted.length,
    };
  },[sorted, nominales]);

  return (
    <div className="space-y-4">
      <div className="mono text-[14px] uppercase tracking-[0.22em] text-primary/80">Escalera de Obligaciones Negociables</div>
      <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">
        ONs Corporativas — <span className="text-emerald-400">USD</span>
      </h2>

      {/* Portfolio stats — inversión, cupones, total */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1 rounded-lg border border-border/40 overflow-hidden bg-border/40">
        <div className="bg-background/40 p-4">
          <div className="text-[13px] uppercase tracking-wider text-muted-foreground">Inversión total</div>
          <div className="text-xl font-bold font-mono">u$s {fmt(portfolioStats.inversionTotal,0)}</div>
          <div className="text-[13px] text-muted-foreground">{portfolioStats.totalNominal.toLocaleString('es-AR')} VN · {portfolioStats.total} ONs</div>
        </div>
        <div className="bg-background/40 p-4">
          <div className="text-[13px] uppercase tracking-wider text-muted-foreground">Cupones a cobrar</div>
          <div className="text-xl font-bold font-mono text-emerald-400">u$s {fmt(portfolioStats.totalCupones,0)}</div>
          <div className="text-[13px] text-muted-foreground">TIR cartera: {portfolioStats.tirPonderada.toFixed(2)}%</div>
        </div>
        <div className="bg-background/40 p-4">
          <div className="text-[13px] uppercase tracking-wider text-muted-foreground">Amortización total</div>
          <div className="text-xl font-bold font-mono text-amber-400">u$s {fmt(portfolioStats.totalAmort,0)}</div>
          <div className="text-[13px] text-muted-foreground">Duration: {portfolioStats.durPonderada.toFixed(2)} años</div>
        </div>
        <div className="bg-background/40 p-4">
          <div className="text-[13px] uppercase tracking-wider text-muted-foreground">Total a recibir (vida entera)</div>
          <div className="text-xl font-bold font-mono" style={{color:portfolioStats.ganancia>=0?'#10B981':'#E8735A'}}>
            u$s {fmt(portfolioStats.totalFlujo,0)}
          </div>
          <div className="text-[13px] text-muted-foreground">
            Ganancia: <span style={{color:portfolioStats.ganancia>=0?'#10B981':'#E8735A'}}>
              {portfolioStats.ganancia>=0?'+':''}u$s {fmt(portfolioStats.ganancia,0)}
            </span>
          </div>
        </div>
      </div>

      {/* Sector & Plazos breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border/40 p-4">
          <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground mb-3">Composición por sector</div>
          <div className="space-y-2">
            {portfolioStats.sectores.map(([sector, monto]) => {
              const pct = portfolioStats.inversionTotal>0 ? (monto/portfolioStats.inversionTotal*100) : 0;
              return (
                <div key={sector}>
                  <div className="flex justify-between text-[14px] mb-1">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{background:SECTOR_COLORS[sector]||'#666'}}/>
                      {sector}
                    </span>
                    <span className="font-mono font-semibold">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-border/20 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{width:pct+'%',background:SECTOR_COLORS[sector]||'#666'}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-lg border border-border/40 p-4">
          <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground mb-3">Distribución por vencimiento</div>
          <div className="space-y-2">
            {portfolioStats.plazos.map(([year, nominal]) => {
              const pct = portfolioStats.totalNominal>0 ? (nominal/portfolioStats.totalNominal*100) : 0;
              return (
                <div key={year}>
                  <div className="flex justify-between text-[14px] mb-1">
                    <span className="font-mono">{year}</span>
                    <span className="font-mono font-semibold">{fmt(nominal,0)} VN ({pct.toFixed(1)}%)</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-border/20 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-amber-500 transition-all" style={{width:pct+'%'}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bar chart: flujo mensual */}
      <div className="rounded-lg border border-border/40 p-4">
        <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground mb-3">Flujo de fondos mensual proyectado</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={ladder.map(m=>({
            mes: m.fecha.slice(5),
            total: Math.round(m.totalMes*100)/100,
            label: m.fecha
          }))} margin={{top:8,right:8,bottom:0,left:-8}}>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="mes" tick={{fontSize:8,fill:'#9aa6bd'}} stroke="#2b3242" interval={Math.max(0,Math.floor(ladder.length/24)-1)} />
            <YAxis tick={{fontSize:9,fill:'#9aa6bd'}} stroke="#2b3242" width={50} tickFormatter={(v:number)=>'u$s'+v.toFixed(0)} />
            <Tooltip contentStyle={{background:'#141a28',border:'1px solid #2b3242',borderRadius:8,fontSize:10,fontFamily:'monospace'}}
              formatter={(value:number)=>['u$s '+value.toFixed(2),'Total mes']}
              labelFormatter={(label:string)=>'Mes: '+label} />
            <Bar dataKey="total" radius={[2,2,0,0]} maxBarSize={20}>
              {ladder.map((entry,i)=>(
                <Cell key={i} fill={entry.pagos.some(p=>p.tipo==='amort')?'#E8B25A':'#10B981'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-2 text-[13px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Cupón</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-400" /> Amortización</span>
        </div>
      </div>

      {/* Reinvestment chart */}
      <div className="rounded-lg border border-border/40 p-4">
        <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground mb-3">Valor acumulado con reinversión — TIR {portfolioStats.tirPonderada.toFixed(2)}%</div>
        {(()=>{
          // Build reinvestment curve: start with inversionTotal, add coupon income and compound
          const tirMensual = Math.pow(1+portfolioStats.tirPonderada/100, 1/12)-1;
          const pts: {mes:string; sinReinvertir:number; conReinversion:number}[] = [];
          let acumNoReinv = portfolioStats.inversionTotal;
          let acumReinv = portfolioStats.inversionTotal;
          for(const m of ladder){
            const pagoMes = m.totalMes;
            // Sin reinversión: suma lineal
            acumNoReinv += pagoMes;
            // Con reinversión: el saldo crece a la TIR mensual + se suman los pagos
            acumReinv = acumReinv * (1 + tirMensual) + pagoMes;
            pts.push({
              mes: m.fecha.slice(5),
              sinReinvertir: Math.round(acumNoReinv*100)/100,
              conReinversion: Math.round(acumReinv*100)/100,
            });
          }
          return (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={pts} margin={{top:8,right:8,bottom:0,left:-8}}>
                <defs>
                  <linearGradient id="reinvGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                  <linearGradient id="noReinvGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6EA8FE" stopOpacity={0.2} /><stop offset="100%" stopColor="#6EA8FE" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="mes" tick={{fontSize:8,fill:'#9aa6bd'}} stroke="#2b3242" interval={Math.max(0,Math.floor(pts.length/20)-1)} />
                <YAxis tick={{fontSize:9,fill:'#9aa6bd'}} stroke="#2b3242" width={55} tickFormatter={(v:number)=>v>=1000?'u$s'+(v/1000).toFixed(1)+'k':'u$s'+v.toFixed(0)} />
                <Tooltip contentStyle={{background:'#141a28',border:'1px solid #2b3242',borderRadius:8,fontSize:10,fontFamily:'monospace'}}
                  formatter={(value:number,name:string)=>['u$s '+value.toFixed(2),name==='sinReinvertir'?'Sin reinversión':'Con reinversión']} />
                <Area type="monotone" dataKey="sinReinvertir" stroke="#6EA8FE" strokeWidth={2} fill="url(#noReinvGrad)" name="sinReinvertir" />
                <Area type="monotone" dataKey="conReinversion" stroke="#10B981" strokeWidth={2} fill="url(#reinvGrad)" name="conReinversion" />
              </AreaChart>
            </ResponsiveContainer>
          );
        })()}
        <div className="flex items-center gap-4 mt-2 text-[13px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-400" /> Sin reinversión (lineal)</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Con reinversión a TIR {portfolioStats.tirPonderada.toFixed(2)}%</span>
        </div>
      </div>
      {/* Filters */}
      <div className="glass p-3 flex flex-wrap items-center gap-3 rounded-lg border border-border/40">
        <select value={sortBy} onChange={e=>setSortBy(e.target.value as any)} className="bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 outline-none focus:border-primary/60">
          <option value="vencimiento">Ordenar por vencimiento ↑</option>
          <option value="tir">Ordenar por TIR ↓</option>
          <option value="precio">Ordenar por precio</option>
          <option value="sector">Ordenar por sector</option>
        </select>
        <select value={filterSector} onChange={e=>setFilterSector(e.target.value)} className="bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 outline-none focus:border-primary/60">
          <option value="">Todos los sectores</option>
          {sectores.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{sorted.length} ONs · {filterSector||"todos los sectores"}</span>
      </div>

      {/* ONs table */}
      <div className="rounded-lg border border-border/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-[14px]">
            <thead className="text-[13px] uppercase tracking-wider text-muted-foreground bg-muted/10">
              <tr><th className="px-3 py-2">Ticker</th><th className="px-3 py-2">Sector</th><th className="px-3 py-2 text-right">Cupón</th><th className="px-3 py-2 text-right">Venc.</th><th className="px-3 py-2 text-right">TIR</th><th className="px-3 py-2 text-right">Precio</th><th className="px-3 py-2 text-right">Var</th><th className="px-3 py-2 text-right">Paridad</th><th className="px-3 py-2 text-right">Señal</th><th className="px-3 py-2 text-right">Duration</th><th className="px-3 py-2 text-right">Cur.Yield</th><th className="px-3 py-2 text-right w-28">Nominales</th></tr>
            </thead>
            <tbody>
              {sorted.map(on=>(
                <tr key={on.ticker} className="border-b border-border/20 hover:bg-muted/10 transition-colors">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{background:SECTOR_COLORS[on.sector]||"#666"}}/>
                      <span className="font-semibold">{on.ticker}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[13px] text-muted-foreground">{on.sector}</td>
                  <td className="px-3 py-2 text-right font-medium">{on.cuponPct.toFixed(3)}%</td>
                  <td className="px-3 py-2 text-right text-[13px]">{on.vencimiento.replace(/-/g,'/')}</td>
                  <td className="px-3 py-2 text-right font-bold" style={{color:on.tir>8?'#10B981':on.tir>7?'#E8B25A':'#6EA8FE'}}>{on.tir.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-right font-mono">${fmt(on.precio,0)}</td>
                  <td className={`px-3 py-2 text-right text-[13px] ${on.variacion>=0?'text-emerald-400':'text-red-400'}`}>{on.variacion>=0?'+':''}{on.variacion.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-right text-[13px]">{on.paridad.toFixed(4)}</td>
                  <td className="px-3 py-2 text-right">
                    {(() => {
                      // Señal basada en TIR vs cupón: si TIR > cupón+1% → compra, si TIR < cupón-1% → venta
                      const diff = on.tir - on.cuponPct;
                      const senal = diff > 1.5 ? "COMPRA" : diff < -1.5 ? "VENTA" : diff > 0.5 ? "COMPRA PARCIAL" : diff < -0.5 ? "VENTA PARCIAL" : "MANTENER";
                      const color = senal.includes("COMPRA") ? "#10B981" : senal.includes("VENTA") ? "#EF4444" : "#E8B25A";
                      return <span className="inline-flex items-center gap-1 text-[13px] font-bold px-1.5 py-0.5 rounded" style={{background: color+"20", color}}>{senal}</span>;
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right">{on.duration.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{on.currentYield.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step={100} min={0} value={nominales[on.ticker]||0}
                      onChange={e=>setNominales(p=>({...p,[on.ticker]:+e.target.value||0}))}
                      className="w-full max-w-[80px] text-right bg-background/40 border border-border/40 rounded px-1.5 py-1 text-[14px] outline-none focus:border-primary/60" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ladder with year grouping */}
      <div className="rounded-lg border border-border/40 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-muted/10 border-b border-border/40">
          <span className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground">
            Escalera de pagos · <span className="text-amber-400">{sorted.length} ONs</span> · montos en USD
          </span>
          <div className="flex items-center gap-3 text-[13px]">
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-400/70" /> Cupón</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-400/70" /> Amortización</span>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-left font-mono text-[13px]">
            <thead className="text-[12px] uppercase tracking-wider text-muted-foreground bg-muted/5 sticky top-0 z-10">
              <tr><th className="px-3 py-1.5 border-b border-border/20 w-24">Mes</th><th className="px-3 py-1.5 border-b border-border/20">Pagos del período</th><th className="px-3 py-1.5 border-b border-border/20 text-right w-28">Total mes</th></tr>
            </thead>
            <tbody>
              {(()=>{
                // Group by year
                const yearGroups: {year:string; months:typeof ladder}[] = [];
                for(const m of ladder){
                  const y = m.fecha.slice(0,4);
                  if(!yearGroups.length || yearGroups[yearGroups.length-1].year !== y)
                    yearGroups.push({year:y, months:[]});
                  yearGroups[yearGroups.length-1].months.push(m);
                }
                return yearGroups.map((yg)=>(
                  <Fragment key={yg.year}>
                    {/* Year separator */}
                    <tr className="bg-muted/20 border-b border-t-2 border-t-emerald-500/20">
                      <td colSpan={3} className="px-3 py-1.5">
                        <span className="text-[14px] font-bold text-emerald-400">{yg.year}</span>
                        <span className="text-[12px] text-muted-foreground ml-2">
                          {yg.months.reduce((s,m)=>s+m.pagos.filter(p=>p.tipo==='amort').length,0)} amortizaciones ·
                          ${fmt(yg.months.reduce((s,m)=>s+m.totalMes,0))} total
                        </span>
                      </td>
                    </tr>
                    {yg.months.map((m,i)=>{
                      const totalAmortMes = m.pagos.filter(p=>p.tipo==='amort').reduce((s,p)=>s+p.total,0);
                      return (
                        <tr key={m.fecha} className={`border-b border-border/10 hover:bg-muted/10 transition-colors ${i%2===0?'bg-muted/5':''}`}>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap text-[13px] font-medium">{m.fecha}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {m.pagos.map((p,j)=>(
                                <span key={j} className={`inline-flex items-center gap-1.5 text-[13px] px-2 py-0.5 rounded-md border ${p.tipo==='amort'?'bg-amber-500/10 text-amber-400 border-amber-500/25':'bg-emerald-500/8 text-emerald-400 border-emerald-500/20'}`}
                                  title={p.tipo==='amort'?'Amortización de capital':'Pago de cupón'}>
                                  <span className="font-semibold">{p.ticker}</span>
                                  <span className="opacity-80">${fmt(p.total)}</span>
                                  {p.tipo==='amort' && <span className="text-[7px] uppercase tracking-wider text-amber-400/60">A</span>}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="font-bold text-emerald-400">${fmt(m.totalMes)}</div>
                            {totalAmortMes>0 && (
                              <div className="text-[12px] text-amber-400/60">
                                cup ${fmt(m.totalMes-totalAmortMes)} + amort ${fmt(totalAmortMes)}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
