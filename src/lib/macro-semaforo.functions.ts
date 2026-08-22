export type SemaforoColor = "favorable" | "neutral" | "desfavorable";

export interface SemaforoInterpretacion {
  label: string;
  value: number | null;
  umbral: string;
  color: SemaforoColor;
  etiqueta: string;
  detalle: string;
}

export interface SemaforoGlobalResult {
  dxy: SemaforoInterpretacion;
  pendienteCurva: SemaforoInterpretacion;  // PASO 14 — reemplaza ust10y por pendiente
  ust10yNivel: SemaforoInterpretacion;     // se mantiene como dato informativo
}

export interface SemaforoArgentinaResult {
  riesgoPais: SemaforoInterpretacion;
  brechaCambiaria: SemaforoInterpretacion;
  tasaReal: SemaforoInterpretacion;
  reservas: SemaforoInterpretacion;
}

export interface SemaforoResult {
  global: SemaforoGlobalResult;
  argentina: SemaforoArgentinaResult;
  scoreGlobal: number;
  scoreArgentina: number;
}

interface InputData {
  riesgoPaisVariacion7d: number | null;
  brechaCambiaria: number | null;
  tasaPoliticaMonetaria: number | null;
  inflacionInteranual: number | null;
  reservasVariacion30d: number | null;
  dxyVariacion30d: number | null;
  ust10yNivel: number | null;
  irx3mNivel: number | null;  // PASO 14 — tasa corta 3 meses
}

function interpretar(
  variable: string,
  valor: number | null,
  umbral: string,
  color: SemaforoColor,
  etiqueta: string,
  detalle: string,
): SemaforoInterpretacion {
  return { label: variable, value: valor, umbral, color, etiqueta, detalle };
}

export function calcularSemaforoGlobal(data: InputData): SemaforoGlobalResult {
  const dxy = (() => {
    if (data.dxyVariacion30d == null)
      return interpretar("DXY", null, "variación 30d > +2% o < -2%", "neutral", "N/D", "Sin datos suficientes para calcular variación del DXY");
    if (data.dxyVariacion30d > 2)
      return interpretar("DXY", data.dxyVariacion30d, "variación 30d > +2%", "desfavorable", "Dólar fuerte globalmente", "Presión sobre emergentes y commodities — DXY sube >2% en 30d");
    if (data.dxyVariacion30d < -2)
      return interpretar("DXY", data.dxyVariacion30d, "variación 30d < -2%", "favorable", "Dólar débil globalmente", "Favorable para emergentes y commodities — DXY cae >2% en 30d");
    return interpretar("DXY", data.dxyVariacion30d, "|variación 30d| ≤ 2%", "neutral", "Dólar estable", "Sin cambios significativos en el índice DXY en los últimos 30 días");
  })();

  // PASO 14 — Pendiente de curva (reemplaza nivel absoluto de UST 10Y como semáforo)
  const pendienteCurva = (() => {
    if (data.ust10yNivel == null || data.irx3mNivel == null)
      return interpretar("Pendiente Curva (10Y-3M)", null, "pendiente > 0 = normal, < 0 = invertida", "neutral", "N/D", "Sin datos de UST 10Y o T-Bill 3M para calcular pendiente");
    const pendiente = data.ust10yNivel - data.irx3mNivel;
    if (pendiente < 0)
      return interpretar("Pendiente Curva (10Y-3M)", pendiente, "pendiente < 0 = invertida", "desfavorable", "Curva invertida — alerta histórica", `Curva invertida (${pendiente.toFixed(2)}%). Precedió las recesiones de 1970, 1974, 1980, 1990, 2000, 2007 en EEUU (Murphy, Cap. 7, pág. 97-98)`);
    if (pendiente < 0.5)
      return interpretar("Pendiente Curva (10Y-3M)", pendiente, "pendiente entre 0% y 0.5% = aplanada", "neutral", "Curva aplanada", `Pendiente positiva pero reducida (${pendiente.toFixed(2)}%). Señal mixta — monitorear evolución`);
    return interpretar("Pendiente Curva (10Y-3M)", pendiente, "pendiente > 0.5% = normal", "favorable", "Curva normal", `Pendiente positiva de ${pendiente.toFixed(2)}%. Sin señal de recesión — curva normal`);
  })();

  // Nivel absoluto de UST 10Y como dato informativo aparte
  const ust10yNivel = (() => {
    if (data.ust10yNivel == null)
      return interpretar("UST 10Y (nivel)", null, "—", "neutral", "N/D", "Sin datos");
    return interpretar("UST 10Y (nivel)", data.ust10yNivel, "solo informativo", "neutral", `${data.ust10yNivel.toFixed(2)}%`, `Nivel absoluto de la tasa larga: ${data.ust10yNivel.toFixed(2)}%. El semáforo usa la pendiente de curva, no el nivel`);
  })();

  return { dxy, pendienteCurva, ust10yNivel };
}

