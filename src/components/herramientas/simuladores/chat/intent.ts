import { van, tirBiseccion } from "@/lib/simuladores.functions";

function parseNumber(raw: string): number | null {
  if (!raw) return null;
  let s = raw.trim().replace(/\s/g, "");
  // handle 5.000.000 or 5,000,000 or 5.5 or 5,5
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasDot && hasComma) {
    // es-AR: 5.000.000,50
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

function parseMoney(text: string): number | null {
  // matches like 5 millones, 500k, 2.5M, $1.000.000, 500000
  const m = text.match(/(?:\$)?\s*([0-9][0-9\.,]*)\s*(millones?|m\b|k\b|mil)?/i);
  if (!m) return null;
  const num = parseNumber(m[1] ?? "");
  if (num == null) return null;
  const unit = (m[2] ?? "").toLowerCase();
  if (unit.startsWith("millon")) return Math.round(num * 1_000_000);
  if (unit === "m") return Math.round(num * 1_000_000);
  if (unit === "k" || unit === "mil") return Math.round(num * 1000);
  return Math.round(num);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}

export type Action =
  | { tool: "comparador.setCapital"; capital: number }
  | { tool: "comparador.setDias"; dias: number }
  | { tool: "comparador.setInflacion"; inflacion: number | null }
  | { tool: "comparador.setVista"; vista: string }
  | { tool: "comparador.setModoReal"; modoReal: boolean }
  | { tool: "comparador.setInstrumento"; id: string; enabled?: boolean; modo?: string; entidadId?: string; manualVal?: number }
  | { tool: "planificador.setCampos"; patch: Record<string, any> }
  | { tool: "planificador.setFlujos"; flujos: number[] }
  | { tool: "planificador.setExtras"; extras: { mes: number; monto: number }[] }
  | { tool: "ui.setSubTab"; subTab: string }
  | { tool: "ui.setVista"; subTab: string; vista: string };

export function parseIntent(input: string, activeSubTab: string, snapshot: any): { actions: Action[]; reply: string; needsInterpretation?: boolean } {
  const q = input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const actions: Action[] = [];
  let replyParts: string[] = [];
  let handled = false;

  // --- Navegación entre herramientas ---
  if (/donde invierto|comparador|comparar/.test(q) && !q.includes("plan")) {
    actions.push({ tool: "ui.setSubTab", subTab: "comparador" });
    replyParts.push("Te llevo a **¿Dónde invierto?** para comparar colocaciones.");
    handled = true;
  } else if (/mi plan|planificador|meta|jubilacion|retiro|van|tir|proyecto/.test(q) && /plan/.test(q)) {
    // only if explicit "plan"
    if (q.includes("plan") || q.includes("meta") || q.includes("jubil") || q.includes("proyecto")) {
      actions.push({ tool: "ui.setSubTab", subTab: "planificador" });
      replyParts.push("Te llevo a **Mi plan financiero**.");
      handled = true;
    }
  }

  // detect vista switches
  if (/evolucion/.test(q)) actions.push({ tool: "comparador.setVista", vista: "evolucion" } as any);
  if (/barras|comparativa/.test(q) && activeSubTab === "comparador") actions.push({ tool: "comparador.setVista", vista: "comparativa" } as any);
  if (/tabla/.test(q) && activeSubTab === "comparador") actions.push({ tool: "comparador.setVista", vista: "tabla" } as any);
  if (/proyeccion/.test(q) && activeSubTab === "planificador") actions.push({ tool: "planificador.setCampos", patch: { vista: "proyeccion" } });
  if (/flujo de fondos|ver flujo/.test(q)) actions.push({ tool: "planificador.setCampos", patch: { vista: "flujo" } });
  if (/analisis/.test(q) && activeSubTab === "planificador") actions.push({ tool: "planificador.setCampos", patch: { vista: "analisis" } });

  // --- COMPARADOR intents ---
  if (activeSubTab === "comparador" || /comparar|capital|plazo/.test(q)) {
    // capital
    const capMatch = q.match(/(?:capital|monto|invertir|comparar)\D{0,20}([0-9][0-9\.,]*)\s*(millones?|m\b|k\b|mil)?/);
    if (capMatch) {
      const cap = parseMoney(capMatch[0]);
      if (cap != null && cap >= 10000 && cap <= 500000000) {
        actions.push({ tool: "comparador.setCapital", capital: clamp(cap, 50000, 50000000) });
        replyParts.push(`Capital → **$${clamp(cap, 50000, 50000000).toLocaleString("es-AR")}**`);
        handled = true;
      }
    } else if (/(\d+)\s*millones/.test(q)) {
      const mm = q.match(/(\d+[\.,]?\d*)\s*millones/);
      const cap = mm ? parseNumber(mm[1] ?? "") : null;
      if (cap != null) {
        const c = clamp(Math.round(cap * 1_000_000), 50000, 50000000);
        actions.push({ tool: "comparador.setCapital", capital: c });
        replyParts.push(`Capital → **$${c.toLocaleString("es-AR")}**`);
        handled = true;
      }
    }
    // dias/plazo
    let dias: number | null = null;
    const diasMatch = q.match(/(\d+)\s*dias/);
    const mesesMatch = q.match(/(\d+)\s*meses/);
    const aniosMatch = q.match(/(\d+)\s*anos/);
    const plazoExplicit = q.match(/plazo\D{0,10}(\d+)/);
    if (diasMatch) dias = parseInt(diasMatch[1] ?? "0", 10);
    else if (mesesMatch) dias = Math.round(parseInt(mesesMatch[1] ?? "0", 10) * 30.4375);
    else if (aniosMatch) dias = Math.round(parseInt(aniosMatch[1] ?? "0", 10) * 365);
    else if (plazoExplicit) dias = parseInt(plazoExplicit[1] ?? "0", 10);
    if (dias != null && dias >= 7 && dias <= 540) {
      actions.push({ tool: "comparador.setDias", dias: clamp(dias, 7, 540) });
      replyParts.push(`Plazo → **${clamp(dias, 7, 540)} días** (~${Math.round(clamp(dias, 7, 540) / 30.4375)} meses)`);
      handled = true;
    }
    // inflacion
    const inflMatch = q.match(/inflacion\D{0,15}(\d+[,\.]?\d*)\s*%/);
    if (inflMatch) {
      const infl = parseNumber(inflMatch[1] ?? "");
      if (infl != null) {
        actions.push({ tool: "comparador.setInflacion", inflacion: clamp(infl, 0, 20) });
        replyParts.push(`Inflación esperada → **${clamp(infl, 0, 20)}% mensual**`);
        handled = true;
      }
    }
    if (/usar oficial|inflacion oficial/.test(q)) {
      // signal to use official — will be handled as set to snapshot official if available
      if (snapshot?.inflacionOficial != null) {
        actions.push({ tool: "comparador.setInflacion", inflacion: snapshot.inflacionOficial });
        replyParts.push(`Inflación → oficial **${snapshot.inflacionOficial}% mensual**`);
        handled = true;
      }
    }
    if (/terminos reales|ver en reales|modo real/.test(q)) {
      actions.push({ tool: "comparador.setModoReal", modoReal: true });
      replyParts.push("Activé **términos reales** (Fisher).");
      handled = true;
    }
    if (/nominal/.test(q) && /real/.test(q) === false) {
      actions.push({ tool: "comparador.setModoReal", modoReal: false });
      replyParts.push("Vista en **nominal**.");
      handled = true;
    }
  }

  // --- PLANIFICADOR intents ---
  if (activeSubTab === "planificador" || /plan|meta|jubil|retiro|van|tir|aporte|cuota/.test(q)) {
    const patch: Record<string, any> = {};

    // aporte inicial
    const apIni = q.match(/aporte inicial\D{0,15}([0-9][0-9\.,]*)\s*(millones?|m\b|k\b|mil)?/);
    if (apIni) {
      const v = parseMoney(apIni[0]);
      if (v != null) { patch.aporteInicial = clamp(v, 0, 500000000); replyParts.push(`Aporte inicial → **$${patch.aporteInicial.toLocaleString("es-AR")}**`); handled = true; }
    }
    // aporte mensual / cuota
    const apMen = q.match(/(?:aporte mensual|cuota mensual|por mes)\D{0,15}([0-9][0-9\.,]*)\s*(millones?|m\b|k\b|mil)?/);
    if (apMen) {
      const v = parseMoney(apMen[0]);
      if (v != null) { patch.aporteMensual = clamp(v, 0, 50000000); patch.conCuotas = true; replyParts.push(`Aporte mensual → **$${patch.aporteMensual.toLocaleString("es-AR")}**`); handled = true; }
    }
    // sin cuotas / con cuotas
    if (/sin cuotas/.test(q)) { patch.conCuotas = false; replyParts.push("Modo **sin cuotas** (aporte único)."); handled = true; }
    if (/con cuotas/.test(q)) { patch.conCuotas = true; handled = true; }
    if (/anticipada/.test(q)) { patch.anticipada = true; replyParts.push("Cuotas **anticipadas**."); handled = true; }
    if (/vencida/.test(q)) { patch.anticipada = false; replyParts.push("Cuotas **vencidas**."); handled = true; }

    // tna
    const tnaM = q.match(/tna\D{0,10}(\d+[,\.]?\d*)\s*%/);
    if (tnaM) {
      const tna = parseNumber(tnaM[1] ?? "");
      if (tna != null) { patch.tna = clamp(tna, 0, 200); replyParts.push(`TNA → **${patch.tna}%**`); handled = true; }
    }
    const inflPl = q.match(/inflacion\D{0,15}(\d+[,\.]?\d*)\s*%/);
    if (inflPl && activeSubTab === "planificador") {
      const infl = parseNumber(inflPl[1] ?? "");
      if (infl != null) { patch.inflacion = clamp(infl, 0, 20); replyParts.push(`Inflación → **${patch.inflacion}% mensual**`); handled = true; }
    }
    // meta
    const objM = q.match(/objetivo\D{0,15}([0-9][0-9\.,]*)\s*(millones?|m\b|k\b|mil)?/);
    if (objM) {
      const v = parseMoney(objM[0]);
      if (v != null) { patch.vfObjetivo = clamp(v, 100000, 1000000000); replyParts.push(`Objetivo → **$${patch.vfObjetivo.toLocaleString("es-AR")}**`); handled = true; }
    }
    const mesesM = q.match(/(\d+)\s*meses/);
    if (mesesM && /meta|plazo/.test(q)) {
      const m = parseInt(mesesM[1] ?? "0", 10);
      if (m >= 1 && m <= 360) { patch.mesesMeta = m; replyParts.push(`Plazo meta → **${m} meses**`); handled = true; }
    }
    // retiro edades
    const edadM = q.match(/edad\D{0,10}(\d+)/);
    if (edadM && /retiro|jubil/.test(q)) {
      const e = parseInt(edadM[1] ?? "0", 10);
      if (e >= 18 && e <= 80) { patch.edadActual = e; handled = true; }
    }
    const retiroM = q.match(/(?:retiro|jubilar)\D{0,15}(\d+)/);
    if (retiroM) {
      const e = parseInt(retiroM[1] ?? "0", 10);
      if (e >= 30 && e <= 80) { patch.edadRetiro = e; replyParts.push(`Edad retiro → **${e}**`); handled = true; }
    }
    // modo
    if (/meta de ahorro/.test(q)) { patch.modo = "meta"; handled = true; }
    if (/jubilacion|retiro/.test(q) && !q.includes("tasa")) { patch.modo = "retiro"; handled = true; }
    if (/\bvan\b|\btir\b|proyecto/.test(q)) { patch.modo = "flujos"; handled = true; }
    if (/cuanto por mes|pmt/.test(q)) { patch.modoMeta = "pmt"; handled = true; }
    if (/cuando llego|fecha/.test(q) && /meta/.test(q)) { patch.modoMeta = "fecha"; handled = true; }

    // flujos parsing: extract numbers like -2000000, 300000 etc or "inversion 2 millones y flujos 500k, 700k, 1m"
    if (/flujo|proyecto/.test(q) && (q.match(/-?\d+[,\.]?\d*\s*(millones?|m\b|k\b)?/g)?.length ?? 0) >= 2) {
      const nums = [...q.matchAll(/-?\d+[,\.]?\d*\s*(millones?|m\b|k\b|mil)?/g)].map((mm) => parseMoney(mm[0]!)).filter((v): v is number => v != null);
      if (nums.length >= 2) {
        // ensure CF0 negative if user said inversion
        let flujos = nums.slice(0, 12);
        if (/inversion/.test(q) && flujos[0]! > 0) flujos[0] = -flujos[0]!;
        actions.push({ tool: "planificador.setFlujos", flujos });
        replyParts.push(`Flujos cargados: **${flujos.map((v) => `$${v.toLocaleString("es-AR")}`).join(" → ")}**`);
        handled = true;
        // also compute VAN/TIR if tasa mentioned
        const tasaM = q.match(/tasa\D{0,15}(\d+[,\.]?\d*)\s*%/);
        if (tasaM) {
          const t = parseNumber(tasaM[1] ?? "");
          if (t != null) {
            const vanVal = van(flujos, t);
            const tirVal = tirBiseccion(flujos);
            patch.tasaDescuento = clamp(t, -10, 100);
            replyParts.push(`Tasa descuento **${patch.tasaDescuento}%** → VAN **$${Math.round(vanVal).toLocaleString("es-AR")}** ${vanVal >= 0 ? "(viable)" : "(no viable)"}${tirVal != null ? `, TIR **${tirVal.toFixed(2)}%**` : ""}`);
            handled = true;
          }
        }
      }
    }
    const tasaDescM = q.match(/tasa.*descuento\D{0,10}(\d+[,\.]?\d*)\s*%/);
    if (tasaDescM) {
      const t = parseNumber(tasaDescM[1] ?? "");
      if (t != null) { patch.tasaDescuento = clamp(t, 0, 100); replyParts.push(`Tasa descuento → **${patch.tasaDescuento}%**`); handled = true; }
    }

    if (Object.keys(patch).length) actions.push({ tool: "planificador.setCampos", patch });
  }

  // --- Preguntas educativas / interpretación ---
  let educationalReply = "";
  if (!handled) {
    if (/que es.*van|van que es/.test(q)) {
      educationalReply = "**VAN** = valor actual neto: suma de flujos descontados. Si VAN ≥ 0, el proyecto cubre tu costo de oportunidad (tasa). Lo ves en la tarjeta **VAN** arriba de la tabla y en el gráfico de perfil.";
    } else if (/que es.*tir|tir que es/.test(q)) {
      educationalReply = "**TIR** = tasa que hace VAN=0. Si TIR > tasa de descuento → conviene. La ves en la tarjeta y en el corte de la curva del gráfico.";
    } else if (/que es.*tea|tea que es/.test(q)) {
      educationalReply = "**TEA** = tasa efectiva anual (compuesta). TNA 42% mensual → TEA ≈ 51%. Todos los instrumentos la muestran en la tabla y en las tarjetas.";
    } else if (/que es.*tem/.test(q)) {
      educationalReply = "**TEM** = tasa efectiva mensual. LECAP y caución cotizan en TEM; la tabla convierte a TEA para comparar.";
    } else if (/que es.*uva|uva que/.test(q)) {
      educationalReply = "**UVA/CER** paga tasa **real** + inflación. En la evolución, su capital se ajusta por la inflación que cargaste (Usar oficial = último INDEC).";
    } else if (/cual.*rinde.*mas|ganador|mejor/.test(q)) {
      const ganador = snapshot?.ganador;
      if (ganador) educationalReply = `Ahora mismo gana **${ganador.label}** (${ganador.fuenteLabel}) con **$${ganador.vfNominal?.toLocaleString("es-AR")}** final. Mirá la tabla (ranking) y el gráfico — en términos reales activá el switch.`;
      else educationalReply = "Cargá capital y plazo y mirá el **ranking** y el **ganador nominal** arriba de los instrumentos.";
    } else if (/ayuda|como.*usar|instruccion/.test(q)) {
      if (activeSubTab === "comparador") educationalReply = "En **¿Dónde invierto?**: 1) elegí capital y plazo (slider o pedime “poné $2M a 90 días”), 2) elegí fuente por instrumento (promedio/mejor/entidad/manual), 3) mirá evolución/barras/tabla y el ganador. Probá: *“compará $5M a 180 días en reales”*.";
      else educationalReply = "En **Mi plan**: elegí modo **Meta** (¿cuánto por mes?), **Retiro** (¿qué haber?) o **Proyecto VAN/TIR** (cargá flujos). Decime en natural: *“quiero 15M en 36 meses con 80k/mes”* y lo cargo.";
    } else if (q.trim().length < 3) {
      educationalReply = "Decime qué querés hacer en palabras: *“compará 3M a 90 días”* o *“quiero juntar 10M en 24 meses”*.";
    }
  }

  if (educationalReply) {
    return { actions, reply: educationalReply };
  }
  if (replyParts.length) {
    const confirm = replyParts.join(" · ") + ".";
    const hint = activeSubTab === "comparador"
      ? " Revisá la **evolución**, **barras** y **tabla** — los números ya se recalcularon."
      : " Revisá la **proyección** y el **flujo mes a mes** — ya se recalculó.";
    return { actions, reply: `Listo, ${confirm}${hint}`, needsInterpretation: true };
  }
  if (actions.length) {
    return { actions, reply: "Hecho — mirá la UI actualizada." };
  }
  return { actions: [], reply: "" };
}
