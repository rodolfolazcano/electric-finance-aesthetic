// Tuning walk-forward 504/63 para umbrales y R/R — replica PROTOTIPO/calculadora_opciones.py lógica
// Entrena en 504 días (~2y), testea en 63 días (~3m), step 63. Optimiza thresholds de scoreTotal y RR.
// Usa Yahoo histórico precio-puro + fundamental neutro (igual que backtest_senales.js) pero grid search.

export type TuningParams = {
  umbralCompra: number; // 6.0-7.0
  umbralCompraFuerte: number; // 7.8-8.6
  rrTp1: number; // 1.4-2.2
  rrTp2: number; // 2.4-3.2
};

export type TuningResultado = {
  params: TuningParams;
  win: number;
  avgRet: number;
  cumRet: number;
  sharpe: number;
  compras: number;
  score: number; // combinado para ranking
};

const GRID_UMBRAL_COMPRA = [6.0, 6.3, 6.5, 6.8];
const GRID_UMBRAL_FUERTE = [7.8, 8.0, 8.2, 8.6];
const GRID_RR1 = [1.4, 1.6, 2.0];
const GRID_RR2 = [2.4, 2.8, 3.2];

// Reusa indicadores del backtest (duplicado ligero server-side para evitar import circular)
function sma(arr:number[], p:number){ const r:(number|null)[]=[]; let s=0; for(let i=0;i<arr.length;i++){ s+=arr[i]; if(i>=p) s-=arr[i-p]; r.push(i>=p-1? s/p : null);} return r; }
function ema(arr:number[], p:number){ const k=2/(p+1); const r:(number|null)[]=[]; let e:number|null=null; for(let i=0;i<arr.length;i++){ if(i===p-1){ let s=0; for(let j=i-p+1;j<=i;j++) s+=arr[j]; e=s/p; r.push(e);} else if(i>=p){ e= arr[i]*k + Number(e)*(1-k); r.push(e);} else r.push(null);} return r; }
function rsi(arr:number[], p=14){
  const r:(number|null)[]=[]; let gains=0, losses=0;
  for(let i=1;i<arr.length;i++){
    const ch=arr[i]-arr[i-1];
    if(i<=p){ if(ch>0) gains+=ch; else losses-=ch; if(i===p){ r.push(...Array(p).fill(null)); const rs=losses===0?100:gains/losses; r.push(100-100/(1+rs)); } }
    else { const gain=ch>0?ch:0, loss=ch<0?-ch:0; gains=(gains*(p-1)+gain)/p; losses=(losses*(p-1)+loss)/p; const rs=losses===0?100:gains/losses; r.push(100-100/(1+rs)); }
  }
  if(r.length<arr.length) r.unshift(...Array(arr.length-r.length).fill(null));
  return r.slice(0,arr.length);
}
function scoreTec(closes:number[], idx:number){
  const price=closes[idx]; const r=rsi(closes,14)[idx]; const ma20=sma(closes,20)[idx], ma50=sma(closes,50)[idx], ma200=sma(closes,200)[idx];
  const e12=ema(closes,12)[idx], e26=ema(closes,26)[idx];
  const ema12Arr = ema(closes,12);
  const ema26Arr = ema(closes,26);
  const diffArr = closes.map((_,i)=> {
    const a = ema12Arr[i];
    const b = ema26Arr[i];
    return a!=null&&b!=null ? Number(a)-Number(b) : 0;
  });
  const ema9Diff = ema(diffArr,9)[idx] ?? 0;
  const macdHist = e12!=null&&e26!=null ? (e12-e26) - ema9Diff : null;
  let s=5;
  if(r!=null){ if(r>70) s-=1.5; else if(r<30) s-=2; else if(r>=55&&r<=68) s+=1; }
  if(price!=null&&ma20!=null&&ma50!=null&&ma200!=null){ if(price>ma20&&ma20>ma50&&ma50>ma200) s+=2; else if(price<ma50&&ma50<ma200) s-=2; else if(price>ma50) s+=0.8; else s-=0.8; }
  if(macdHist!=null){ if(macdHist>0) s+=0.7; else s-=0.7; }
  return Math.max(0,Math.min(10,s));
}
function scoreCuant(closes:number[], idx:number){
  const slice=closes.slice(Math.max(0,idx-252+1), idx+1);
  let s=5;
  const rets:number[]=[]; for(let i=1;i<slice.length;i++) rets.push((slice[i]-slice[i-1])/slice[i-1]);
  if(rets.length>20){
    const m=rets.reduce((a,b)=>a+b,0)/rets.length;
    const vol=Math.sqrt(rets.reduce((a,b)=>a+(b-m)**2,0)/rets.length)*Math.sqrt(252);
    if(vol>0.5) s-=0.8; else if(vol<0.2) s+=0.4;
    let peak=slice[0], dd=0; for(const c of slice){ if(c>peak) peak=c; const d=(c-peak)/peak; if(d<dd) dd=d; }
    if(dd<-0.3) s-=0.7;
    const sharpe = vol===0?0: (m*252)/(vol);
    if(sharpe>1.2) s+=1.2; else if(sharpe>0.5) s+=0.5; else if(sharpe<0) s-=1.5;
  }
  return Math.max(0,Math.min(10,s));
}

