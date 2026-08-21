/**
 * session-state.server.ts
 * Rastrea el estado de la conversacion por sesion para evitar re-clasificar
 * y re-explorar en cada turno. Memoria ligera del "hilo" conversacional.
 */

type ConversationState = {
  nivel: "fast" | "context_locked" | "quant_senior";
  topicos: string[];          // palabras clave del tema actual
  ultimoMensaje: string;
  contadorTurnos: number;     // cuantos turnos en este nivel
  ultimoTimestamp: number;
  requiereContexto: boolean;  // si ya se cargo contexto relevante
};

const estados = new Map<string, ConversationState>();

const PALABRAS_CAMBIO_TEMA = [
  "ahora ", "cambi", "otro", "nuev", "pasemos", "dej", "olvid",
  "analiza ", "investig", "busca ", "explor", "y ahora", "siguiente",
];

function hayCambioDeTema(mensaje: string, topicosPrevios: string[]): boolean {
  if (topicosPrevios.length === 0) return true;
  const m = mensaje.toLowerCase();
  // Si menciona palabras de cambio de tema
  if (PALABRAS_CAMBIO_TEMA.some(p => m.startsWith(p) || m.includes(" " + p))) return true;
  // Si no menciona NINGUN topico previo, probablemente cambio de tema
  const mencionaAlgunTopico = topicosPrevios.some(t => m.includes(t));
  return !mencionaAlgunTopico && topicosPrevios.length > 0;
}

function extraerTopicos(mensaje: string): string[] {
  const palabrasClave = [
    "aapl", "msft", "goog", "amzn", "meta", "nvda", "tsla", "spy", "qqq",
    "ggal", "ypf", "alua", "cedear", "bono", "accion", "etf", "fci",
    "tir", "paridad", "duration", "riesgo", "rendimiento",
    "mercado", "economia", "inflacion", "dolar", "mep", "ccl",
  ];
  const m = mensaje.toLowerCase();
  return palabrasClave.filter(p => m.includes(p));
}

export function getConversationState(sessionId: string): ConversationState | null {
  return estados.get(sessionId) ?? null;
}

export function shouldSkipClassifier(
  sessionId: string,
  mensaje: string,
): { skip: boolean; estadoAnterior: ConversationState | null } {
  const estado = estados.get(sessionId);
  if (!estado) return { skip: false, estadoAnterior: null };

  // Si es el mismo topico y no pasaron mas de 5 min, reusar nivel
  const mismoTopico = !hayCambioDeTema(mensaje, estado.topicos);
  const dentroTiempo = Date.now() - estado.ultimoTimestamp < 300_000; // 5 min

  if (mismoTopico && dentroTiempo && estado.contadorTurnos < 10) {
    return { skip: true, estadoAnterior: estado };
  }
  return { skip: false, estadoAnterior: estado };
}

export function updateConversationState(
  sessionId: string,
  mensaje: string,
  nivel: "fast" | "context_locked" | "quant_senior",
): void {
  const prev = estados.get(sessionId);
  const topicos = extraerTopicos(mensaje);
  const mismoNivel = prev?.nivel === nivel;
  const mismosTopicos = prev && topicos.length > 0 &&
    topicos.some(t => prev.topicos.includes(t));

  estados.set(sessionId, {
    nivel,
    topicos: mismosTopicos ? [...new Set([...prev!.topicos, ...topicos])] : topicos,
    ultimoMensaje: mensaje,
    contadorTurnos: mismoNivel ? (prev?.contadorTurnos ?? 0) + 1 : 1,
    ultimoTimestamp: Date.now(),
    requiereContexto: mismosTopicos ? (prev?.requiereContexto ?? false) : false,
  });
}

export function resetConversationState(sessionId: string): void {
  estados.delete(sessionId);
}
