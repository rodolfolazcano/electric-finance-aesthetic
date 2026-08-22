import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/lib/supabase";

const ContactSchema = z.object({
  nombre: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(100),
  email: z.string().email("Email inválido"),
  telefono: z.string().optional(),
  mensaje: z.string().min(10, "El mensaje debe tener al menos 10 caracteres").max(2000),
  consentimiento: z.literal(true, {
    errorMap: () => ({ message: "Debés aceptar los términos de privacidad" }),
  }),
  origen: z.string().optional(),
});

const NewsletterSchema = z.object({
  email: z.string().email("Email inválido"),
  consentimiento: z.literal(true, {
    errorMap: () => ({ message: "Debés aceptar los términos de privacidad" }),
  }),
  origen: z.string().optional(),
});

export type ContactInput = z.infer<typeof ContactSchema>;
export type NewsletterInput = z.infer<typeof NewsletterSchema>;

export type SubmitContactResult =
  | { success: true; id: string }
  | { success: false; error: string };

export type SubscribeNewsletterResult =
  | { success: true; email: string }
  | { success: false; error: string };

export const submitContactForm = createServerFn({ method: "POST" })
  .inputValidator((input: ContactInput) => ContactSchema.parse(input))
  .handler(async ({ data }): Promise<SubmitContactResult> => {
    try {
      const { data: inserted, error } = await supabase
        .from("leads")
        .insert({
          nombre: data.nombre,
          email: data.email,
          telefono: data.telefono ?? null,
          mensaje: data.mensaje,
          origen: data.origen ?? "",
          newsletter_opt_in: false,
          estado: "nuevo",
        })
        .select("id")
        .single();

      if (error) throw new Error(error.message);
      return { success: true, id: inserted.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al enviar el formulario";
      console.error("submitContactForm error:", msg);
      return { success: false, error: msg };
    }
  });

export const subscribeNewsletter = createServerFn({ method: "POST" })
  .inputValidator((input: NewsletterInput) => NewsletterSchema.parse(input))
  .handler(async ({ data }): Promise<SubscribeNewsletterResult> => {
    try {
      const { error } = await supabase.from("leads").insert({
        nombre: data.email.split("@")[0],
        email: data.email,
        newsletter_opt_in: true,
        origen: data.origen ?? "",
        estado: "nuevo",
      });
      if (error) console.error("subscribeNewsletter db error:", error.message);
    } catch (dbErr) {
      console.error("subscribeNewsletter db error:", dbErr);
    }

    const apiKey = process.env.MAILCHIMP_API_KEY;
    const listId = process.env.MAILCHIMP_LIST_ID;

    if (!apiKey || !listId) {
      console.warn("Mailchimp not configured — newsletter saved to Supabase only");
      return { success: true, email: data.email };
    }

    try {
      const dc = apiKey.includes("-") ? apiKey.split("-").pop()! : "us1";
      const encoded = Buffer.from(`apikey:${apiKey}`).toString("base64");

      const response = await fetch(
        `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${encoded}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email_address: data.email,
            status: "subscribed",
          }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const title = body?.title as string | undefined;
        if (title === "Member Exists") {
          return { success: true, email: data.email };
        }
        console.error("Mailchimp API error:", title, (body?.detail as string) ?? "");
      }
    } catch (mcErr) {
      console.error("Mailchimp API error:", mcErr);
    }

    return { success: true, email: data.email };
  });