export function calcularSemaforoArgentina(data: InputData): SemaforoArgentinaResult {
  const riesgoPais = (() => {
    if (data.riesgoPaisVariacion7d == null)
      return interpretar("Riesgo País", null, "variación 7d > +5% o < -5%", "neutral", "N/D", "Sin datos suficientes para calcular variación del Riesgo País");
    if (data.riesgoPaisVariacion7d < -5)
      return interpretar("Riesgo País", data.riesgoPaisVariacion7d, "variación 7d < -5%", "favorable", "Mejora acceso a financiamiento", "Riesgo País cae más de 5% en 7 días — umbral: -5%");
    if (data.riesgoPaisVariacion7d > 5)
      return interpretar("Riesgo País", data.riesgoPaisVariacion7d, "variación 7d > +5%", "desfavorable", "Se encarece rollover de deuda", "Riesgo País sube más de 5% en 7 días — umbral: +5%");
    return interpretar("Riesgo País", data.riesgoPaisVariacion7d, "|variación 7d| ≤ 5%", "neutral", "Sin cambios significativos", "Riesgo País estable en la última semana — umbral: |5%|");
  })();

  const brechaCambiaria = (() => {
    if (data.brechaCambiaria == null)
      return interpretar("Brecha Cambiaria", null, "brecha < 10%, 10-30%, > 30%", "neutral", "N/D", "Sin datos de brecha cambiaria");
    if (data.brechaCambiaria < 10)
      return interpretar("Brecha Cambiaria", data.brechaCambiaria, "brecha < 10%", "favorable", "Brecha reducida", "Menor presión devaluatoria — brecha por debajo de 10%");
    if (data.brechaCambiaria > 30)
      return interpretar("Brecha Cambiaria", data.brechaCambiaria, "brecha > 30%", "desfavorable", "Brecha amplia", "Riesgo de ajuste discreto — brecha supera 30%");
    return interpretar("Brecha Cambiaria", data.brechaCambiaria, "brecha entre 10% y 30%", "neutral", "Brecha moderada", "Brecha cambiaria en rango medio — umbral: 10%-30%");
  })();

  const tasaReal = (() => {
    if (data.tasaPoliticaMonetaria == null || data.inflacionInteranual == null)
      return interpretar("Tasa Real", null, "tasaPolítica - inflación > 0", "neutral", "N/D", "Sin datos de tasa política o inflación");
    const tr = data.tasaPoliticaMonetaria - data.inflacionInteranual;
    if (tr > 0)
      return interpretar("Tasa Real", tr, "tasa real > 0%", "favorable", "Tasa real positiva", "Favorable para ahorro en pesos — tasa política le gana a la inflación por " + tr.toFixed(1) + "%");
    return interpretar("Tasa Real", tr, "tasa real < 0%", "desfavorable", "Tasa real negativa", "Desfavorable para ahorro en pesos — inflación supera a la tasa política por " + Math.abs(tr).toFixed(1) + "%");
  })();

  const reservas = (() => {
    if (data.reservasVariacion30d == null)
      return interpretar("Reservas Brutas", null, "variación 30d > 0 o < 0", "neutral", "N/D", "Sin datos de variación de reservas");
    if (data.reservasVariacion30d > 0)
      return interpretar("Reservas Brutas", data.reservasVariacion30d, "variación 30d > 0", "favorable", "Acumulación de reservas", "Reservas brutas suben en los últimos 30 días — umbral: >0%");
    return interpretar("Reservas Brutas", data.reservasVariacion30d, "variación 30d < 0", "desfavorable", "Pérdida de reservas", "Reservas brutas caen en los últimos 30 días — umbral: <0%");
  })();

  return { riesgoPais, brechaCambiaria, tasaReal, reservas };
}

export function calcularSemaforo(data: InputData): SemaforoResult {
  const global = calcularSemaforoGlobal(data);
  const argentina = calcularSemaforoArgentina(data);

  const scoreGlobal = [global.dxy, global.pendienteCurva].reduce((acc, s) => {
    if (s.color === "favorable") return acc + 1;
    if (s.color === "desfavorable") return acc - 1;
    return acc;
  }, 0);

  const scoreArgentina = [argentina.riesgoPais, argentina.brechaCambiaria, argentina.tasaReal, argentina.reservas].reduce((acc, s) => {
    if (s.color === "favorable") return acc + 1;
    if (s.color === "desfavorable") return acc - 1;
    return acc;
  }, 0);

  return { global, argentina, scoreGlobal, scoreArgentina };
}
