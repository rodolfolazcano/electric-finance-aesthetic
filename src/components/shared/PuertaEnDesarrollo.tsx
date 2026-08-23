import { Link } from "@tanstack/react-router";
import { Lock, MessageCircle, Home, ShieldAlert } from "lucide-react";

const WHATSAPP =
  "https://wa.me/541162355944?text=Hola%20Cintia%2C%20quiero%20asesoramiento%20sobre%20inversiones";

export function PuertaEnDesarrollo() {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#04060b]/60 p-5 backdrop-blur-[3px]">
      <div className="glass w-full max-w-md rounded-3xl border border-border/60 p-8 text-center shadow-[0_0_80px_rgba(0,0,0,0.65)]">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
          <Lock className="h-7 w-7 text-primary" />
        </span>
        <h1 className="mt-5 font-display text-xl font-semibold tracking-tight">
          Herramientas en desarrollo
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Estamos puliendo esta sección antes de abrirla al público. Mientras tanto, la IA del
          sitio puede conversar con vos — pero está en desarrollo y puede cometer errores:
          verificá siempre los datos antes de tomar decisiones.
        </p>
        <p className="mt-3 inline-flex items-center justify-center gap-2 rounded-full border border-gold/30 bg-gold/[0.06] px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gold">
          <ShieldAlert className="h-3.5 w-3.5" /> Beta · puede contener errores
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link
            to="/"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border/50 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted/40"
          >
            <Home className="h-4 w-4" /> Volver al inicio
          </Link>
          <a
            href={WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <MessageCircle className="h-4 w-4" /> Hablar con Cintia
          </a>
        </div>
      </div>
    </div>
  );
}
