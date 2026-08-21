// @ts-nocheck
import { SITE } from "./site";

export interface SeoInput {
  /** Título de la página (sin el nombre de la marca; se apenda automáticamente). */
  title: string;
  /** Meta description (<= ~155 caracteres recomendado). */
  description?: string;
  /** Ruta relativa de la página, ej: "/herramientas". Usada para canonical y og:url. */
  path: string;
  /** Imagen OG opcional. Si no se pasa, usa SITE.defaultOgImage. */
  image?: string;
  /**
   * Robots. Por defecto "index, follow".
   * Usar "noindex, nofollow" para páginas internas (ej: /demo).
   */
  robots?: string;
  /** Título canónico exacto (sin append de marca). Raro usarlo. */
  rawTitle?: boolean;
}

const BRAND_SUFFIX = ` · ${SITE.name}`;

function fullTitle(title: string, raw?: boolean) {
  if (raw) return title;
  return `${title}${BRAND_SUFFIX}`;
}

/**
 * Genera el set completo de metatags (title, description, canonical, OG, Twitter)
 * a partir de un objeto simple. Devuelve un array listo para el `head().meta`
 * de TanStack Router, más el link canonical que debe ir en `head().links`.
 */
export function createMeta(input: SeoInput): {
  meta: Array<Record<string, string>>;
  links: Array<Record<string, string>>;
} {
  const description = input.description ?? SITE.description;
  const url = `${SITE.url}${input.path}`;
  const image = input.image ?? SITE.defaultOgImage;
  const title = fullTitle(input.title, input.rawTitle);
  const robots = input.robots ?? "index, follow";

  const meta: Array<Record<string, string>> = [
    { title },
    { name: "description", content: description },
    { name: "robots", content: robots },
    // Open Graph
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE.name },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { property: "og:locale", content: SITE.locale },
    // Twitter
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];

  const links: Array<Record<string, string>> = [{ rel: "canonical", href: url }];

  return { meta, links };
}
