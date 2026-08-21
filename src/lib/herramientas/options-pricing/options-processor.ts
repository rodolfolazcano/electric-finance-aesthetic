import type {
  OptionContract,
  ProcessedOption,
  Moneyness,
  OptionType,
  PricingInput,
  SkewResult,
  RangoPrecios,
  Greeks,
} from "./options.types";
import { blackScholes, binomial } from "./pricing.models";
import { calcularVolatilidadImplicita } from "./volatility";
import { calcularVarDeltaGamma } from "./var";
import { timeToExpiry } from "./market-calendar";

//  Moneyness 

const ATM_RANGO = 0.01; // 1% alrededor del spot se considera ATM

export function determinarMoneyness(tipo: OptionType, strike: number, spot: number): Moneyness {
  const diff = Math.abs(strike - spot) / spot;
  if (diff <= ATM_RANGO) return "ATM";
  if (tipo === "Call") {
    if (strike < spot) return "ITM";
    return "OTM";
  } else {
    if (strike > spot) return "ITM";
    return "OTM";
  }
}

//  Procesar una opción individual 

export function procesarOpcion(
  contract: OptionContract,
  tasaRiesgo: number,
  tasaDividendos: number,
  volSubyacente: number,
): ProcessedOption {
  const { tipoOpcion, strike, T, precioOpcion, precioSubyacente } = contract;
  const S = precioSubyacente;
  const K = strike;

  const moneyness = determinarMoneyness(tipoOpcion, K, S);

  // Volatilidad implícita
  const volImp = calcularVolatilidadImplicita(
    tipoOpcion,
    S,
    K,
    T,
    tasaRiesgo,
    precioOpcion,
    tasaDividendos,
    1e-5,
    200,
    volSubyacente,
  );

  const volForPricing = volImp ?? volSubyacente;
  const bsInput: PricingInput = {
    tipo: tipoOpcion,
    S,
    K,
    T,
    r: tasaRiesgo,
    sigma: volForPricing,
    q: tasaDividendos,
  };
  const bsResult = blackScholes(bsInput);

  let greeks: Greeks | null = null;
  let bsPrice: number | null = null;
  let probITM: number | null = null;
  if (bsResult) {
    greeks = bsResult.greeks;
    bsPrice = bsResult.premium;
    probITM = bsResult.probITM;
  }

  const binPrice = binomial(
    tipoOpcion,
    S,
    K,
    T,
    tasaRiesgo,
    volForPricing,
    100,
    tasaDividendos,
    true,
  );

  const diffBSPct =
    bsPrice != null && precioOpcion > 0 ? ((bsPrice - precioOpcion) / precioOpcion) * 100 : null;
  const diffBinPct =
    binPrice != null && precioOpcion > 0 ? ((binPrice - precioOpcion) / precioOpcion) * 100 : null;

  const varResult =
    greeks && volImp ? calcularVarDeltaGamma(S, volImp, greeks.delta, greeks.gamma, 0.95, 1) : null;

  return {
    ...contract,
    moneyness,
    volatilidadImplicita: volImp,
    greeks,
    blackScholes: bsPrice,
    binomial: binPrice,
    probITM,
    probOTM: probITM != null ? 1 - probITM : null,
    var: varResult,
    diffBSPct,
    diffBinPct,
  };
}

//  Procesar lista de opciones (equivalente a procesar_dataframe) 

export function procesarOpciones(
  contracts: OptionContract[],
  tasaRiesgo: number,
  tasaDividendos: number,
  volSubyacente: number,
): ProcessedOption[] {
  return contracts
    .map((c) => {
      // Assign T if not set
      if (c.T <= 0) {
        const T = timeToExpiry(c.fechaVencimiento);
        if (T <= 0) return null;
        return procesarOpcion({ ...c, T }, tasaRiesgo, tasaDividendos, volSubyacente);
      }
      return procesarOpcion(c, tasaRiesgo, tasaDividendos, volSubyacente);
    })
    .filter((x): x is ProcessedOption => x !== null);
}

//  Filtros 

export function filtrarAltaProbabilidad(
  options: ProcessedOption[],
  umbral = 0.7,
): { itm: ProcessedOption[]; otm: ProcessedOption[] } {
  return {
    itm: options.filter((o) => o.moneyness === "ITM" && (o.probITM ?? 0) > umbral),
    otm: options.filter((o) => o.moneyness === "OTM" && (o.probOTM ?? 0) > umbral),
  };
}

export function filtrarPorVencimiento(
  options: ProcessedOption[],
  vencimiento: string,
): ProcessedOption[] {
  return options.filter((o) => o.fechaVencimiento === vencimiento);
}

//  Skew (sesgo) 

export function calcularSkew(options: ProcessedOption[], spot: number): SkewResult | null {
  const callsOTM = options.filter(
    (o) => o.tipoOpcion === "Call" && o.strike > spot && o.volatilidadImplicita != null,
  );
  const putsOTM = options.filter(
    (o) => o.tipoOpcion === "Put" && o.strike < spot && o.volatilidadImplicita != null,
  );

  if (callsOTM.length === 0 || putsOTM.length === 0) return null;

  const volCalls = callsOTM.reduce((s, o) => s + o.volatilidadImplicita!, 0) / callsOTM.length;
  const volPuts = putsOTM.reduce((s, o) => s + o.volatilidadImplicita!, 0) / putsOTM.length;
  const avg = (volCalls + volPuts) / 2;
  if (avg === 0) return null;

  const skewPct = ((volPuts - volCalls) / avg) * 100;
  let interpretation: SkewResult["interpretation"];
  if (skewPct > 10) interpretation = "alcista";
  else if (skewPct < -10) interpretation = "bajista";
  else interpretation = "neutral";

  return { skewPct, interpretation };
}

//  Rango de precios (soporte/resistencia) 

export function calcularRangosPrecios(options: ProcessedOption[], spot: number): RangoPrecios[] {
  const vencimientos = [...new Set(options.map((o) => o.fechaVencimiento))].sort();
  const rangos: RangoPrecios[] = [];

  for (const fecha of vencimientos) {
    const ops = filtrarPorVencimiento(options, fecha);
    const putsITM = ops.filter((o) => o.tipoOpcion === "Put" && o.moneyness === "ITM");
    const callsITM = ops.filter((o) => o.tipoOpcion === "Call" && o.moneyness === "ITM");

    const soporte = putsITM.length > 0 ? Math.max(...putsITM.map((o) => o.strike)) : 0;
    const resistencia = callsITM.length > 0 ? Math.min(...callsITM.map((o) => o.strike)) : Infinity;

    if (soporte > 0 && resistencia < Infinity && soporte < spot && resistencia > spot) {
      rangos.push({ fecha, soporte, resistencia, spot });
    }
  }

  return rangos;
}
