// @ts-nocheck
export type InvestorProfile =
  | "Corto Plazo: Conservador"
  | "Corto Plazo: Especulativo"
  | "Conservador"
  | "Moderadamente Conservador"
  | "Moderado"
  | "Moderadamente Agresivo"
  | "Agresivo";

export interface QuestionOption {
  label: string;
  score: number;
}

export interface Question {
  id: number;
  section: "horizonte" | "tolerancia";
  text: string;
  options: QuestionOption[];
}

export const QUESTIONS: Question[] = [
  // Sección: Horizonte Temporal
  {
    id: 1,
    section: "horizonte",
    text: "Planeo iniciar el retiro de fondos (efectivo) de mi cartera dentro de:",
    options: [
      { label: "Menos de 3 años", score: 1 },
      { label: "Entre 3 y 5 años", score: 3 },
      { label: "Entre 6 y 10 años", score: 7 },
      { label: "Dentro de 11 o más", score: 10 },
    ],
  },
  {
    id: 2,
    section: "horizonte",
    text: "A partir del momento que decido empezar a retirar mis fondos, planeo retirarlos en:",
    options: [
      { label: "Menos de 2 años", score: 0 },
      { label: "Entre 2 y 5 años", score: 1 },
      { label: "Entre 6 y 10 años", score: 4 },
      { label: "Dentro de 11 o más", score: 8 },
    ],
  },
  // Sección: Tolerancia al Riesgo
  {
    id: 3,
    section: "tolerancia",
    text: "Describiría mis conocimientos sobre INVERTIR como:",
    options: [
      { label: "Nulos", score: 0 },
      { label: "Limitados", score: 2 },
      { label: "Buenos", score: 4 },
      { label: "Muy buenos", score: 6 },
    ],
  },
  {
    id: 4,
    section: "tolerancia",
    text: "Cuando invierto mi dinero, estoy:",
    options: [
      { label: "Mayormente preocupado por las pérdidas de valor de mi cartera", score: 0 },
      { label: "Preocupado por las pérdidas y ganancias de valor de mi cartera", score: 4 },
      { label: "Mayormente preocupado por las ganancias de valor de mi cartera", score: 8 },
    ],
  },
  {
    id: 5,
    section: "tolerancia",
    text: "¿Qué inversiones realiza o ha realizado en forma más frecuente?",
    options: [
      { label: "Cajas de ahorro, cuenta corriente o plazo fijo", score: 0 },
      { label: "Bonos nacionales (renta fija) o fondos que invertían en ellos", score: 3 },
      { label: "Acciones (renta variable) o fondos que invertían en ellas", score: 6 },
      { label: "Acciones y/o bonos internacionales o fondos que invertían en ellas", score: 8 },
    ],
  },
  {
    id: 6,
    section: "tolerancia",
    text: "Imagine que en los últimos 3 meses, el mercado de acciones en su conjunto perdió el 25% de su valor. Una acción que usted tenía también perdió el mismo porcentaje. ¿Qué haría?",
    options: [
      { label: "Vender todas mis acciones", score: 0 },
      { label: "Vender parte de mis acciones", score: 3 },
      { label: "No hacer nada", score: 6 },
      { label: "Comprar más acciones", score: 8 },
    ],
  },
  {
    id: 7,
    section: "tolerancia",
    text: "Considere la siguiente tabla de inversiones hipotéticas. ¿Con cuál se sentiría más cómodo?",
    options: [
      { label: "A — Rend. promedio 7.2% / Mejor 16.3% / Peor -5.6%", score: 0 },
      { label: "B — Rend. promedio 9.0% / Mejor 25.0% / Peor -12.1%", score: 2 },
      { label: "C — Rend. promedio 10.4% / Mejor 33.6% / Peor -18.2%", score: 5 },
      { label: "D — Rend. promedio 11.7% / Mejor 42.8% / Peor -24.0%", score: 8 },
      { label: "E — Rend. promedio 12.5% / Mejor 50.0% / Peor -28.2%", score: 10 },
    ],
  },
];

function getHTBucket(score: number): number {
  if (score <= 2) return 0;
  if (score <= 4) return 1;
  if (score <= 6) return 2;
  if (score <= 9) return 3;
  if (score <= 12) return 4;
  return 5;
}

function getTRBucket(score: number): number {
  if (score <= 10) return 0;
  if (score <= 12) return 1;
  if (score <= 14) return 2;
  if (score <= 16) return 3;
  if (score <= 18) return 4;
  if (score <= 20) return 5;
  if (score <= 22) return 6;
  if (score <= 24) return 7;
  if (score <= 26) return 8;
  if (score <= 28) return 9;
  if (score <= 30) return 10;
  if (score <= 32) return 11;
  if (score <= 34) return 12;
  if (score <= 36) return 13;
  if (score <= 38) return 14;
  return 15;
}

const PROFILES: InvestorProfile[] = [
  "Corto Plazo: Conservador",
  "Corto Plazo: Especulativo",
  "Conservador",
  "Moderadamente Conservador",
  "Moderado",
  "Moderadamente Agresivo",
  "Agresivo",
];

// Matrix: [HT bucket][TR bucket] → profile index
const MATRIX: number[][] = [
  // 1-10 11-12 13-14 15-16 17-18 19-20 21-22 23-24 25-26 27-28 29-30 31-32 33-34 35-36 37-38 39-40
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1], // 0-2
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2], // 3-4
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3], // 5-6
  [0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4], // 7-9
  [1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5], // 10-12
  [2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6], // 14-18
];

