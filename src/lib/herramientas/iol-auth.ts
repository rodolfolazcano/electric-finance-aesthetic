// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export async function fetchTokens(
  payload: Record<string, string>,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | { error: string }> {
  try {
    const res = await fetch("https://api.invertironline.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; PortfolioOptimizer/1.0)",
      },
      body: new URLSearchParams(payload).toString(),
    });
    const text = await res.text();
    if (!text) {
      if (res.status === 401) return { error: "Credenciales IOL inválidas" };
      return { error: `IOL: respuesta vacía (HTTP ${res.status})` };
    }
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return { error: `IOL: respuesta no-JSON (HTTP ${res.status})` };
    }
    if (!res.ok) {
      const msg =
        (data.error_description as string) ??
        data.error ??
        (data.message as string) ??
        `HTTP ${res.status}`;
      return { error: res.status === 401 ? "Credenciales IOL inválidas" : msg };
    }
    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string,
      expiresIn: (data.expires_in as number) ?? 3600,
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export const iolLogin = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ username: z.string().min(1), password: z.string().min(1) }).parse(input),
  )
  .handler(
    async ({
      data,
    }): Promise<
      { accessToken: string; refreshToken: string; expiresIn: number } | { error: string }
    > => {
      return fetchTokens({
        username: data.username,
        password: data.password,
        grant_type: "password",
      });
    },
  );

export const iolRefresh = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ refreshToken: z.string().min(1) }).parse(input))
  .handler(
    async ({
      data,
    }): Promise<
      { accessToken: string; refreshToken: string; expiresIn: number } | { error: string }
    > => {
      return fetchTokens({ refresh_token: data.refreshToken, grant_type: "refresh_token" });
    },
  );

//  Legacy session-based API (for other features) 
interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const sessions = new Map<string, StoredSession>();

function generateId(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const iolLoginLegacy = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ username: z.string().min(1), password: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ sessionId: string } | { error: string }> => {
    const result = await fetchTokens({
      username: data.username,
      password: data.password,
      grant_type: "password",
    });
    if ("error" in result) return { error: result.error };
    const sessionId = generateId();
    sessions.set(sessionId, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: Date.now() + result.expiresIn * 1000 - 60_000,
    });
    return { sessionId };
  });

export const iolRefreshSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ sessionId: z.string() }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true } | { error: string }> => {
    const session = sessions.get(data.sessionId);
    if (!session) return { error: "Sesión no encontrada" };
    const result = await fetchTokens({
      refresh_token: session.refreshToken,
      grant_type: "refresh_token",
    });
    if ("error" in result) {
      sessions.delete(data.sessionId);
      return { error: result.error };
    }
    sessions.set(data.sessionId, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: Date.now() + result.expiresIn * 1000 - 60_000,
    });
    return { ok: true };
  });

export const iolLogout = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ sessionId: z.string() }).parse(input))
  .handler(async ({ data }) => {
    sessions.delete(data.sessionId);
    return { ok: true };
  });

export function getValidToken(sessionId: string): { token: string } | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() >= session.expiresAt) return null;
  return { token: session.accessToken };
}

export async function iolGetToken(sessionId: string): Promise<string> {
  const cached = getValidToken(sessionId);
  if (cached) return cached.token;

  const session = sessions.get(sessionId);
  if (!session) throw new Error("Sesion IOL no encontrada. Inicia sesion nuevamente.");

  const result = await fetchTokens({
    refresh_token: session.refreshToken,
    grant_type: "refresh_token",
  });
  if ("error" in result) {
    sessions.delete(sessionId);
    throw new Error(result.error);
  }
  sessions.set(sessionId, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: Date.now() + result.expiresIn * 1000 - 60_000,
  });
  return result.accessToken;
}
