// @ts-nocheck
/**
 * Configuración central del sitio para SEO (metatags, canonical, og, schema.org).
 *
 * Toda la info que falte en producción se deja como placeholder claro para que
 * sea completada por el equipo de marketing/producto.
 *
 * Para setear la URL canónica real usar la variable de entorno VITE_SITE_URL
 * (ver .env.example). Si no se define, se usa el placeholder por defecto.
 */

const SITE_URL = import.meta.env.VITE_SITE_URL?.replace(/\/$/, "") ?? "https://coronarinversiones.com";

export const SITE = {
  name: "Coronar Inversiones",
  /** URL canónica base del sitio (sin slash final). */
  url: SITE_URL,
  /** Idioma principal. */
  locale: "es_AR",
  twitter: "@coronarinversiones",
  /** Imagen OG por defecto (1200x630). Colocar el archivo en public/og-image.png */
  defaultOgImage: `${SITE_URL}/og-image.png`,
  description:
    "Optimización de portafolios y análisis técnico/fundamental con datos en vivo de BCBA, NYSE y NASDAQ.",
  /** Redes sociales para el schema Organization (placeholders). */
  social: {
    linkedin: "https://www.linkedin.com/company/coronar-inversiones",
    twitter: "https://twitter.com/coronarinversiones",
    instagram: "https://www.instagram.com/coronarinversiones",
    youtube: "",
  },
  /** Datos de contacto (placeholders — completar con info real). */
  contact: {
    email: "contacto@coronarinversiones.com",
    /** Teléfono/WhatsApp en formato E.164, ej: "+5491112345678". */
    phone: "",
    /** Dirección física opcional. */
    address: "",
  },
  /** Ruta al logo (PNG/SVG cuadrado >= 112px para el schema Organization). */
  logo: `${SITE_URL}/logo.png`,
} as const;

/**
 * Rutas públicas indexables. Se usa para el sitemap y como base de canonicales.
 * `changefreq` y `priority` son sugerencias para el sitemap.xml.
 */
export interface RouteDef {
  path: string;
  changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: number;
  /** Si es false, la ruta NO se incluye en el sitemap. */
  indexable: boolean;
}

export const PUBLIC_ROUTES: RouteDef[] = [
  { path: "/", changefreq: "weekly", priority: 1.0, indexable: true },
  { path: "/herramientas", changefreq: "weekly", priority: 0.9, indexable: true },
  { path: "/planificacion", changefreq: "weekly", priority: 0.8, indexable: true },
  { path: "/contacto", changefreq: "monthly", priority: 0.7, indexable: true },
  // /demo es una playground interna: no se indexa ni aparece en el sitemap.
  { path: "/demo", changefreq: "yearly", priority: 0.0, indexable: false },
];
