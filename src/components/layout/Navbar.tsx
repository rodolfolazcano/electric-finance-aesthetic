import { useState, useEffect } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";
import { IOLLoginButton } from "@/components/shared/IOLLoginButton";

interface NavItem {
  label: string;
  to: string;
  search?: Record<string, unknown>;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Inicio", to: "/" },
  { label: "Studio", to: "/studio" },
  { label: "Contacto", to: "/contacto" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const router = useRouter();
  const currentPath = router.state.location.pathname;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [currentPath]);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-background/60 backdrop-blur-2xl border-b border-border/60 shadow-lg shadow-black/10"
          : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5 group shrink-0" aria-label="Ir al inicio">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30 transition-all group-hover:ring-primary/60">
            <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_16px_var(--color-primary)]" />
          </span>
          <span className="text-base font-semibold tracking-tight">Coronar Inversiones</span>
        </Link>

        <nav aria-label="Navegación principal" className="hidden lg:flex items-center gap-1 ml-8">
          {NAV_ITEMS.map((item) => {
            const isActive = currentPath === item.to || (item.to !== "/" && currentPath.startsWith(item.to));
            return (
              <Link
                key={item.label}
                to={item.to}
                search={item.search}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1 px-3 py-2 text-sm transition-colors rounded-lg",
                  isActive
                    ? "text-foreground font-medium bg-muted/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <IOLLoginButton />
          <button
            onClick={() => setOpen(!open)}
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div
          id="mobile-menu"
          role="navigation"
          aria-label="Navegación principal"
          className="lg:hidden border-t border-border/60 glass-strong animate-in slide-in-from-top-2 duration-200"
        >
          <div className="mx-auto max-w-7xl px-5 py-4 space-y-1 sm:px-8">
            {NAV_ITEMS.map((item) => {
              const isActive = currentPath === item.to || (item.to !== "/" && currentPath.startsWith(item.to));
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  search={item.search}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center rounded-lg px-3 py-2.5 text-sm transition-colors",
                    isActive
                      ? "text-foreground font-medium bg-muted/40"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
                  )}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
            <div className="border-t border-border/20 pt-3 mt-3">
              <IOLLoginButton />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
