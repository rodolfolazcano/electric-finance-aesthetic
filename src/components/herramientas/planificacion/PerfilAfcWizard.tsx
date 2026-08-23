import { useState, useEffect } from "react";

export type Perfil = "conservador" | "moderado" | "arriesgado";
export function usePerfilAfc(): [Perfil, (p: Perfil) => void, string] {
  const [perfil, setPerfilRaw] = useState<Perfil>(() => {
    try { const s = localStorage.getItem("afc-perfil"); return (s as Perfil) ?? "moderado"; } catch { return "moderado"; }
  });
  const [etapa] = useState<string>(() => {
    try { return localStorage.getItem("afc-etapa") ?? "acumulacion"; } catch { return "acumulacion"; }
  });
  useEffect(()=>{ try{ localStorage.setItem("afc-perfil", perfil);}catch{} },[perfil]);
  const setPerfil = (p: Perfil) => setPerfilRaw(p);
  return [perfil, setPerfil, etapa];
}

type Modo = "corto" | "iol";
export function PerfilAfcWizard({ onClose }: { onClose?: () => void }) {
  const [modo, setModo] = useState<Modo>("corto");
  const [resCorto, setResCorto] = useState<number[]>([1,1,1,1,1]);
  const [resIol, setResIol] = useState<number[]>([0,0,0,0,0,0,0]); // 7 preguntas IOL
  const [perfil, setPerfil] = usePerfilAfc();

  // corto: 5 preguntas AFC existentes (0-3)
  const preguntasCorto = [
    "Si tu inversión cae 15%, ¿qué harías?",
    "¿Qué preferís: renta segura baja o renta alta incierta?",
    "¿Cuánto de tu cartera estuvo en renta variable?",
    "¿Qué opinás del mercado de acciones?",
    "¿Cuánto tiempo dedicás a vigilar inversiones?",
  ];
  const opcionesCorto = [
    ["Vender todo","Vender parte","No vender","Invertir más"],
    ["Segura baja","Máxima sin arriesgar capital","Máxima arriesgando poco","Máxima arriesgando mucho"],
    ["<10%","10-25%","25-50%",">50%"],
    ["Muy arriesgado","Arriesgado pero necesario","Diversifica","Oportunidades"],
    ["Anual","Trimestral","Semanal","Diario"],
  ];
  const puntajeCorto = resCorto.reduce((a,b)=>a+b,0);
  const sugeridoCorto: Perfil = puntajeCorto <= 7 ? "conservador" : puntajeCorto <= 13 ? "moderado" : "arriesgado";

  // IOL full: 7 preguntas con puntos PDF
  const iolQs = [
    { q: "I.1 ¿Cuándo pensás empezar a retirar fondos?", opts: ["<3 años (1 pt)","3-5 años (3 pt)","6-10 años (7 pt)","11+ años (10 pt)"], pts: [1,3,7,10] },
    { q: "I.2 Una vez que empieces, ¿en cuánto tiempo los retirás?", opts: ["<2 años (0)","2-5 años (1)","6-10 años (4)","11+ años (8)"], pts: [0,1,4,8] },
    { q: "II.1 Tus conocimientos para invertir", opts: ["Nulos (0)","Limitados (2)","Buenos (4)","Muy buenos (6)"], pts: [0,2,4,6] },
    { q: "II.2 Al invertir, ¿te preocupan más las pérdidas o ganancias?", opts: ["Pérdidas (0)","Ambas (4)","Ganancias (8)"], pts: [0,4,8] },
    { q: "II.3 Inversiones más frecuentes", opts: ["Caja/PF (0)","Bonos (3)","Acciones (6)","Internac. (8)"], pts: [0,3,6,8] },
    { q: "II.4 Si el mercado cae 25%, ¿qué hacés?", opts: ["Vender todo (0)","Vender parte (2)","No tocar (5)","Comprar más (8)"], pts: [0,2,5,8] },
    { q: "II.5 Elegí tabla riesgo-rendimiento", opts: ["A 7,2% -5,6% (0)","B 9,0% -12% (3)","C 10,4% -18% (6)","D 11,7% -24% (8)","E 12,5% -28% (10)"], pts: [0,3,6,8,10] },
  ];
  const horizonte = (iolQs[0].pts[resIol[0]] ?? 0) + (iolQs[1].pts[resIol[1]] ?? 0); // 1-18
  const tolerancia = iolQs.slice(2).reduce((s,qq,i)=> s + (qq.pts[resIol[i+2]] ?? 0), 0); // 0-40
  let sugeridoIol: Perfil = "moderado";
  if (horizonte <= 5 || tolerancia <= 12) sugeridoIol = "conservador";
  else if (horizonte >= 13 && tolerancia >= 25) sugeridoIol = "arriesgado";
  else sugeridoIol = "moderado";

  return (
    <div className="rounded-xl border border-border/40 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Descubrí tu perfil</h3>
        <div className="ml-auto flex rounded border border-border/40 p-0.5">
          <button onClick={()=>setModo("corto")} className={`px-2 py-1 text-[11px] rounded ${modo==="corto"?"bg-primary text-primary-foreground":"text-muted-foreground"}`}>AFC corto (5)</button>
          <button onClick={()=>setModo("iol")} className={`px-2 py-1 text-[11px] rounded ${modo==="iol"?"bg-primary text-primary-foreground":"text-muted-foreground"}`}>Test IOL completo (7)</button>
        </div>
      </div>

      {modo==="corto" ? (
        <>
          {preguntasCorto.map((q,i)=>(
            <div key={i} className="space-y-1">
              <p className="text-xs font-medium">{i+1}. {q}</p>
              <div className="flex flex-wrap gap-1">
                {opcionesCorto[i].map((o,oi)=>(
                  <button key={oi} onClick={()=>setResCorto(r=>{const n=[...r]; n[i]=oi; return n;})} className={`px-2 py-1 rounded text-[11px] border ${resCorto[i]===oi?"bg-primary text-primary-foreground border-primary":"border-border/40 bg-background"}`}>{o}</button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 text-xs">
            <span>Sugerido: <b className="capitalize">{sugeridoCorto}</b> ({puntajeCorto} pts)</span>
            <button onClick={()=>setPerfil(sugeridoCorto)} className="ml-auto rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground">Aplicar {sugeridoCorto}</button>
            {onClose && <button onClick={onClose} className="rounded border border-border/40 px-3 py-1.5 text-xs">Cerrar</button>}
          </div>
        </>
      ) : (
        <>
          {iolQs.map((qq,i)=>(
            <div key={i} className="space-y-1">
              <p className="text-xs font-medium">{i+1}. {qq.q}</p>
              <div className="flex flex-wrap gap-1">
                {qq.opts.map((o,oi)=>(
                  <button key={oi} onClick={()=>setResIol(r=>{const n=[...r]; n[i]=oi; return n;})} className={`px-2 py-1 rounded text-[11px] border ${resIol[i]===oi?"bg-primary text-primary-foreground border-primary":"border-border/40 bg-background"}`}>{o}</button>
                ))}
              </div>
            </div>
          ))}
          <div className="rounded bg-muted/20 p-2 text-xs grid grid-cols-3 gap-2">
            <div>Horizonte: <b>{horizonte}</b> /18</div>
            <div>Tolerancia: <b>{tolerancia}</b> /40</div>
            <div>Sugerido: <b className="capitalize">{sugeridoIol}</b></div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span>Matriz IOL: horizonte × tolerancia → perfil</span>
            <button onClick={()=>setPerfil(sugeridoIol)} className="ml-auto rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground">Aplicar {sugeridoIol}</button>
            {onClose && <button onClick={onClose} className="rounded border border-border/40 px-3 py-1.5 text-xs">Cerrar</button>}
          </div>
        </>
      )}
      <p className="text-[11px] text-muted-foreground">Perfil actual: <b className="capitalize">{perfil}</b> — Horizonte sugerido: {perfil==="conservador"?"corto (≤1a) liquidez":perfil==="moderado"?"medio (1-3a) mixto":"largo (>3a) crecimiento"}</p>
    </div>
  );
}
