import type { ReactNode } from "react";

/**
 * Marcador de sección. El widget flotante de IA que seguía al mouse quedó
 * deshabilitado porque interfería con la interacción; las secciones siguen
 * renderizando su contenido normalmente.
 */
export function SugerenciasSeccion({
  children,
  className = "",
}: {
  id: string;
  label: string;
  contenido: string;
  fallbackPregunta?: string;
  children: ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}