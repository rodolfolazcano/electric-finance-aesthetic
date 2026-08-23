/**
 * NeMo Relay — instrumentación ligera para orquestación rápida, eficaz e inteligente
 * Basado en skills: nemo-relay-get-started, nemo-relay-instrument-calls,
 *                  nemo-relay-plugin-observability, nemo-relay-plugin-adaptive-tuning
 *
 * Principio: instrumentar el boundary una vez (scope), emitir eventos, y dejar que
 * plugins decidan paralelismo/cache sin reescribir call sites.
 */

export type RelayScope = {
  id: string;
  name: string;
  parentId?: string;
  startedAt: number;
  kind: "root" | "tool" | "llm" | "agent";
};

export type RelayEvent = {
  scopeId: string;
  scopeName: string;
  kind: "tool" | "llm" | "status" | "adaptive";
  name: string;
  status: "start" | "success" | "error";
  durationMs?: number;
  payload?: unknown;
  ts: number;
};

// --- Scope stack (sync + async propagation simple) ---
const scopeStack: RelayScope[] = [];
const allScopes: Map<string, RelayScope> = new Map();
const events: RelayEvent[] = [];
const MAX_EVENTS = 500;

// State para adaptive tuning (in-memory)
type AdaptiveState = {
  toolLatencies: Map<string, number[]>;
  hintCache: Map<string, { hint: string; ts: number }>;
};
const adaptiveState: AdaptiveState = {
  toolLatencies: new Map(),
  hintCache: new Map(),
};

function genId() {
  return `rs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createScope(name: string, kind: RelayScope["kind"] = "root", parentId?: string): RelayScope {
  const parent = parentId ?? scopeStack[scopeStack.length - 1]?.id;
  const scope: RelayScope = { id: genId(), name, parentId: parent, startedAt: Date.now(), kind };
  scopeStack.push(scope);
  allScopes.set(scope.id, scope);
  recordEvent({ scopeId: scope.id, scopeName: scope.name, kind: "status", name: "scope:start", status: "start", ts: Date.now() });
  return scope;
}

export function closeScope(scope: RelayScope) {
  const idx = scopeStack.findIndex((s) => s.id === scope.id);
  if (idx >= 0) scopeStack.splice(idx, 1);
  recordEvent({ scopeId: scope.id, scopeName: scope.name, kind: "status", name: "scope:end", status: "success", durationMs: Date.now() - scope.startedAt, ts: Date.now() });
}

export function getCurrentScope(): RelayScope | undefined {
  return scopeStack[scopeStack.length - 1];
}

export function recordEvent(e: Omit<RelayEvent, "ts"> & { ts?: number }) {
  const ev: RelayEvent = { ...e, ts: e.ts ?? Date.now() };
  events.push(ev);
  if (events.length > MAX_EVENTS) events.shift();
  // Adaptive: track latencies
  if (ev.durationMs != null && ev.kind === "tool") {
    const arr = adaptiveState.toolLatencies.get(ev.name) ?? [];
    arr.push(ev.durationMs);
    if (arr.length > 20) arr.shift();
    adaptiveState.toolLatencies.set(ev.name, arr);
  }
  // OTLP/log opcional
  if (typeof console !== "undefined" && process.env.NODE_ENV !== "production") {
    // console.debug(`[relay] ${ev.scopeName} ${ev.kind}:${ev.name} ${ev.status} ${ev.durationMs ?? ""}ms`);
  }
}

export function getRecentEvents(n = 50): RelayEvent[] {
  return events.slice(-n);
}

// --- Instrumentación de calls (typed wrappers) ---

export async function instrumentTool<T>(
  toolName: string,
  fn: () => Promise<T>,
  opts?: { scopeName?: string },
): Promise<T> {
  const parent = getCurrentScope();
  const scope = createScope(opts?.scopeName ?? `tool:${toolName}`, "tool", parent?.id);
  const start = Date.now();
  recordEvent({ scopeId: scope.id, scopeName: scope.name, kind: "tool", name: toolName, status: "start" });
  try {
    const res = await fn();
    recordEvent({ scopeId: scope.id, scopeName: scope.name, kind: "tool", name: toolName, status: "success", durationMs: Date.now() - start });
    return res;
  } catch (e) {
    recordEvent({ scopeId: scope.id, scopeName: scope.name, kind: "tool", name: toolName, status: "error", durationMs: Date.now() - start, payload: String(e) });
    throw e;
  } finally {
    closeScope(scope);
  }
}

export async function instrumentLLM<T>(
  modelId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const parent = getCurrentScope();
  const scope = createScope(`llm:${modelId}`, "llm", parent?.id);
  const start = Date.now();
  recordEvent({ scopeId: scope.id, scopeName: scope.name, kind: "llm", name: modelId, status: "start" });
  try {
    const res = await fn();
    recordEvent({ scopeId: scope.id, scopeName: scope.name, kind: "llm", name: modelId, status: "success", durationMs: Date.now() - start });
    return res;
  } catch (e) {
    recordEvent({ scopeId: scope.id, scopeName: scope.name, kind: "llm", name: modelId, status: "error", durationMs: Date.now() - start });
    throw e;
  } finally {
    closeScope(scope);
  }
}

// --- Adaptive hints (observe → inject → schedule) ---

export type AdaptiveHint = {
  toolParallelism: "observe_only" | "inject_hints" | "schedule";
  maxParallel: number;
  reason: string;
};

export function getAdaptiveHint(toolName?: string): AdaptiveHint {
  // Heurística simple: si latencia media > 800ms, sugerir paralelismo
  const all = [...adaptiveState.toolLatencies.values()].flat();
  const avg = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;
  if (avg > 1200) return { toolParallelism: "schedule", maxParallel: 3, reason: `avg ${avg.toFixed(0)}ms → schedule 3` };
  if (avg > 600) return { toolParallelism: "inject_hints", maxParallel: 2, reason: `avg ${avg.toFixed(0)}ms → hints 2` };
  return { toolParallelism: "observe_only", maxParallel: 2, reason: `avg ${avg.toFixed(0)}ms → observe` };
}

export function getAdaptiveStateSnapshot() {
  return {
    events: getRecentEvents(20),
    hints: getAdaptiveHint(),
    latencies: Object.fromEntries([...adaptiveState.toolLatencies.entries()].map(([k, v]) => [k, v.slice(-3)])),
  };
}
