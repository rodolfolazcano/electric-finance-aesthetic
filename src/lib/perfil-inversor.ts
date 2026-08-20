export const CLAVE_PERFIL_INVERSOR = "norte:perfil-inversor";
export const EVENTO_PERFIL_INVERSOR = "norte:perfil-inversor";

export type PerfilResultante = {
  id: "conservador" | "moderado" | "agresivo";
  nombre: "Conservador" | "Moderado" | "Agresivo";
};

export function leerPerfilInversor(): PerfilResultante | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CLAVE_PERFIL_INVERSOR);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PerfilResultante;
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.nombre !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function guardarPerfilInversor(perfil: PerfilResultante) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLAVE_PERFIL_INVERSOR, JSON.stringify(perfil));
    window.dispatchEvent(
      new CustomEvent<PerfilResultante>(EVENTO_PERFIL_INVERSOR, { detail: perfil }),
    );
  } catch {
    /* sin storage disponible */
  }
}

export function limpiarPerfilInversor() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CLAVE_PERFIL_INVERSOR);
    window.dispatchEvent(new CustomEvent(EVENTO_PERFIL_INVERSOR));
  } catch {
    /* sin storage disponible */
  }
}

export function suscribirPerfilInversor(
  handler: (perfil: PerfilResultante | null) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onChange = (e: Event) => {
    const detail = (e as CustomEvent<PerfilResultante>).detail;
    handler(detail ?? leerPerfilInversor());
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === CLAVE_PERFIL_INVERSOR) handler(leerPerfilInversor());
  };
  window.addEventListener(EVENTO_PERFIL_INVERSOR, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENTO_PERFIL_INVERSOR, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
