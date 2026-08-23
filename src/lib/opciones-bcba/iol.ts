/**
 * Cliente API InvertirOnline — port TS de server/iol_service.py.
 * Corre en funciones de servidor de Vercel (fetch nativo).
 * Credenciales hardcodeadas por decisión del propietario (repo privado).
 */

const IOL_USERNAME = "boosandr97@gmail.com";
const IOL_PASSWORD = "Chule348936_";
const TOKEN_URL = "https://api.invertironline.com/token";

export interface TokensIol {
  accessToken: string;
  refreshToken: string;
  expiraEn: number;
}

let cacheTokens: TokensIol | null = null;

function formBody(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

async function pedirToken(
  params: Record<string, string>,
): Promise<{ access_token?: string; refresh_token?: string } | null> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody(params),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Login completo con cache en memoria del serverless. */
export async function autenticar(forceRefresh = false): Promise<string | null> {
  const now = Date.now();
  if (!forceRefresh && cacheTokens && cacheTokens.expiraEn > now + 60_000) {
    return cacheTokens.accessToken;
  }
  if (!forceRefresh && cacheTokens?.refreshToken) {
    const r = await pedirToken({
      refresh_token: cacheTokens.refreshToken,
      grant_type: "refresh_token",
    });
    if (r?.access_token && r.refresh_token) {
      cacheTokens = {
        accessToken: r.access_token,
        refreshToken: r.refresh_token,
        expiraEn: now + 14 * 60 * 1000,
      };
      return r.access_token;
    }
  }
  const login = await pedirToken({
    username: IOL_USERNAME,
    password: IOL_PASSWORD,
    grant_type: "password",
  });
  if (!login?.access_token || !login.refresh_token) return null;
  cacheTokens = {
    accessToken: login.access_token,
    refreshToken: login.refresh_token,
    expiraEn: now + 14 * 60 * 1000,
  };
  return login.access_token;
}

/** Tasa de caución 7d (fallback primer plazo; default 5%). */
export async function obtenerTasaCaucion(token: string): Promise<number> {
  try {
    const res = await fetch(
      "https://api.invertironline.com/api/v2/Cotizaciones/Cauciones/Todas/Argentina",
      {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) return 0.05;
    const data = (await res.json()) as {
      titulos?: Array<{ plazo?: number; tasaPromedio?: number }>;
    };
    const titulos = [...(data.titulos ?? [])].sort((a, b) => (a.plazo ?? 0) - (b.plazo ?? 0));
    if (titulos.length === 0) return 0.05;
    const siete = titulos.find((t) => t.plazo === 7) ?? titulos[0];
    return siete.tasaPromedio ? siete.tasaPromedio / 100 : 0.05;
  } catch {
    return 0.05;
  }
}

export interface OpcionIolRaw {
  simbolo?: string;
  descripcion?: string;
  tipoOpcion?: "Call" | "Put";
  fechaVencimiento?: string;
  cotizacion?: {
    ultimoPrecio?: number;
    volumen?: number;
    bid?: number;
    ask?: number;
  } | null;
  [k: string]: unknown;
}

/** Cadena de opciones de un símbolo BCBA. */
export async function obtenerCadenaOpciones(
  token: string,
  simbolo: string,
): Promise<OpcionIolRaw[]> {
  try {
    const res = await fetch(
      `https://api.invertironline.com/api/v2/BCBA/Titulos/${encodeURIComponent(simbolo)}/Opciones`,
      {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as OpcionIolRaw[]) : [];
  } catch {
    return [];
  }
}
