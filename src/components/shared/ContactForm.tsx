import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { submitContactForm } from "@/lib/leads/contact.functions";
import { PLANNED_EVENTS } from "@/lib/analytics";

const formSchema = z.object({
  nombre: z.string().min(2, "Mínimo 2 caracteres").max(100),
  email: z.string().email("Email inválido"),
  telefono: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v : undefined)),
  mensaje: z.string().min(10, "Mínimo 10 caracteres").max(2000),
  consentimiento: z.literal(true, {
    errorMap: () => ({ message: "Debés aceptar los términos de privacidad" }),
  }),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  origen?: string;
};

export function ContactForm({ origen = "contacto" }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const submitFn = useServerFn(submitContactForm);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nombre: "",
      email: "",
      telefono: "",
      mensaje: "",
      consentimiento: false as unknown as true,
    },
  });

  async function onSubmit(values: FormValues) {
    const result = await submitFn({ data: { ...values, origen } });

    if (!result.success) {
      toast.error(result.error ?? "Error al enviar el formulario");
      return;
    }

    PLANNED_EVENTS.contactFormSubmit(origen);
    toast.success("Mensaje recibido. Te respondemos a la brevedad.");
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <svg
            className="h-6 w-6 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-base font-medium text-foreground">Mensaje enviado</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Gracias por escribirnos. Te vamos a responder a la brevedad.
        </p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="nombre"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl>
                  <Input placeholder="Tu nombre" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="tu@email.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="telefono"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Teléfono (opcional)</FormLabel>
              <FormControl>
                <Input placeholder="+54 11 1234 5678" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="mensaje"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mensaje</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Contanos en qué podemos ayudarte..."
                  className="min-h-[120px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="consentimiento"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-start gap-3">
                <FormControl>
                  <Checkbox
                    checked={field.value === true}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    className="mt-0.5"
                  />
                </FormControl>
                <label
                  htmlFor="consentimiento"
                  className="text-xs leading-relaxed text-muted-foreground cursor-pointer"
                  onClick={() => field.onChange(!field.value)}
                >
                  Acepto que Coronar Inversiones use mis datos para contactarme según su{" "}
                  <a href="#" className="underline underline-offset-2 hover:text-foreground">
                    política de privacidad
                  </a>
                  .
                </label>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="w-full"
        >
          {form.formState.isSubmitting ? "Enviando…" : "Enviar mensaje"}
        </Button>
      </form>
    </Form>
  );
}
