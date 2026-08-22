import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Check,
  Shield,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Send,
  User,
  Mail,
  Phone,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";

type RiskProfile = "conservador" | "moderado" | "agresivo";
type Horizon = "corto" | "medio" | "largo";
type Experience = "nunca" | "poca" | "intermedia" | "avanzada";

const STEPS = ["Perfil", "Objetivos", "Contacto"];

const RISK_CARDS: { id: RiskProfile; label: string; desc: string; icon: typeof Shield }[] = [
  { id: "conservador", label: "Conservador", desc: "Priorizo preservar mi capital por sobre la rentabilidad", icon: Shield },
  { id: "moderado", label: "Moderado", desc: "Busco un equilibrio entre riesgo y retorno", icon: BarChart3 },
  { id: "agresivo", label: "Agresivo", desc: "Acepto mayor volatilidad para maximizar ganancias", icon: TrendingUp },
];

export function ProspectionWidget() {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<RiskProfile | null>(null);
  const [horizon, setHorizon] = useState<Horizon | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  const canNext = () => {
    if (step === 0) return profile !== null;
    if (step === 1) return horizon !== null && experience !== null;
    return name.length > 0 && email.length > 0;
  };

  const handleSubmit = async () => {
    setSending(true);
    await new Promise((r) => setTimeout(r, 1500));
    setSending(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="glass p-8 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/20 text-success">
          <Check className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-medium">¡Gracias, {name.split(" ")[0]}!</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Recibimos tus datos. En las próximas 24 hs hábiles te contactamos con un análisis
          personalizado según tu perfil {profile}.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-strong p-1 w-full max-w-lg mx-auto">
      {/* Stepper with progress bar */}
      <div className="px-6 pt-5 pb-4">
        <div className="flex items-center">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition-all duration-300",
                    i < step
                      ? "bg-primary text-primary-foreground shadow-glow"
                      : i === step
                        ? "bg-primary/20 text-primary ring-2 ring-primary/50"
                        : "bg-muted/40 text-muted-foreground",
                  )}
                >
                  {i < step ? <Check className="h-3 w-3" /> : i + 1}
                </div>
                <span
                  className={cn(
                    "mt-1 text-[10px] font-medium transition-colors hidden sm:inline",
                    i <= step ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-2 h-px flex-1 transition-colors duration-500",
                    i < step ? "bg-primary/60" : "bg-border/40",
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 pb-5 pt-1">
        {/* Step 0: Profile */}
        {step === 0 && (
          <div className="space-y-3 animate-in fade-in duration-300">
            <h3 className="text-sm font-medium">¿Cuál es tu perfil de riesgo?</h3>
            <p className="text-xs text-muted-foreground">Seleccioná la opción que mejor te describa</p>
            <div className="grid gap-2">
              {RISK_CARDS.map((card) => {
                const selected = profile === card.id;
                return (
                  <button
                    key={card.id}
                    onClick={() => setProfile(card.id)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all duration-200",
                      selected
                        ? "border-primary/60 bg-primary/[0.08] ring-1 ring-primary/40 shadow-[0_0_12px_var(--color-primary)/0.15]"
                        : "border-border/60 bg-muted/20 hover:border-primary/30 hover:bg-primary/[0.03] hover:shadow-[0_0_8px_var(--color-primary)/0.06]",
                    )}
                  >
                    <card.icon
                      className={cn(
                        "h-5 w-5 shrink-0 mt-0.5 transition-colors",
                        selected ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <div>
                      <div className="text-sm font-medium">{card.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{card.desc}</div>
                    </div>
                    {selected && (
                      <div className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 1: Goals */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <h3 className="text-sm font-medium">Contanos sobre tus objetivos</h3>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Horizontes de inversión</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: "corto" as Horizon, label: "Corto", sub: "< 1 año" },
                  { id: "medio" as Horizon, label: "Medio", sub: "1-5 años" },
                  { id: "largo" as Horizon, label: "Largo", sub: "> 5 años" },
                ]).map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setHorizon(h.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-all duration-200",
                      horizon === h.id
                        ? "border-primary/60 bg-primary/[0.08] ring-1 ring-primary/40"
                        : "border-border/60 bg-muted/20 hover:border-primary/30 hover:bg-primary/[0.03]",
                    )}
                  >
                    <span className="text-sm font-medium">{h.label}</span>
                    <span className="text-[10px] text-muted-foreground">{h.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Experiencia en inversiones</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: "nunca" as Experience, label: "Nunca invertí" },
                  { id: "poca" as Experience, label: "Poca experiencia" },
                  { id: "intermedia" as Experience, label: "Intermedia" },
                  { id: "avanzada" as Experience, label: "Avanzada" },
                ]).map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setExperience(e.id)}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-sm text-center transition-all duration-200",
                      experience === e.id
                        ? "border-primary/60 bg-primary/[0.08] ring-1 ring-primary/40"
                        : "border-border/60 bg-muted/20 hover:border-primary/30 hover:bg-primary/[0.03]",
                    )}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Contact */}
        {step === 2 && (
          <div className="space-y-3 animate-in fade-in duration-300">
            <h3 className="text-sm font-medium">Dejanos tus datos</h3>
            <p className="text-xs text-muted-foreground">
              Te enviamos un análisis personalizado sin costo
            </p>
            <div className="space-y-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre completo"
                  className="w-full rounded-xl border border-border/60 bg-muted/20 pl-9 pr-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-muted-foreground/50"
                />
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full rounded-xl border border-border/60 bg-muted/20 pl-9 pr-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-muted-foreground/50"
                />
              </div>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="WhatsApp (opcional)"
                  className="w-full rounded-xl border border-border/60 bg-muted/20 pl-9 pr-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-muted-foreground/50"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/60 flex items-start gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-warning" />
              Tus datos están protegidos. No compartimos información con terceros.
            </p>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between mt-5 pt-4 border-t border-border/40">
          {step > 0 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted/20"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Atrás
            </button>
          ) : (
            <div />
          )}

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canNext()}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-all",
                canNext()
                  ? "bg-primary text-primary-foreground hover:opacity-90 shadow-[0_0_12px_var(--color-primary)/0.25]"
                  : "bg-muted/40 text-muted-foreground/50 cursor-not-allowed",
              )}
            >
              Siguiente
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", canNext() && "group-hover:translate-x-0.5")} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canNext() || sending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-5 py-2 text-xs font-medium transition-all",
                canNext() && !sending
                  ? "bg-primary text-primary-foreground hover:opacity-90 shadow-[0_0_12px_var(--color-primary)/0.25]"
                  : "bg-muted/40 text-muted-foreground/50 cursor-not-allowed",
              )}
            >
              {sending ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Enviando...
                </span>
              ) : (
                <>
                  Recibir análisis
                  <Send className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
