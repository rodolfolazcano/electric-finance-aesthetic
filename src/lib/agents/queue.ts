/**
 * Cola de respuestas del sistema multi-agente.
 *
 * Permite encolar trabajos y despacharlos a distintos agentes con un límite de
 * concurrencia. Los trabajos que no alcanzan el cupo quedan en cola y se
 * procesan apenas se libera un slot. Es la base para que varios agentes
 * especializados respondan en paralelo y rápido, sin bloquear el hilo de
 * streaming de la respuesta.
 */

export type Trabajo<T> = () => Promise<T>;

export class ColaDeTareas {
  private pendientes: Array<() => void> = [];
  private activos = 0;

  constructor(private readonly maxConcurrentes = 3) {}

  /** Encola un trabajo y devuelve una promesa que resuelve cuando termina. */
  enqueue<T>(trabajo: Trabajo<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pendientes.push(async () => {
        try {
          resolve(await trabajo());
        } catch (err) {
          reject(err);
        } finally {
          this.activos -= 1;
          this.bombear();
        }
      });
      this.bombear();
    });
  }

  /** Devuelve la cantidad de trabajos encolados (sin contar los en curso). */
  get pendiente(): number {
    return this.pendientes.length;
  }

  private bombear() {
    while (this.activos < this.maxConcurrentes && this.pendientes.length > 0) {
      const tarea = this.pendientes.shift();
      if (!tarea) return;
      this.activos += 1;
      // Se dispara sin await: el manejo de resolución queda en la promesa interna.
      void Promise.resolve().then(tarea);
    }
  }
}
