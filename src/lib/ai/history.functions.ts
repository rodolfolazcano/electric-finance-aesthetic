import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const listConversations = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  if (!supabaseAdmin) return { ok: false as const, error: "Supabase no configurado", items: [] };
  const { data, error } = await supabaseAdmin
    .from("conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return { ok: false as const, error: error.message, items: [] };
  return { ok: true as const, error: null, items: data ?? [] };
});

export const createConversation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ title: z.string().min(1).max(120).default("Nueva conversación") }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    if (!supabaseAdmin) return { ok: false as const, error: "Supabase no configurado" };
    const { data: row, error } = await supabaseAdmin
      .from("conversations")
      .insert({ title: data.title })
      .select("id, title, updated_at")
      .single();
    if (error || !row) return { ok: false as const, error: error?.message ?? "No se pudo crear" };
    return { ok: true as const, conversation: row };
  });

export const loadConversation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ conversationId: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    if (!supabaseAdmin) return { ok: false as const, error: "Supabase no configurado", messages: [], profile: [] };
    const [messages, profile] = await Promise.all([
      supabaseAdmin
        .from("messages")
        .select("id, role, content, provider, model, intent, created_at")
        .eq("conversation_id", data.conversationId)
        .order("created_at", { ascending: true })
        .limit(300),
      supabaseAdmin
        .from("session_profile")
        .select("key, value")
        .eq("conversation_id", data.conversationId),
    ]);
    return {
      ok: true as const,
      messages: messages.data ?? [],
      profile: profile.data ?? [],
    };
  });

export const appendMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        conversationId: z.string().min(1),
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        provider: z.string().nullable().optional(),
        model: z.string().nullable().optional(),
        intent: z.string().nullable().optional(),
        handoffSummary: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    if (!supabaseAdmin) return { ok: false as const, error: "Supabase no configurado" };
    const { error } = await supabaseAdmin.from("messages").insert({
      conversation_id: data.conversationId,
      role: data.role,
      content: data.content,
      provider: data.provider ?? null,
      model: data.model ?? null,
      intent: data.intent ?? null,
      handoff_summary: data.handoffSummary ?? null,
    });
    await supabaseAdmin
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.conversationId);
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });

export const renameConversation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ conversationId: z.string().min(1), title: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    if (!supabaseAdmin) return { ok: false as const, error: "Supabase no configurado" };
    await supabaseAdmin
      .from("conversations")
      .update({ title: data.title })
      .eq("id", data.conversationId);
    return { ok: true as const };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ conversationId: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    if (!supabaseAdmin) return { ok: false as const, error: "Supabase no configurado" };
    const { error } = await supabaseAdmin.from("conversations").delete().eq("id", data.conversationId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
