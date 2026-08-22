/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL canónica del sitio (sin slash final). Usada para SEO/canonical/sitemap. */
  readonly VITE_SITE_URL?: string;
  /** ID de medición de Google Analytics 4 (G-XXXXXXXXXX). */
  readonly VITE_GA4_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
