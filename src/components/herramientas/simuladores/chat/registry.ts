export type ComparadorActions = {
  setCapital: (v: number) => void;
  setDias: (v: number) => void;
  setInflacion: (v: number | null) => void;
  setModoReal: (v: boolean) => void;
  setVista: (v: string) => void;
  setInstrumentoEnabled: (id: string, enabled: boolean) => void;
  setInstrumentoModo: (id: string, modo: string, entidadId?: string, manualVal?: number) => void;
  getSnapshot: () => any;
};

export type PlanificadorActions = {
  setAporteInicial: (v: number) => void;
  setAporteMensual: (v: number) => void;
  setTna: (v: number) => void;
  setInflacion: (v: number | null) => void;
  setConCuotas: (v: boolean) => void;
  setAnticipada: (v: boolean) => void;
  setModo: (v: string) => void;
  setVista: (v: string) => void;
  setModoMeta: (v: string) => void;
  setVfObjetivo: (v: number) => void;
  setMesesMeta: (v: number) => void;
  setEdadActual: (v: number) => void;
  setEdadRetiro: (v: number) => void;
  setEsperanzaVida: (v: number) => void;
  setFlujos: (v: number[]) => void;
  setTasaDescuento: (v: number) => void;
  setExtras: (v: { mes: number; monto: number }[]) => void;
  getSnapshot: () => any;
};

type Registry = {
  comparador: ComparadorActions | null;
  planificador: PlanificadorActions | null;
};

const registry: Registry = { comparador: null, planificador: null };
const listeners = new Set<() => void>();

export function registerComparadorActions(a: ComparadorActions | null) {
  registry.comparador = a;
  listeners.forEach((cb) => cb());
}
export function registerPlanificadorActions(a: PlanificadorActions | null) {
  registry.planificador = a;
  listeners.forEach((cb) => cb());
}
export function getRegistry() {
  return registry;
}
export function subscribeRegistry(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