export function scoreToProfile(htScore: number, trScore: number): InvestorProfile {
  const htBucket = getHTBucket(htScore);
  const trBucket = getTRBucket(trScore);
  const idx = MATRIX[htBucket]?.[trBucket] ?? 2;
  return PROFILES[idx];
}

export interface AssetAllocation {
  label: string;
  pct: number;
}

export interface ProfileInfo {
  description: string;
  allocation: AssetAllocation[];
}

export const PROFILE_INFO: Record<InvestorProfile, ProfileInfo> = {
  "Corto Plazo: Conservador": {
    description:
      "El inversor muy conservador necesita una cartera de inversión de escaso o nulo riesgo para conseguir una importante estabilidad en sus inversiones sin requerir un (potencial) aumento en el valor de sus inversiones.",
    allocation: [
      { label: "Efectivo y equivalentes", pct: 60 },
      { label: "Bonos", pct: 40 },
    ],
  },
  "Corto Plazo: Especulativo": {
    description:
      "El inversor agresivo de corto plazo necesita una cartera de inversión que capture importantes ganancias de capital en operaciones de corto plazo con elevado riesgo en operaciones individuales, pensando que en el total de transacciones esta exposición a volatilidad será recompensada.",
    allocation: [
      { label: "Acciones líderes mundo (gran capitalización)", pct: 0 },
      { label: "Acciones líderes mundo (pequeña capitalización)", pct: 0 },
      { label: "Acciones Argentina y emergentes", pct: 0 },
      { label: "Bonos", pct: 0 },
      { label: "Efectivo y equivalentes", pct: 100 },
    ],
  },
  Conservador: {
    description:
      "El inversor conservador busca con su cartera de inversión conseguir ingresos corrientes y relativa estabilidad de su valor sin requerir un (potencial) aumento en el valor de sus inversiones.",
    allocation: [
      { label: "Acciones líderes mundo (gran capitalización)", pct: 15 },
      { label: "Acciones líderes mundo (pequeña capitalización)", pct: 0 },
      { label: "Acciones Argentina y emergentes", pct: 5 },
      { label: "Bonos", pct: 55 },
      { label: "Efectivo y equivalentes", pct: 25 },
    ],
  },
  "Moderadamente Conservador": {
    description:
      "El inversor moderadamente conservador busca con su cartera de inversión conseguir ingresos corrientes y relativa estabilidad de su valor pero requiriendo un modesto (potencial) aumento en el valor de sus inversiones.",
    allocation: [
      { label: "Acciones líderes mundo (gran capitalización)", pct: 20 },
      { label: "Acciones líderes mundo (pequeña capitalización)", pct: 10 },
      { label: "Acciones Argentina y emergentes", pct: 10 },
      { label: "Bonos", pct: 45 },
      { label: "Efectivo y equivalentes", pct: 15 },
    ],
  },
  Moderado: {
    description:
      "El inversor moderado es un inversor a largo plazo que no busca con su cartera de inversión conseguir ingresos corrientes pero si requiere un modesto (potencial) aumento en el valor de sus inversiones. El inversor tolera alguna volatilidad pero busca afrontar un menor riesgo que al que se expondría si estuviera invertido en el mercado de renta variable en su conjunto.",
    allocation: [
      { label: "Acciones líderes mundo (gran capitalización)", pct: 30 },
      { label: "Acciones líderes mundo (pequeña capitalización)", pct: 15 },
      { label: "Acciones Argentina y emergentes", pct: 15 },
      { label: "Bonos", pct: 30 },
      { label: "Efectivo y equivalentes", pct: 10 },
    ],
  },
  "Moderadamente Agresivo": {
    description:
      "El inversor moderadamente agresivo es un inversor a largo plazo que no busca con su cartera de inversión conseguir ingresos corrientes pero si requiere un considerable (potencial) aumento en el valor de sus inversiones. El inversor tolera la volatilidad en su medida justa pero no busca exponerse ante el riesgo de estar invertido en el mercado de renta variable únicamente.",
    allocation: [
      { label: "Acciones líderes mundo (gran capitalización)", pct: 35 },
      { label: "Acciones líderes mundo (pequeña capitalización)", pct: 20 },
      { label: "Acciones Argentina y emergentes", pct: 25 },
      { label: "Bonos", pct: 15 },
      { label: "Efectivo y equivalentes", pct: 5 },
    ],
  },
  Agresivo: {
    description:
      "El inversor agresivo es un inversor a largo plazo que no busca con su cartera de inversión conseguir ingresos corrientes pero requiere un sustancial (potencial) aumento en el valor de sus inversiones. El inversor tolera una cantidad importante de la volatilidad año-a-año en el valor de su cartera con el objeto de conservar la posibilidad de grandes retornos de largo plazo.",
    allocation: [
      { label: "Acciones líderes mundo (gran capitalización)", pct: 40 },
      { label: "Acciones líderes mundo (pequeña capitalización)", pct: 25 },
      { label: "Acciones Argentina y emergentes", pct: 30 },
      { label: "Bonos", pct: 0 },
      { label: "Efectivo y equivalentes", pct: 5 },
    ],
  },
};

export const SECTION_NAMES: Record<string, string> = {
  horizonte: "Horizonte Temporal",
  tolerancia: "Tolerancia al Riesgo",
};
