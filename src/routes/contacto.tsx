import { createFileRoute } from "@tanstack/react-router";
import { Mail, MessageCircle } from "lucide-react";
import { createMeta } from "@/lib/seo/meta";
import { ContactForm } from "@/components/shared/ContactForm";
import { NewsletterSignup } from "@/components/shared/NewsletterSignup";

export const Route = createFileRoute("/contacto")({
  validateSearch: (search: Record<string, unknown>) => ({
    origen: (search.origen as string) || undefined,
  }),
  head: () => {
    const { meta, links } = createMeta({
      title: "Contacto",
      description:
        "Escribinos para consultas sobre nuestras herramientas de análisis, optimización de carteras y datos de mercado.",
      path: "/contacto",
    });
    return { meta, links };
  },
  component: ContactoPage,
});

function ContactoPage() {
  const { origen } = Route.useSearch();
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.2fr]">
        {/* Left: info + alternate channels */}
        <div>
          <h1 className="text-3xl font-light tracking-tight sm:text-4xl">
            Hablemos de tu{" "}
            <span className="italic text-primary">cartera</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
            Completá el formulario y te respondemos a la brevedad. También podés
            contactarnos directamente por los siguientes canales:
          </p>

          <div className="mt-8 space-y-4">
            <a
              href="mailto:contacto@coronarinversiones.com"
              className="glass inline-flex items-center gap-3 rounded-xl p-4 transition-colors hover:border-primary/30"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">Email</div>
                <div className="text-xs text-muted-foreground">contacto@coronarinversiones.com</div>
              </div>
            </a>

            <a
              href="https://wa.me/5491123456789"
              target="_blank"
              rel="noopener noreferrer"
              className="glass inline-flex items-center gap-3 rounded-xl p-4 transition-colors hover:border-[#25D366]/30"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#25D366]/10 text-[#25D366]">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">WhatsApp</div>
                <div className="text-xs text-muted-foreground">Respuesta rápida</div>
              </div>
            </a>
          </div>

          <div className="mt-10">
            <NewsletterSignup
              origen="contacto-page"
              title="¿Querés recibir novedades?"
              subtitle="Análisis semanal, herramientas nuevas y oportunidades de inversión."
            />
          </div>
        </div>

        {/* Right: contact form */}
        <div className="glass p-6 sm:p-8">
          <h2 className="text-lg font-medium text-foreground">Enviar mensaje</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Todos los campos marcados con * son obligatorios.
          </p>
          <div className="mt-6">
            <ContactForm origen={origen || "contacto-page"} />
          </div>
        </div>
      </div>
    </div>
  );
}
