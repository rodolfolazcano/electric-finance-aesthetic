/**
 * Memoria de sesión del sistema multi-agente de IA.
 *
 * Replica el patrón de la skill oficial `nemo-rl-session-memory` de NVIDIA
 * (skills-main): mantener un registro durable y legible del estado de trabajo
 * para que cualquier agente retome con contexto mínimo.
 *
 * Por sesión se persiste:
 * - estado.json  → resumen de la sesión (objetivo, subtareas, notas, hechos).
 * - timeline.md  → log append-only de cada turno.
 * - pizarra.json → pizarra compartida entre agentes del turno en curso.
 *
 * Si el filesystem no está disponible (ej. edge runtime), cae a memoria en
 * proceso sin romper el flujo.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const DIR_RAIZ = path.join(process.cwd(), ".norte-memoria");

export type Hecho = { texto: string; turno: number };

export type EstadoSesion = {
  objetivo?: string;
  subtarea?: string;
  turno: number;
  notas?: string[];
  hechos: Hecho[];
  preferencias?: string[];
};

export type EntradaTimeline = {
  cuando: string;
  rol: "usuario" | "agente" | "sistema";
  texto: string;
};

export type PizarraEntrada = {
  desde: string;
  hacia: string | "coord";
  texto: string;
};

const CACHE = new Map<string, MemoriaDeSesion>();

export class MemoriaDeSesion {
  private estado: EstadoSesion = { turno: 0, hechos: [] };
  private timeline: EntradaTimeline[] = [];
  private pizarra: PizarraEntrada[] = [];
  private dirty = false;

  private constructor(private readonly sessionId: string) {}

  static obtener(sessionId: string): MemoriaDeSesion {
    const existente = CACHE.get(sessionId);
    if (existente) return existente;
    const nueva = new MemoriaDeSesion(sessionId);
    CACHE.set(sessionId, nueva);
    void nueva.cargar();
    return nueva;
  }

  private dir() {
    return path.join(DIR_RAIZ, this.sessionId);
  }

  private async cargar() {
    try {
      const base = this.dir();
      const [estadoRaw, timelineRaw, pizarraRaw] = await Promise.all([
        fs.readFile(path.join(base, "estado.json"), "utf-8").catch(() => ""),
        fs.readFile(path.join(base, "timeline.md"), "utf-8").catch(() => ""),
        fs.readFile(path.join(base, "pizarra.json"), "utf-8").catch(() => ""),
      ]);
      if (estadoRaw) {
        const parseado = JSON.parse(estadoRaw) as EstadoSesion;
        if (parseado && typeof parseado.turno === "number") this.estado = parseado;
      }
      this.timeline = timelineRaw
        .split("\n")
        .filter((l) => l.startsWith("- "))
        .map((l) => {
          const m = l.match(/^-\s+\[(.+?)\]\s+\((\w+)\)\s+(.*)$/);
          if (!m) return null;
          return { cuando: m[1]!, rol: m[2]! as EntradaTimeline["rol"], texto: m[3]! };
        })
        .filter((x): x is EntradaTimeline => x !== null);
      if (pizarraRaw) {
        const p = JSON.parse(pizarraRaw) as PizarraEntrada[];
        if (Array.isArray(p)) this.pizarra = p;
      }
    } catch {
      /* sin persistencia: se sigue en memoria */
    }
  }

  private async guardar() {
    if (!this.dirty) return;
    try {
      const base = this.dir();
      await fs.mkdir(base, { recursive: true });
      const timelineMd = this.timeline
        .map((t) => `- [${t.cuando}] (${t.rol}) ${t.texto.replace(/\n/g, " ")}`)
        .join("\n");
      await Promise.all([
        fs.writeFile(path.join(base, "estado.json"), JSON.stringify(this.estado, null, 2), "utf-8"),
        fs.writeFile(path.join(base, "timeline.md"), timelineMd || "", "utf-8"),
        fs.writeFile(
          path.join(base, "pizarra.json"),
          JSON.stringify(this.pizarra, null, 2),
          "utf-8",
        ),
      ]);
      this.dirty = false;
    } catch {
      /* sin persistencia */
    }
  }

  /** Registra un turno nuevo y lo marca en el timeline. Devuelve el número de turno. */
  nuevoTurno(): number {
    this.estado.turno += 1;
    this.dirty = true;
    return this.estado.turno;
  }

  agregarTimeline(entrada: Omit<EntradaTimeline, "cuando">) {
    this.timeline.push({ ...entrada, cuando: new Date().toISOString() });
    this.dirty = true;
  }

  /** Suma un hecho durable a la memoria de la sesión (lo que el usuario declaró). */
  recordar(texto: string) {
    const turno = this.estado.turno;
    const existente = this.estado.hechos.find((h) => h.texto === texto);
    if (!existente) {
      this.estado.hechos.push({ texto, turno });
      this.dirty = true;
    }
  }

  /** Un agente escribe en la pizarra compartida (visible para el coordinador y el redactor). */
  escribirPizarra(entrada: PizarraEntrada) {
    this.pizarra.push(entrada);
    if (this.pizarra.length > 80) this.pizarra = this.pizarra.slice(-80);
    this.dirty = true;
  }

  /** Deja que un agente lea lo que otros escribieron en la pizarra (interacción entre agentes). */
  leerPizarra(): PizarraEntrada[] {
    return [...this.pizarra];
  }

  leerHechos(): Hecho[] {
    return [...this.estado.hechos];
  }

  setEstado(patch: Partial<EstadoSesion>) {
    this.estado = { ...this.estado, ...patch };
    this.dirty = true;
  }

  /** Texto compacto que se inyecta al prompt de cada agente al inicio del turno. */
  contextoMemoria(): string {
    const hechos = this.estado.hechos
      .slice(-12)
      .map((h) => `- ${h.texto}`)
      .join("\n");
    const preferencias = (this.estado.preferencias ?? [])
      .slice(-6)
      .map((p) => `- ${p}`)
      .join("\n");
    const lineas: string[] = [];
    if (this.estado.objetivo) lineas.push(`Objetivo de la conversación: ${this.estado.objetivo}`);
    if (hechos) lineas.push(`Lo que el usuario contó en la sesión:\n${hechos}`);
    if (preferencias) lineas.push(`Preferencias registradas:\n${preferencias}`);
    if (!lineas.length) return "";
    return `## MEMORIA DE LA SESIÓN (persistente entre turnos)\n${lineas.join("\n\n")}`;
  }

  /** Resumen del timeline reciente para el coordinador. */
  resumenTimeline(max = 6): string {
    return this.timeline
      .slice(-max)
      .map((t) => `[${t.rol}] ${t.texto.replace(/\n/g, " ").slice(0, 220)}`)
      .join("\n");
  }

  /** Limpia toda la memoria de la sesión (botón "nueva conversación"). */
  async reiniciar() {
    this.estado = { turno: 0, hechos: [] };
    this.timeline = [];
    this.pizarra = [];
    this.dirty = true;
    CACHE.delete(this.sessionId);
    try {
      await fs.rm(this.dir(), { recursive: true, force: true });
    } catch {
      /* sin persistencia */
    }
  }

  /** Persiste si hay cambios pendientes. Llamar al cerrar el turno. */
  cerrarTurno() {
    void this.guardar();
  }
}
