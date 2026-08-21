// Sandbox de ejecución server-side para los scripts de análisis.
// Corre en el runtime del servidor: sin red, sin filesystem, sin globals del
// host y con timeout duro. Devuelve logs, tablas y el valor de retorno.

export type SandboxFile = { name: string; kind: string; text: string };

export type SandboxResult = {
  ok: boolean;
  logs: string[];
  tables: Array<{ rows: Array<Record<string, string | number | boolean | null>> }>;
  output: string;
  error: string | null;
  durationMs: number;
};

const TIMEOUT_MS = 15_000;
const MAX_LOGS = 500;
const MAX_OUTPUT_CHARS = 40_000;

/** Identificadores prohibidos: nada de red, host ni escape del sandbox. */
const BANNED = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "import",
  "require",
  "process",
  "globalThis",
  "window",
  "document",
  "eval",
  "Function",
  "WebAssembly",
  "Deno",
  "Bun",
];

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Ejecuta JavaScript generado por el modelo. El script recibe `files`, `log()`
 * y `table()`, y devuelve un valor con `return`.
 */
export async function runSandbox(input: {
  code: string;
  files: SandboxFile[];
  language?: "javascript" | "python";
}): Promise<SandboxResult> {
  const started = Date.now();
  const logs: string[] = [];
  const tables: SandboxResult["tables"] = [];

  const fail = (error: string): SandboxResult => ({
    ok: false,
    logs,
    tables,
    output: "",
    error,
    durationMs: Date.now() - started,
  });

  if (input.language === "python") {
    return fail(
      "El sandbox del servidor ejecuta JavaScript. Pedí el análisis en JavaScript y lo corro acá mismo.",
    );
  }

  const offending = BANNED.filter((token) =>
    new RegExp(`(^|[^\\w$.])${token}\\s*[(.[]`).test(input.code),
  );
  if (offending.length) {
    return fail(
      `El script usa APIs no permitidas en el sandbox: ${offending.join(", ")}. Debe trabajar solo con \`files\`.`,
    );
  }

  const log = (...args: unknown[]) => {
    if (logs.length >= MAX_LOGS) return;
    logs.push(args.map(stringify).join(" "));
  };
  const table = (rows: unknown) => {
    if (!Array.isArray(rows)) return;
    tables.push({
      rows: rows.map((row) => {
        const flat: Record<string, string | number | boolean | null> = {};
        for (const [key, value] of Object.entries((row ?? {}) as Record<string, unknown>)) {
          flat[key] =
            value === null || ["string", "number", "boolean"].includes(typeof value)
              ? (value as string | number | boolean | null)
              : stringify(value);
        }
        return flat;
      }),
    });
  };

  // Sombreamos los globals peligrosos con `undefined` dentro del scope del
  // script: aunque el chequeo estático falle, no hay handle al host.
  const shadowed = BANNED.filter((name) => /^[A-Za-z_$][\w$]*$/.test(name) && name !== "import");

  let factory: (...args: unknown[]) => unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
      ...args: string[]
    ) => (...callArgs: unknown[]) => Promise<unknown>;
    factory = new AsyncFunction(
      "files",
      "log",
      "table",
      ...shadowed,
      `"use strict";\n${input.code}`,
    );
  } catch (error) {
    return fail(`Error de sintaxis: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const value = await Promise.race([
      Promise.resolve(
        (factory as (...args: unknown[]) => Promise<unknown>)(
          input.files,
          log,
          table,
          ...shadowed.map(() => undefined),
        ),
      ),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout: el script superó ${TIMEOUT_MS / 1000}s`)),
          TIMEOUT_MS,
        ),
      ),
    ]);
    return {
      ok: true,
      logs,
      tables,
      output: stringify(value ?? "").slice(0, MAX_OUTPUT_CHARS),
      error: null,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return fail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  }
}
