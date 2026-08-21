// PAIDF Framework: Problem, Agitation, Impact, Desire, Fear
// Copywriting framework validated for investor psychology

export interface PaidfScore {
  problem: number; // 0-1: identifica problema financiero
  agitation: number; // 0-1: genera urgencia
  impact: number; // 0-1: muestra impacto cuantificable
  desire: number; // 0-1: genera deseo de solución
  fear: number; // 0-1: FOMO / miedo a perder oportunidad
  overall: number;
  breakdown: string[];
}

export interface PaidfInput {
  hasProblem: boolean;
  hasUrgency: boolean;
  hasQuantifiedImpact: boolean;
  hasSolution: boolean;
  hasFomoElement: boolean;
  hasTimeConstraint: boolean;
  hasSocialProof: boolean;
  sentimentIsPositive: boolean;
}

export function evaluatePaidf(input: PaidfInput): PaidfScore {
  const breakdown: string[] = [];
  const problem = input.hasProblem ? 0.8 : 0.2;
  if (!input.hasProblem) breakdown.push("No identifica el problema del inversor");

  let agitation = 0;
  if (input.hasUrgency) agitation += 0.4;
  else breakdown.push("Falta urgencia/agitación");
  if (input.hasTimeConstraint) agitation += 0.3;
  if (input.hasFomoElement) agitation += 0.3;

  const impact = input.hasQuantifiedImpact ? 0.8 : 0.2;
  if (!input.hasQuantifiedImpact) breakdown.push("Falta impacto cuantificado");

  let desire = 0;
  if (input.hasSolution) desire += 0.5;
  else breakdown.push("No muestra la solución");
  if (input.hasSocialProof) desire += 0.3;
  if (input.sentimentIsPositive) desire += 0.2;

  let fear = 0;
  if (input.hasFomoElement) fear += 0.5;
  if (input.hasTimeConstraint) fear += 0.3;
  if (input.hasUrgency) fear += 0.2;

  const overall = problem * 0.2 + agitation * 0.2 + impact * 0.2 + desire * 0.2 + fear * 0.2;
  return { problem, agitation, impact, desire, fear, overall, breakdown };
}

export function paidfRecommendations(score: PaidfScore): string[] {
  const recs: string[] = [];
  if (score.problem < 0.5) recs.push("Empezá con el dolor financiero específico del target");
  if (score.agitation < 0.5)
    recs.push("Usá lenguaje de urgencia: 'última vez', 'ventana se cierra'");
  if (score.impact < 0.5) recs.push("Cuantificá el impacto con números del dashboard");
  if (score.desire < 0.5) recs.push("Mostrá el portafolio deseado como solución");
  if (score.fear < 0.5) recs.push("Agregá elemento FOMO: 'otros inversores ya están'");
  if (recs.length === 0) recs.push("PAIDF-optimizado [OK]");
  return recs;
}
