/**
 * Layout tokens compartidos — mantener sincronizado con:
 * - src/routes/herramientas.tsx (CONTAINER, ml-[252px]/ml-[64px], pt-16)
 * - src/components/herramientas/SidebarHerramientas.tsx (w-[252px]/w-[64px], top-16)
 *
 * Si se cambia aquí, actualizar ambos archivos. No usar valores hardcodeados sueltos.
 */
export const RAIL_WIDTH_EXPANDED = 252;
export const RAIL_WIDTH_COLLAPSED = 64;
export const HEADER_HEIGHT = 64; // top-16
export const CONTENT_PT = 64; // pt-16 — alineado con HEADER_HEIGHT para evitar gap
