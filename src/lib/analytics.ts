// @ts-nocheck
/**
 * Helper de Google Analytics 4 (GA4).
 *
 * El script de GA4 se inyecta de forma diferida en __root.tsx (solo producción).
 * Este módulo expone `trackEvent` para disparar eventos personalizados desde
 * cualquier parte de la app.
 *
 * Configurar el ID de medición con la variable de entorno VITE_GA4_MEASUREMENT_ID
 * (ver .env.example y README).
 */

export const GA4_MEASUREMENT_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID ?? "";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** Dispara un evento a GA4 si el script ya está cargado. */
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params ?? {});
}

/**
 * Eventos clave planeados para la Fase 2. Dejar preparado para conectar
 * cuando se implementen los respectivos flujos:
 *
 * - Contacto:    trackEvent("contact_form_submit", { origen: "footer" | "prospectar" })
 * - Newsletter:  trackEvent("newsletter_subscribe", { origen: "..." })
 * - Calculadoras:trackEvent("calculator_used", { calculadora: "optimizador" | "renta_fija" | "capm" | ... })
 * - Portafolio:  trackEvent("portfolio_loaded", { fuente: "iol" })
 *
 * Ejemplo de uso:
 *   import { trackEvent } from "@/lib/analytics";
 *   trackEvent("calculator_used", { calculadora: "optimizador" });
 */
export const PLANNED_EVENTS = {
  contactFormSubmit: (origen: string) => trackEvent("contact_form_submit", { origen }),
  newsletterSubscribe: (origen: string) => trackEvent("newsletter_subscribe", { origen }),
  calculatorUsed: (calculadora: string) => trackEvent("calculator_used", { calculadora }),
  calculatorExport: (calculadora: string) => trackEvent("calculator_export", { calculadora }),
  portfolioLoaded: (fuente: string) => trackEvent("portfolio_loaded", { fuente }),
} as const;
