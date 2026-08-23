import { useState, useEffect } from "react";

export type Perfil = "conservador" | "moderado" | "arriesgado";
export function usePerfilAfc(): [Perfil, (p: Perfil) => void, string] {
  const [perfil, setPerfilRaw] = useState<Perfil>(() => {
    try { const s = localStorage.getItem("afc-perfil"); return (s as Perfil) ?? "moderado"; } catch { return "moderado"; }
  });
  const [etapa, setEtapa] = useState<string>(() => {
    try { return localStorage.getItem("afc-etapa") ?? "acumulacion"; } catch { return "acumulacion"; }
  });
  useEffect(()=>{ try{ localStorage.setItem("afc-perfil", perfil);}catch{} },[perfil]);
  useEffect(()=>{ try{ localStorage.setItem("afc-etapa", etapa);}catch{} },[etapa]);
  const setPerfil = (p: Perfil) => setPerfilRaw(p);
  return [perfil, setPerfil, etapa];
}

export function PerfilAfcWizard({ onClose }: { onClose?: () => void }) {
  const [res, setRes] = useState<number[]>([1,1,1,1,1]);
  const [perfil, setPerfil] = usePerfilAfc();
  const preguntas = [
    "Si tu inversión cae 15%, ¿qué harías?",
    "¿Qué preferís: renta segura baja o renta alta incierta?",
    "¿Cuánto de tu cartera estuvo en renta variable?",
    "¿Qué opinás del mercado de acciones?",
    "¿Cuánto tiempo dedicás a vigilar inversiones?",
  ];
  const opciones = [
    ["Vender todo","Vender parte","No vender","Invertir más"],
    ["Segura baja","Máxima sin arriesgar capital","Máxima arriesgando poco","Máxima arriesgando mucho"],
    ["<10%","10-25%","25-50%",">50%"],
    ["Muy arriesgado","Arriesgado pero necesario","Diversifica","Oportunidades"],
    ["Anual","Trimestral","Semanal","Diario"],
  ];
  const puntaje = res.reduce((a,b)=>a+b,0);
  const sugerido: Perfil = puntaje <= 7 ? "conservador" : puntaje <= 13 ? "moderado" : "arriesgado";
  return (
    <div className="rounded-xl border border-border/40 bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">Descubrí tu perfil AFC (5 preguntas)</h3>
      {preguntas.map((q,i)=>(
        <div key={i} className="space-y-1">
          <p className="text-xs font-medium">{i+1}. {q}</p>
          <div className="flex flex-wrap gap-1">
            {opciones[i].map((o,oi)=>(
              <button key={oi} onClick={()=>setRes(r=>{const n=[...r]; n[i]=oi; return n;})} className={`px-2 py-1 rounded text-[11px] border ${res[i]===oi?"bg-primary text-primary-foreground border-primary":"border-border/40 bg-background"}`}>{o}</button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2 text-xs">
        <span>Sugerido: <b className="capitalize">{sugerido}</b> ({puntaje} pts)</span>
        <button onClick={()=>setPerfil(sugerido)} className="ml-auto rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground">Aplicar {sugerido}</button>
        {onClose && <button onClick={onClose} className="rounded border border-border/40 px-3 py-1.5 text-xs">Cerrar</button>}
      </div>
      <p className="text-[11px] text-muted-foreground">Perfil actual: <b className="capitalize">{perfil}</b> — Horizonte sugerido: {perfil==="conservador"?"corto (≤1a) liquidez":perfil==="moderado"?"medio (1-3a) mixto":"largo (>3a) crecimiento"}</p>
    </div>
  );
}
