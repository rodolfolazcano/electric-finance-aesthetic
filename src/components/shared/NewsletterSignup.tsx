import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { subscribeNewsletter } from "@/lib/leads/contact.functions";
import { PLANNED_EVENTS } from "@/lib/analytics";

const formSchema = z.object({
  email: z.string().email("Email inválido"),
  consentimiento: z.literal(true, {
    errorMap: () => ({ message: "Debés aceptar los términos" }),
  }),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  origen?: string;
  title?: string;
  subtitle?: string;
  variant?: "default" | "compact";
};

export function NewsletterSignup({
  origen = "newsletter",
  title = "Recibí novedades",
  subtitle = "Análisis, herramientas y oportunidades de inversión sin spam.",
  variant = "default",
}: Props) {
  const [submitted, setSubmitted] = useState(false);
  const subscribeFn = useServerFn(subscribeNewsletter);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      consentimiento: false as unknown as true,
    },
  });

  async function onSubmit(values: FormValues) {
    const result = await subscribeFn({ data: { ...values, origen } });

    if (!result.success) {
      toast.error(result.error ?? "Error al suscribirte");
      return;
    }

    PLANNED_EVENTS.newsletterSubscribe(origen);
    toast.success("¡Suscripto correctamente!");
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div
        className={
          variant === "compact"
            ? "text-sm text-muted-foreground"
            : "rounded-xl border border-primary/20 bg-primary/5 p-6 text-center"
        }
      >
        <p className="font-medium text-foreground">✓ Suscripto correctamente</p>
        {variant !== "compact" && (
          <p className="mt-1 text-sm text-muted-foreground">
            Te vamos a mantener al tanto de novedades.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      {variant === "default" && (
        <>
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className={variant === "compact" ? "flex flex-col gap-2" : "mt-3 space-y-3"}>
        <Input
          type="email"
          placeholder="tu@email.com"
          {...form.register("email")}
          className={
            variant === "compact"
              ? "h-8 text-xs"
              : ""
          }
        />
        {form.formState.errors.email && (
          <p className="text-[0.75rem] font-medium text-destructive">
            {form.formState.errors.email.message}
          </p>
        )}

        <div className="flex items-start gap-2">
          <Checkbox
            id={`newsletter-consent-${origen}`}
            checked={form.watch("consentimiento") === true}
            onCheckedChange={(checked) =>
              form.setValue("consentimiento", checked === true ? (true as true) : (false as unknown as true))
            }
            className="mt-0.5"
          />
          <label
            htmlFor={`newsletter-consent-${origen}`}
            className="text-[10px] leading-relaxed text-muted-foreground cursor-pointer"
          >
            Acepto recibir novedades y la{" "}
            <a href="#" className="underline underline-offset-2 hover:text-foreground">
              política de privacidad
            </a>
            .
          </label>
        </div>
        {form.formState.errors.consentimiento && (
          <p className="text-[0.75rem] font-medium text-destructive">
            {form.formState.errors.consentimiento.message}
          </p>
        )}

        <Button
          type="submit"
          size={variant === "compact" ? "sm" : "default"}
          disabled={form.formState.isSubmitting}
          className={variant === "compact" ? "w-full h-8 text-xs" : "w-full"}
        >
          {form.formState.isSubmitting
            ? "Suscribiendo…"
            : variant === "compact"
              ? "Suscribirme"
              : "Suscribirme al newsletter"}
        </Button>
      </form>
    </div>
  );
}