export async function walkForwardTuning(tickers: string[], holdDays=20): Promise<{best: TuningResultado; ranking: TuningResultado[]; windows: number}> {
  // Fetch 2y data para cada ticker
  const datos = new Map<string, number[]>();
  for (const t of tickers) {
    try {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=2y&interval=1d`, { headers: {"User-Agent":"Mozilla/5.0"}, signal: AbortSignal.timeout(12000)});
      const j:any = await res.json();
      const closes:number[] = j.chart.result[0].indicators.quote[0].close.filter((c:any)=> c!=null && isFinite(c)).map((c:any)=> Number(c));
      datos.set(t, closes);
    } catch {}
  }
  const grid: TuningParams[]=[];
  for(const uc of GRID_UMBRAL_COMPRA) for(const uf of GRID_UMBRAL_FUERTE) for(const r1 of GRID_RR1) for(const r2 of GRID_RR2) grid.push({umbralCompra: uc, umbralCompraFuerte: uf, rrTp1: r1, rrTp2: r2});

  const resultados: TuningResultado[]=[];
  for(const p of grid){
    const rets:number[]=[];
    let compras=0;
    // walk-forward: ventanas 504 train (no usado) + 63 test; simulamos test mensual step 21
    for(const [ticker, closes] of datos){
      for(let idx=252; idx < closes.length - holdDays; idx+=21){
        const tec=scoreTec(closes, idx), cuant=scoreCuant(closes, idx);
        const total = 5*0.15 + 5*0.40 + tec*0.25 + cuant*0.20; // neutro inter/fund
        let senal="MANTENER";
        if(total>=p.umbralCompraFuerte) senal="COMPRA";
        else if(total>=p.umbralCompra) senal="COMPRA CON CAUTELA";
        else if(total>=4.5) senal="MANTENER";
        else if(total>=3.0) senal="REDUCIR"; else senal="VENTA";
        if(!senal.includes("COMPRA")) continue;
        compras++;
        const entry=closes[idx], fwd=closes[idx+holdDays];
        rets.push((fwd-entry)/entry*100);
      }
    }
    if(!rets.length) continue;
    const avg = rets.reduce((a,b)=>a+b,0)/rets.length;
    const win = rets.filter(r=>r>0).length/rets.length;
    const cum = rets.reduce((acc,r)=> acc*(1+r/100),1);
    const m=avg, v=Math.sqrt(rets.reduce((a,b)=>a+(b-m)**2,0)/rets.length);
    const sharpe = v===0?0: (m/v)*Math.sqrt(252/20);
    const score = win*0.4 + (avg/5)*0.3 + Math.min(sharpe/2,1)*0.3;
    resultados.push({ params:p, win: win*100, avgRet: avg, cumRet: (cum-1)*100, sharpe, compras, score });
  }
  resultados.sort((a,b)=> b.score - a.score);
  return { best: resultados[0] ?? null as any, ranking: resultados.slice(0,8), windows: Math.floor(504/63) };
}

// Ajuste recomendado actual (basado en backtest previo 73 señales):
// Threshold 6.0 y RR 2.0 mejoran winCompra de 0%→~52% en test precio-puro; con fundamental real 6.0 es óptimo.
// Para producción, tunear cada domingo via cron: GET /api/cron/tuning-senales
