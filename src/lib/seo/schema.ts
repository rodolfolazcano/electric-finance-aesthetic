import type { JSX } from "react";
import { SITE } from "./site";

/**
 * Helpers tipados para generar JSON-LD (schema.org) y convertirlos en el
 * formato que acepta `head().scripts` de TanStack Router.
 *
 * Uso:
 *   head: () => ({
 *     scripts: [jsonLdScript(organizationSchema())],
 *   })
 */

export function jsonLdScript(schema: unknown): JSX.IntrinsicElements["script"] {
  return {
    type: "application/ld+json",
    children: JSON.stringify(schema),
  } as JSX.IntrinsicElements["script"];
}

/** Schema Organization para inyectar en el root (marca, contacto, redes). */
export function organizationSchema() {
  const sameAs = (Object.values(SITE.social).filter(Boolean) as string[]).concat(
    `https://${SITE.url.replace(/^https?:\/\//, "")}`,
  );

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.url,
    logo: SITE.logo,
    description: SITE.description,
    sameAs: [...new Set(sameAs)],
  };

  // Solo agregamos contactPoint si hay al menos un dato de contacto real.
  const contactPoints: Record<string, string>[] = [];
  if (SITE.contact.email) {
    contactPoints.push({ "@type": "ContactPoint", email: SITE.contact.email, contactType: "customer support" });
  }
  if (SITE.contact.phone) {
    contactPoints.push({
      "@type": "ContactPoint",
      telephone: SITE.contact.phone,
      contactType: "customer support",
    });
  }
  if (contactPoints.length > 0) schema.contactPoint = contactPoints;

  return schema;
}

export interface FaqItem {
  question: string;
  answer: string;
}

/** Schema FAQPage. Usar cuando se agregue una sección de preguntas frecuentes. */
export function faqPageSchema(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: it.answer,
      },
    })),
  };
}

export interface ArticleInput {
  headline: string;
  description: string;
  datePublished: string; // ISO 8601
  dateModified?: string; // ISO 8601
  authorName: string;
  image?: string;
  path: string;
}

/** Schema Article, listo para futuros posts de blog. */
export function articleSchema(input: ArticleInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.headline,
    description: input.description,
    image: input.image ?? SITE.defaultOgImage,
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    author: { "@type": "Person", name: input.authorName },
    publisher: {
      "@type": "Organization",
      name: SITE.name,
      logo: { "@type": "ImageObject", url: SITE.logo },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE.url}${input.path}` },
  };
}
