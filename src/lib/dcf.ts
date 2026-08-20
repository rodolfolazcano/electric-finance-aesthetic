/** Calculador de valoración por flujo de caja descontado (DCF).
 *  Es un ejercicio educativo sobre los supuestos que elige el usuario;
 *  el resultado NO es recomendación de inversión ni promesa de rentabilidad. */

export type EntradaDCF = {
  /** Nombre de la empresa/acción que se valora (opcional, para la posterior validación en web). */
  empresa?: string;
  /** Flujo de caja libre del año base, en la moneda elegida. */
  flujoCajaLibre: number;
  /** "USD" o "ARS" (solo afecta el símbolo con que se muestran los valores). */
  moneda?: string;
  /** Crecimiento anual del flujo durante la proyección explícita (%). */
  crecimiento?: number;
  /** Años de proyección explícita. */
  anos?: number;
  /** Crecimiento perpetuo del valor terminal (%). */
  crecimientoTerminal?: number;
  /** Tasa de descuento / WACC (%). */
  tasaDescuento?: number;
  /** Deuda neta a restar del valor de la empresa (misma moneda). */
  deudaNeta?: number;
  /** Acciones en circulación, para estimar el valor por acción (opcional). */
  acciones?: number;
};

export type ResultadoDCF = {
  ok: boolean;
  error?: string;
  /** Valor presente de los flujos explícitos. */
  pvFlujos?: number;
  /** Valor presente del valor terminal. */
  pvTerminal?: number;
  /** Valor de la empresa (EV). */
  valorEmpresa?: number;
  /** Valor del patrimonio (EV menos deuda neta). */
  valorPatrimonio?: number;
  /** Valor por acción (si se informó la cantidad de acciones). */
  valorPorAccion?: number | null;
  /** Sensibilidad del valor por acción a la tasa de descuento. */
  sensibilidad?: Array<{ tasa: number; valor: number | null }>;
};

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function simbolo(moneda?: string): string {
  return /^ars$/i.test(moneda ?? "") ? "$" : "USD ";
}

/** Calcula el DCF con modelo de dos etapas (proyección explícita + valor terminal de Gordon). */
export function calcularDCF(e: EntradaDCF): ResultadoDCF {
  const fcf = Number(e.flujoCajaLibre);
  const g = (Number(e.crecimiento ?? 5) || 0) / 100;
  const anos = Math.max(1, Math.floor(Number(e.anos ?? 5) || 5));
  const gT = (Number(e.crecimientoTerminal ?? 2.5) || 0) / 100;
  const r = (Number(e.tasaDescuento ?? 12) || 0) / 100;
  const deudaNeta = Number(e.deudaNeta ?? 0) || 0;
  const acciones = Number(e.acciones ?? 0) || 0;

  if (!isFinite(fcf) || fcf <= 0)
    return { ok: false, error: "El flujo de caja libre debe ser un número positivo." };
  if (!isFinite(r) || r <= 0)
    return { ok: false, error: "La tasa de descuento debe ser un número positivo." };
  if (r <= gT)
    return {
      ok: false,
      error:
        "La tasa de descuento debe ser mayor al crecimiento terminal para que la valoración sea válida.",
    };

  let pvFlujos = 0;
  for (let t = 1; t <= anos; t++) {
    const fcfT = fcf * Math.pow(1 + g, t);
    pvFlujos += fcfT / Math.pow(1 + r, t);
  }

  const fcfFinal = fcf * Math.pow(1 + g, anos);
  const tv = (fcfFinal * (1 + gT)) / (r - gT);
  const pvTerminal = tv / Math.pow(1 + r, anos);

  const valorEmpresa = pvFlujos + pvTerminal;
  const valorPatrimonio = valorEmpresa - deudaNeta;
  const valorPorAccion = acciones > 0 ? valorPatrimonio / acciones : null;

  const sensibilidad: Array<{ tasa: number; valor: number | null }> = [];
  for (const delta of [-2, 0, 2]) {
    const rAlt = r + delta / 100;
    if (rAlt <= gT) continue;
    let pvAlt = 0;
    for (let t = 1; t <= anos; t++) {
      const fcfT = fcf * Math.pow(1 + g, t);
      pvAlt += fcfT / Math.pow(1 + rAlt, t);
    }
    const tvAlt = (fcf * Math.pow(1 + g, anos) * (1 + gT)) / (rAlt - gT);
    const evAlt = pvAlt + tvAlt / Math.pow(1 + rAlt, anos) - deudaNeta;
    sensibilidad.push({
      tasa: rAlt * 100,
      valor: acciones > 0 ? evAlt / acciones : null,
    });
  }

  return {
    ok: true,
    pvFlujos,
    pvTerminal,
    valorEmpresa,
    valorPatrimonio,
    valorPorAccion,
    sensibilidad,
  };
}

/** Arma el texto legible del resultado para el agente. */
export function textoResultadoDCF(e: EntradaDCF, r: ResultadoDCF): string {
  if (!r.ok) return `ERROR DEL CÁLCULO: ${r.error}`;
  const s = simbolo(e.moneda);
  const lineas = [
    `Valoración DCF (ejercicio educativo sobre supuestos elegidos por el usuario — NO es recomendación ni promesa de rentabilidad):`,
    ``,
    ...(e.empresa?.trim() ? [`Empresa valorada: ${e.empresa.trim()}`, ``] : []),
    `Supuestos usados:`,
    `- Flujo de caja libre del año base: ${s}${nf.format(Number(e.flujoCajaLibre))}`,
    `- Crecimiento anual del flujo: ${nf.format(Number(e.crecimiento ?? 5))}% por ${nf.format(Number(e.anos ?? 5))} años`,
    `- Crecimiento terminal: ${nf.format(Number(e.crecimientoTerminal ?? 2.5))}%`,
    `- Tasa de descuento (WACC): ${nf.format(Number(e.tasaDescuento ?? 12))}%`,
    `- Deuda neta: ${s}${nf.format(Number(e.deudaNeta ?? 0))}`,
    ...(Number(e.acciones) > 0
      ? [`- Acciones en circulación: ${nf.format(Number(e.acciones))}`]
      : []),
    ``,
    `Resultado:`,
    `- Valor presente de los flujos (${nf.format(Number(e.anos ?? 5))} años): ${s}${nf.format(r.pvFlujos ?? 0)}`,
    `- Valor presente del valor terminal: ${s}${nf.format(r.pvTerminal ?? 0)}`,
    `- Valor de la empresa (EV): ${s}${nf.format(r.valorEmpresa ?? 0)}`,
    `- Valor del patrimonio: ${s}${nf.format(r.valorPatrimonio ?? 0)}`,
    ...(r.valorPorAccion != null
      ? [`- Valor por acción estimado: ${s}${nf2.format(r.valorPorAccion)}`]
      : ["- Valor por acción: no se informó la cantidad de acciones."]),
  ];
  if (r.sensibilidad?.length) {
    lineas.push(``, `Sensibilidad del valor por acción según la tasa de descuento:`);
    for (const s of r.sensibilidad) {
      lineas.push(
        `- ${nf.format(s.tasa)}%: ${s.valor != null ? `${simbolo(e.moneda)}${nf2.format(s.valor)}` : "s/d"}`,
      );
    }
  }
  lineas.push(
    ``,
    `Aclaración: el resultado depende enteramente de los supuestos. Cambiá crecimiento, tasa de descuento o deuda neta y el valor cambia. Es una herramienta para entender cómo se valora una empresa, no una recomendación de compra o venta.`,
  );
  return lineas.join("\n");
}
