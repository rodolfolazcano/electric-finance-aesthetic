// Physical AI Pattern: contenido generado por IA con formato humano
// Emula patrones de lenguaje natural, storytelling financiero

export interface PhysicalAiConfig {
  tone: "conservador" | "balanceado" | "agresivo";
  audience: "inversor-minorista" | "inversor-institucional" | "trader" | "general";
  platform: "twitter" | "linkedin" | "instagram" | "whatsapp";
  maxChars: number;
  includeEmoji: boolean;
  includeHashtags: boolean;
}

export interface FormattedPost {
  body: string;
  charCount: number;
  platform: string;
  estimatedReadTimeSec: number;
}

export function detectPhysicalAiQuality(text: string): {
  score: number;
  issues: string[];
} {
  const issues: string[] = [];
  let score = 1;

  // Seniales de IA generica (baja calidad física)
  const genericPatterns = [
    /en\s+este\s+artículo/i,
    /como\s+resultado/i,
    /es\s+importante\s+destacar/i,
    /cabe\s+señalar/i,
    /en\s+conclusión/i,
    /por\s+lo\s+tanto/i,
    /es\s+fundamental/i,
    /es\s+relevante\s+mencionar/i,
  ];
  for (const pat of genericPatterns) {
    if (pat.test(text)) {
      score -= 0.1;
      issues.push(`Frase genérica IA: "${pat.source}"`);
    }
  }

  // Seniales de contenido físico (humano)
  const humanPatterns = [
    /mir[aá]/i,
    /fijate/i,
    /pensalo/i,
    /te\s+mostr[oó]/i,
    /la\s+post[aá]/i,
    /en\s+mi\s+experiencia/i,
    /yo\s+veo/i,
    /dale\s+un\s+vistazo/i,
    /cheque[aá]/i,
  ];
  for (const pat of humanPatterns) {
    if (pat.test(text)) {
      score += 0.15;
    }
  }

  // Coloquialismos argentinos
  const argPatterns = [/che\b/i, /capo/i, /genio/i, /dale/i, /viste/i, /re\s+/i];
  for (const pat of argPatterns) {
    if (pat.test(text)) {
      score += 0.1;
    }
  }

  // Numeros concretos = fisico
  const hasNumbers = /\d+[.,]?\d*%/.test(text) || /\$\s*\d+/.test(text);
  if (hasNumbers) score += 0.2;

  return {
    score: Math.min(1, Math.max(0, score)),
    issues,
  };
}

export function formatForPlatform(text: string, platform: string): FormattedPost {
  const maxChars =
    platform === "twitter"
      ? 280
      : platform === "linkedin"
        ? 3000
        : platform === "whatsapp"
          ? 4096
          : 2200;

  let body = text;
  if (body.length > maxChars) {
    body = body.slice(0, maxChars - 30) + "...";
  }

  const wordsPerMin = 200;
  const wordCount = body.split(/\s+/).length;
  const estimatedReadTimeSec = Math.ceil((wordCount / wordsPerMin) * 60);

  return { body, charCount: body.length, platform, estimatedReadTimeSec };
}

export function applyTone(text: string, tone: string): string {
  if (tone === "conservador") {
    return text
      .replace(/ganancia|ganancias/gi, "rentabilidad")
      .replace(/explot[aá]/gi, "aprovech")
      .replace(/disparo|cohete/gi, "crecimiento sostenido");
  }
  if (tone === "agresivo") {
    return text
      .replace(/rentabilidad/gi, "ganancia")
      .replace(/crecimiento sostenido/gi, "explotó")
      .replace(/moderado/gi, "agresivo");
  }
  return text;
}
