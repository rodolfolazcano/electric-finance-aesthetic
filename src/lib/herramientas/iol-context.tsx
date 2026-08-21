// @ts-nocheck
"use client";
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { iolLogin } from "@/lib/herramientas/iol-auth";

interface IOLCtx {
  accessToken: string | null;
  refreshToken: string | null;
  username: string;
  isLoggingIn: boolean;
  isTokenExpired: boolean;
  login: (user: string, pass: string) => Promise<string | null>;
  logout: () => void;
  updateTokens: (token: string, refreshToken: string) => void;
}

const IOLContext = createContext<IOLCtx>({
  accessToken: null,
  refreshToken: null,
  username: "",
  isLoggingIn: false,
  isTokenExpired: false,
  login: async () => null,
  logout: () => {},
  updateTokens: () => {},
});

function ls(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch { /* noop */ }
}

const EXPIRES_KEY = "iol_expires_at";

function isStoredTokenExpired(): boolean {
  const exp = ls(EXPIRES_KEY);
  if (!exp) return true; // no expiry stored Ã¢â€ â€™ treat as expired
  return Date.now() > parseInt(exp, 10);
}

export function IOLProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [username, setUsername] = useState("");

  // Hydrate from localStorage after mount (evita hydration mismatch SSR)
  useEffect(() => {
    if (!isStoredTokenExpired()) {
      setAccessToken(ls("iol_bearer_token"));
      setRefreshToken(ls("iol_refresh_token"));
      setUsername(ls("iol_user") ?? "");
    }
  }, []);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const loginFn = useServerFn(iolLogin);

  // Limpiar tokens si estÃƒÂ¡n expirados al montar
  useEffect(() => {
    if (isStoredTokenExpired() && ls("iol_bearer_token")) {
      lsSet("iol_bearer_token", null);
      lsSet("iol_refresh_token", null);
      lsSet("iol_user", null);
      lsSet(EXPIRES_KEY, null);
    }
  }, []);

  const isTokenExpired = !accessToken && !isStoredTokenExpired() === false;

  const syncTokenToLS = useCallback((token: string | null, rt: string | null, expiresIn?: number, user?: string) => {
    lsSet("iol_bearer_token", token);
    lsSet("iol_refresh_token", rt);
    if (expiresIn) lsSet(EXPIRES_KEY, String(Date.now() + expiresIn * 1000 - 120_000)); // 2 min margin
    else if (!token) lsSet(EXPIRES_KEY, null);
    if (user !== undefined) lsSet("iol_user", user ?? null);
  }, []);

  const login = useCallback(
    async (user: string, pass: string): Promise<string | null> => {
      setIsLoggingIn(true);
      try {
        const result = await loginFn({ data: { username: user, password: pass } });
        if ("error" in result) return result.error;
        setAccessToken(result.accessToken);
        setRefreshToken(result.refreshToken);
        setUsername(user);
        syncTokenToLS(result.accessToken, result.refreshToken, result.expiresIn, user);
        return null;
      } catch {
        return "Error al conectar con IOL";
      } finally {
        setIsLoggingIn(false);
      }
    },
    [loginFn, syncTokenToLS],
  );

  const logout = useCallback(() => {
    setAccessToken(null);
    setRefreshToken(null);
    setUsername("");
    syncTokenToLS(null, null);
  }, [syncTokenToLS]);

  const updateTokens = useCallback(
    (token: string, rt: string) => {
      setAccessToken(token);
      setRefreshToken(rt);
      syncTokenToLS(token, rt);
    },
    [syncTokenToLS],
  );

  return (
    <IOLContext.Provider
      value={{ accessToken, refreshToken, username, isLoggingIn, isTokenExpired, login, logout, updateTokens }}
    >
      {children}
    </IOLContext.Provider>
  );
}

export function useIOLSession() {
  return useContext(IOLContext);
}

