// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const segmentSchema = z.enum(["reference", "data"]);

export type ContextSegment = z.infer<typeof segmentSchema>;

export type ContextItemRow = {
  id: string;
  conversation_id: string | null;
  segment: string;
  source: string;
  name: string;
  kind: string;
  url: string | null;
  text_content: string;
  active: boolean;
  created_at: string;
};

export const listContextItems = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ conversationId: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    if (!supabaseAdmin) return { ok: false as const, error: "Supabase no configurado", items: [] as ContextItemRow[] };
    const { data: rows, error } = await supabaseAdmin
      .from("context_items")
      .select("id, conversation_id, segment, source, name, kind, url, text_content, active, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    if (error) return { ok: false as const, error: error.message, items: [] as ContextItemRow[] };
    return { ok: true as const, error: null, items: (rows ?? []) as ContextItemRow[] };
  });

export const saveContextItem = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        conversationId: z.string().min(1),
        segment: segmentSchema.default("data"),
        source: z.enum(["file", "paste", "web", "answer"]).default("file"),
        name: z.string().min(1).max(200),
        kind: z.string().default("txt"),
        url: z.string().nullable().optional(),
        text: z.string().default(""),
        active: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    if (!supabaseAdmin) return { ok: false as const, error: "Supabase no configurado" };
    const { data: row, error } = await supabaseAdmin
      .from("context_items")
      .insert({
        conversation_id: data.conversationId,
        segment: data.segment,
        source: data.source,
        name: data.name,
        kind: data.kind,
        url: data.url ?? null,
        text_content: data.text,
        active: data.active,
      })
      .select("id, conversation_id, segment, source, name, kind, url, text_content, active, created_at")
      .single();
    if (error || !row) return { ok: false as const, error: error?.message ?? "No se pudo guardar" };
    return { ok: true as const, item: row as ContextItemRow };
  });

export const setContextItemActive = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().min(1), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    if (!supabaseAdmin) return { ok: false as const, error: "Supabase no configurado" };
    const { error } = await supabaseAdmin
      .from("context_items")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });

export const deleteContextItem = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    if (!supabaseAdmin) return { ok: false as const, error: "Supabase no configurado" };
    const { error } = await supabaseAdmin.from("context_items").delete().eq("id", data.id);
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });

export const saveLearningNote = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        conversationId: z.string().nullable().optional(),
        prompt: z.string().default(""),
        answer: z.string().min(1),
        tags: z.array(z.string()).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    if (!supabaseAdmin) return { ok: false as const, error: "Supabase no configurado" };
    const { error } = await supabaseAdmin.from("learning_notes").insert({
      conversation_id: data.conversationId ?? null,
      prompt: data.prompt.slice(0, 4000),
      answer: data.answer.slice(0, 12000),
      tags: data.tags,
    });
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });

export const listLearningNotes = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  if (!supabaseAdmin) return { ok: false as const, error: "Supabase no configurado", items: [] };
  const { data, error } = await supabaseAdmin
    .from("learning_notes")
    .select("id, prompt, answer, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return { ok: false as const, error: error.message, items: [] };
  return { ok: true as const, error: null, items: data ?? [] };
});

//  Session snapshots (save/load full session state) 

const sessionSnapshotSchema = z.object({
  sessionId: z.string().min(1),
  title: z.string().default("Sin titulo"),
  files: z.string().default("[]"),   // JSON stringified StudioFile[]
  turns: z.string().default("[]"),   // JSON stringified chat turns
  slide: z.string().nullable().optional(),  // JSON stringified SlideSpec | null
});

export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>;

export const saveSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => sessionSnapshotSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    if (!supabaseAdmin) return { ok: false as const, error: "Supabase no configurado" };
    const { error } = await supabaseAdmin.from("studio_sessions").upsert(
      {
        id: data.sessionId,
        title: data.title,
        files_json: data.files,
        turns_json: data.turns,
        slide_json: data.slide ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });

export const loadSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ sessionId: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    if (!supabaseAdmin) return { ok: false as const, error: "Supabase no configurado", session: null };
    const { data: row, error } = await supabaseAdmin
      .from("studio_sessions")
      .select("id, title, files_json, turns_json, slide_json, updated_at")
      .eq("id", data.sessionId)
      .limit(1)
      .single();
    if (error || !row) return { ok: false as const, error: error?.message ?? "No encontrada", session: null };
    return {
      ok: true as const,
      session: {
        id: row.id,
        title: row.title,
        files: JSON.parse(row.files_json ?? "[]"),
        turns: JSON.parse(row.turns_json ?? "[]"),
        slide: row.slide_json ? JSON.parse(row.slide_json) : null,
      },
    };
  });

export const listSessions = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  if (!supabaseAdmin) return { ok: false as const, error: "Supabase no configurado", sessions: [] };
  const { data, error } = await supabaseAdmin
    .from("studio_sessions")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return { ok: false as const, error: error.message, sessions: [] };
  return { ok: true as const, sessions: data ?? [] };
});

export const deleteSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ sessionId: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    if (!supabaseAdmin) return { ok: false as const, error: "Supabase no configurado" };
    const { error: e1 } = await supabaseAdmin.from("studio_sessions").delete().eq("id", data.sessionId);
    const { error: e2 } = await supabaseAdmin.from("context_items").delete().eq("conversation_id", data.sessionId);
    return (e1 || e2) ? { ok: false as const, error: (e1?.message ?? "") + (e2?.message ?? "") } : { ok: true as const };
  });
