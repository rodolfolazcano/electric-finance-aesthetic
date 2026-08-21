// TAO Framework: Trust, Attention, Opportunity
// Valida que el contenido para redes sociales cumpla los 3 pilares:

export interface TaoScore {
  trust: number; // 0-1: credibilidad, fuentes, data backing
  attention: number; // 0-1: capta atención (headline, números, hook)
  opportunity: number; // 0-1: muestra una oportunidad clara
  overall: number; // 0-1: weighted average
  breakdown: string[];
}

export interface TaoInput {
  hasDataSources: boolean;
  hasNumbers: boolean;
  hasClearHook: boolean;
  hasOpportunity: boolean;
  hasVerifiableClaim: boolean;
  hasCallToAction: boolean;
  textLength: number;
  sentimentScore?: number;
}

export function evaluateTao(input: TaoInput): TaoScore {
  const breakdown: string[] = [];
  // Trust
  let trust = 0;
  if (input.hasDataSources) {
    trust += 0.4;
  } else {
    breakdown.push("Falta fuente de datos");
  }
  if (input.hasVerifiableClaim) {
    trust += 0.3;
  } else {
    breakdown.push("Afirmación no verificable");
  }
  if (input.hasNumbers) {
    trust += 0.3;
  } else {
    breakdown.push("Faltan números concretos");
  }

  // Attention
  let attention = 0;
  if (input.hasClearHook) {
    attention += 0.4;
  } else {
    breakdown.push("Falta hook inicial");
  }
  if (input.hasNumbers) {
    attention += 0.3;
  }
  if (input.textLength >= 60 && input.textLength <= 280) {
    attention += 0.3;
  } else if (input.textLength < 60) {
    breakdown.push("Demasiado corto para captar atención");
  } else {
    breakdown.push("Demasiado largo, perderá atención");
  }

  // Opportunity
  let opportunity = 0;
  if (input.hasOpportunity) {
    opportunity += 0.5;
  } else {
    breakdown.push("No muestra oportunidad clara");
  }
  if (input.hasCallToAction) {
    opportunity += 0.3;
  } else {
    breakdown.push("Falta call to action");
  }
  if (input.hasNumbers) {
    opportunity += 0.2;
  }

  const overall = trust * 0.35 + attention * 0.35 + opportunity * 0.3;
  return { trust, attention, opportunity, overall, breakdown };
}

export function taoRecommendations(score: TaoScore): string[] {
  const recs: string[] = [];
  if (score.trust < 0.6) recs.push("Agregá fuentes y datos concretos para generar confianza");
  if (score.attention < 0.6) recs.push("Usá un hook numérico fuerte en las primeras 10 palabras");
  if (score.opportunity < 0.6) recs.push("Explicitá la oportunidad de inversión y agregá CTA");
  if (recs.length === 0) recs.push("Contenido TAO-optimizado [OK]");
  return recs;
}
