/**
 * Cliente de la API de InvertirOnline (IOL) — https://api.invertironline.com
 *
 * Autenticación: POST /token (grant_type=password) con usuario y contraseña de
 * la cuenta IOL. Devuelve access_token + refresh_token; el token se refresca
 * automáticamente antes de expirar y ante un 401.
 *
 * Las credenciales se guardan SOLO en memoria del proceso, con clave por
 * sessionId del chat. Nunca se persisten a disco ni se devuelven al modelo.
 */

const BASE = "https://api.invertironline.com";
const TOKEN_URL = `${BASE}/token`;

// Credenciales hardcodeadas para YTM / precio de bonos cuando el usuario no
// inició sesión (chat web y Telegram). Override opcional por .env:
// IOL_USERNAME / IOL_PASSWORD. La contraseña debe coincidir con la vigente en
// invertironline.com; si cambia, actualizar acá o definirla por entorno.
const IOL_HARDCODED_USER = process.env["IOL_USERNAME"] || "boosandr97@gmail.com";
const IOL_HARDCODED_PASS = process.env["IOL_PASSWORD"] || "Chule348936_";
const IOL_HARDCODED_SESSION = "__hardcoded_ytm__";
/** Cooldown tras un login fallido: evita reintentar contra IOL en cada llamada. */
let ultimoFalloHardcoded = 0;
const COOLDOWN_FALLO_MS = 60_000;

export type FuenteIOL = { dominio: string; url: string; title: string };

export const FUENTE_IOL: FuenteIOL = {
  dominio: "api.invertironline.com",
  url: "https://api.invertironline.com",
  title: "InvertirOnline (IOL) API",
};

type SesionIOL = {
  accessToken: string;
  refreshToken: string;
  expiraEn: number;
};

const SESIONES = new Map<string, SesionIOL>();

/** Guarda credenciales en memoria (por sesión de chat) e inicia sesión. */
export async function iolLogin(
  sessionId: string,
  usuario: string,
  password: string,
): Promise<{ ok: boolean; detalle: string }> {
  const body = new URLSearchParams({
    grant_type: "password",
    username: usuario,
    password,
  });
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    });
    const json = (await res.json().catch(() => null)) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    } | null;
    if (!res.ok || !json?.access_token) {
      return {
        ok: false,
        detalle:
          json?.error ??
          `IOL rechazó el inicio de sesión (HTTP ${res.status}). Verificá usuario y contraseña.`,
      };
    }
    SESIONES.set(sessionId, {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? "",
      expiraEn: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 120) * 1000,
    });
    return {
      ok: true,
      detalle: `Sesión iniciada correctamente en IOL para ${usuario.replace(/(.{2}).*(@.*)/, "$1***$2")}. Token válido ~${Math.round((json.expires_in ?? 3600) / 60)} min.`,
    };
  } catch (e) {
    return {
      ok: false,
      detalle: `No se pudo contactar la API de IOL (${e instanceof Error ? e.message : "error de red"}).`,
    };
  }
}

export function iolSesionActiva(sessionId: string): boolean {
  const s = SESIONES.get(sessionId);
  return !!s && s.expiraEn > Date.now();
}

export function iolCerrarSesion(sessionId: string): void {
  SESIONES.delete(sessionId);
}

/** Asegura sesión IOL con fallback a credenciales hardcodeadas (para YTM/bonos desde Telegram) */
export async function ensureIOLSession(sessionId: string): Promise<string> {
  if (iolSesionActiva(sessionId)) return sessionId;
  // Intentar login hardcodeado como fallback (no expone credenciales al modelo)
  if (!iolSesionActiva(IOL_HARDCODED_SESSION)) {
    // Cooldown: si acaba de fallar, no reintentar (evita latencia por llamada).
    if (Date.now() - ultimoFalloHardcoded > COOLDOWN_FALLO_MS) {
      const r = await iolLogin(IOL_HARDCODED_SESSION, IOL_HARDCODED_USER, IOL_HARDCODED_PASS);
      if (!r.ok) {
        ultimoFalloHardcoded = Date.now();
        console.warn(
          `[IOL] login hardcodeado FALLÓ para ${IOL_HARDCODED_USER.replace(/(.{2}).*(@.*)/, "$1***$2")}: ${r.detalle}. Los precios de bonos caerán al último cierre persistido.`,
        );
      }
    }
  }
  if (iolSesionActiva(IOL_HARDCODED_SESSION)) return IOL_HARDCODED_SESSION;
  return sessionId; // sin sesión, el caller recibirá 401 y podrá manejarlo
}

export function getHardcodedSessionId(): string {
  return IOL_HARDCODED_SESSION;
}

async function refrescarToken(sessionId: string, refreshToken: string): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    });
    const json = (await res.json().catch(() => null)) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    } | null;
    if (!res.ok || !json?.access_token) return false;
    SESIONES.set(sessionId, {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? refreshToken,
      expiraEn: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 120) * 1000,
    });
    return true;
  } catch {
    return false;
  }
}

type RespuestaIOL<T> = { ok: boolean; status: number; data: T | null; error: string | null };

async function iolFetch<T>(
  sessionId: string,
  metodo: "GET" | "POST",
  path: string,
  cuerpo?: unknown,
  reintento = true,
): Promise<RespuestaIOL<T>> {
  const sesion = SESIONES.get(sessionId);
  if (!sesion || sesion.expiraEn <= Date.now()) {
    const okRefresh = sesion ? await refrescarToken(sessionId, sesion.refreshToken) : false;
    if (!okRefresh || !iolSesionActiva(sessionId)) {
      return {
        ok: false,
        status: 401,
        data: null,
        error:
          "NO AUTENTICADO: no hay sesión activa de IOL. Pedile al usuario que inicie sesión con iol_login(usuario, password) y reintentá.",
      };
    }
  }
  const actual = SESIONES.get(sessionId)!;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: metodo,
      headers: {
        Accept: "application/json",
        ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${actual.accessToken}`,
      },
      ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
    });
    if (res.status === 401 && reintento) {
      const okRefresh = await refrescarToken(sessionId, actual.refreshToken);
      if (okRefresh) return iolFetch<T>(sessionId, metodo, path, cuerpo, false);
      SESIONES.delete(sessionId);
      return {
        ok: false,
        status: 401,
        data: null,
        error:
          "La sesión de IOL expiró y no se pudo renovar. Pedile al usuario que vuelva a iniciar sesión con iol_login.",
      };
    }
    if (!res.ok) {
      const texto = await res.text().catch(() => "");
      let mensaje = texto.slice(0, 400);
      try {
        const j = JSON.parse(texto) as { message?: string; Messages?: unknown };
        if (j?.message) mensaje = j.message;
        else if (Array.isArray(j?.Messages)) mensaje = JSON.stringify(j.Messages).slice(0, 400);
      } catch {
        /* texto plano */
      }
      return { ok: false, status: res.status, data: null, error: `HTTP ${res.status}: ${mensaje}` };
    }
    const texto = await res.text();
    if (!texto.trim()) return { ok: true, status: res.status, data: null, error: null };
    return { ok: true, status: res.status, data: JSON.parse(texto) as T, error: null };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: `Error de red contra IOL (${e instanceof Error ? e.message : "desconocido"}).`,
    };
  }
}

// ---------------------------------------------------------------------------
// Mi cuenta
// ---------------------------------------------------------------------------

export type TituloIOL = {
  simbolo?: string;
  descripcion?: string;
  pais?: string;
  mercado?: string;
  tipo?: string;
  plazo?: string;
  moneda?: string;
};

export type ActivoPortafolio = {
  cantidad?: number;
  comprometido?: number;
  puntosVariacion?: number;
  variacionDiaria?: number;
  ultimoPrecio?: number;
  ppc?: number;
  gananciaPorcentaje?: number;
  gananciaDinero?: number;
  valorizado?: number;
  titulo?: TituloIOL;
};

export function iolPerfil(sessionId: string) {
  return iolFetch<Record<string, unknown>>(sessionId, "GET", "/api/v2/datos-perfil");
}

export function iolEstadoCuenta(sessionId: string) {
  return iolFetch<Record<string, unknown>>(sessionId, "GET", "/api/v2/estadocuenta");
}

export function iolPortafolio(sessionId: string, pais: string) {
  return iolFetch<{ pais?: string; activos?: ActivoPortafolio[] }>(
    sessionId,
    "GET",
    `/api/v2/portafolio/${encodeURIComponent(pais)}`,
  );
}

export function iolOperaciones(
  sessionId: string,
  filtro: {
    numero?: number;
    estado?: string;
    fechaDesde?: string;
    fechaHasta?: string;
    pais?: string;
  },
) {
  const p = new URLSearchParams();
  if (filtro.numero != null) p.set("filtro.numero", String(filtro.numero));
  if (filtro.estado) p.set("filtro.estado", filtro.estado);
  if (filtro.fechaDesde) p.set("filtro.fechaDesde", filtro.fechaDesde);
  if (filtro.fechaHasta) p.set("filtro.fechaHasta", filtro.fechaHasta);
  if (filtro.pais) p.set("filtro.pais", filtro.pais);
  const qs = p.toString();
  return iolFetch<unknown[]>(sessionId, "GET", `/api/v2/operaciones${qs ? `?${qs}` : ""}`);
}

export function iolOperacion(sessionId: string, numero: number) {
  return iolFetch<Record<string, unknown>>(
    sessionId,
    "GET",
    `/api/v2/operaciones/${encodeURIComponent(String(numero))}`,
  );
}

export function iolNotificacion(sessionId: string) {
  return iolFetch<Record<string, unknown>>(sessionId, "GET", "/api/v2/Notificacion");
}

export function iolTestInversorObtener(sessionId: string) {
  return iolFetch<Record<string, unknown>>(sessionId, "GET", "/api/v2/asesores/test-inversor");
}

export function iolTestInversorResponder(
  sessionId: string,
  respuestas: Record<string, unknown>,
  idClienteAsesorado?: number,
) {
  const sufijo = idClienteAsesorado ? `/${idClienteAsesorado}` : "";
  return iolFetch<Record<string, unknown>>(
    sessionId,
    "POST",
    `/api/v2/asesores/test-inversor${sufijo}`,
    respuestas,
  );
}

// ---------------------------------------------------------------------------
// Módulo ASESOR (cuentas asesoradas): movimientos, clientes y operación.
// ---------------------------------------------------------------------------

export type FiltroMovimientos = {
  clientes?: number[];
  from?: string;
  to?: string;
  dateType?: string;
  status?: string;
  type?: string;
  country?: string;
  currency?: string;
  cuentaComitente?: string;
};

/** POST /api/v2/Asesor/Movimientos — movimientos de las cuentas asesoradas. */
export function iolAsesorMovimientos(sessionId: string, filtro: FiltroMovimientos) {
  return iolFetch<unknown>(sessionId, "POST", "/api/v2/Asesor/Movimientos", filtro);
}

/**
 * Lista de clientes asesorados: la API v2 no expone un endpoint directo de
 * "listar clientes"; se derivan los identificadores distintos (comitente /
 * cliente / cuenta) de los movimientos del asesor en una ventana amplia.
 */
export async function iolAsesorClientes(sessionId: string): Promise<{
  ok: boolean;
  status: number;
  clientes: Array<Record<string, unknown>>;
  crudo: unknown;
  error: string | null;
}> {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - 730 * 24 * 3600 * 1000);
  const iso = (d: Date) => d.toISOString();
  const r = await iolFetch<unknown>(sessionId, "POST", "/api/v2/Asesor/Movimientos", {
    from: iso(desde),
    to: iso(hasta),
  });
  if (!r.ok || r.data == null) {
    return { ok: false, status: r.status, clientes: [], crudo: r.data, error: r.error };
  }
  const vistos = new Map<string, Record<string, unknown>>();
  const visitar = (nodo: unknown) => {
    if (!nodo || typeof nodo !== "object") return;
    if (Array.isArray(nodo)) {
      for (const x of nodo) visitar(x);
      return;
    }
    const obj = nodo as Record<string, unknown>;
    const id =
      obj["numeroComitente"] ??
      obj["idClienteAsesorado"] ??
      obj["numeroCuenta"] ??
      obj["idCliente"] ??
      obj["cliente"] ??
      obj["comitente"] ??
      obj["cuenta"];
    if (id != null && (typeof id === "number" || typeof id === "string")) {
      const clave = String(id);
      if (!vistos.has(clave)) vistos.set(clave, obj);
    }
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object") visitar(v);
    }
  };
  visitar(r.data);
  return { ok: true, status: r.status, clientes: [...vistos.values()], crudo: r.data, error: null };
}

/** POST /api/v2/asesores/operar/VenderEspecieD — venta para un cliente asesorado. */
export function iolAsesorVenderEspecieD(
  sessionId: string,
  o: {
    idClienteAsesorado: number;
    mercado: string;
    simbolo: string;
    cantidad: number;
    precio?: number;
    validez?: string;
    tipoOrden?: string;
    plazo?: string;
    fondosParaOperacion?: number;
    idCuentaBancaria?: number;
    idFuente?: number;
  },
) {
  return iolFetch<RespuestaOperacion>(
    sessionId,
    "POST",
    "/api/v2/asesores/operar/VenderEspecieD",
    o,
  ).then((r) => ({ ...r, resumen: r.data ? textoRespuestaOperacion(r.data) : r.error }));
}

// ---------------------------------------------------------------------------
// Mercado / títulos
// ---------------------------------------------------------------------------

export function iolTitulo(sessionId: string, mercado: string, simbolo: string) {
  return iolFetch<TituloIOL>(
    sessionId,
    "GET",
    `/api/v2/${encodeURIComponent(mercado)}/Titulos/${encodeURIComponent(simbolo)}`,
  );
}

export function iolCotizacionDetalle(sessionId: string, mercado: string, simbolo: string) {
  return iolFetch<Record<string, unknown>>(
    sessionId,
    "GET",
    `/api/v2/${encodeURIComponent(mercado)}/Titulos/${encodeURIComponent(simbolo)}/CotizacionDetalle`,
  );
}

export function iolOpciones(sessionId: string, mercado: string, simbolo: string) {
  return iolFetch<unknown[]>(
    sessionId,
    "GET",
    `/api/v2/${encodeURIComponent(mercado)}/Titulos/${encodeURIComponent(simbolo)}/Opciones`,
  );
}

export function iolCotizacion(sessionId: string, mercado: string, simbolo: string, plazo = "t0") {
  const p = new URLSearchParams({
    "model.simbolo": simbolo,
    "model.mercado": mercado,
    "model.plazo": plazo,
  });
  return iolFetch<Record<string, unknown>>(
    sessionId,
    "GET",
    `/api/v2/${encodeURIComponent(mercado)}/Titulos/${encodeURIComponent(simbolo)}/Cotizacion?${p.toString()}`,
  );
}

export function iolSerieHistorica(
  sessionId: string,
  mercado: string,
  simbolo: string,
  fechaDesde: string,
  fechaHasta: string,
  ajustada = true,
) {
  return iolFetch<Array<Record<string, unknown>>>(
    sessionId,
    "GET",
    `/api/v2/${encodeURIComponent(mercado)}/Titulos/${encodeURIComponent(simbolo)}/Cotizacion/seriehistorica/${fechaDesde}/${fechaHasta}/${ajustada ? "ajustada" : "sin-ajustar"}`,
  );
}

export function iolInstrumentosCotizacion(sessionId: string, pais: string) {
  return iolFetch<unknown[]>(
    sessionId,
    "GET",
    `/api/v2/${encodeURIComponent(pais)}/Titulos/Cotizacion/Instrumentos`,
  );
}

export function iolPanelesCotizacion(sessionId: string, pais: string, instrumento: string) {
  return iolFetch<unknown[]>(
    sessionId,
    "GET",
    `/api/v2/${encodeURIComponent(pais)}/Titulos/Cotizacion/Paneles/${encodeURIComponent(instrumento)}`,
  );
}

export function iolPanelTodos(sessionId: string, instrumento: string, pais: string) {
  const p = new URLSearchParams({
    "cotizacionInstrumentoModel.instrumento": instrumento,
    "cotizacionInstrumentoModel.pais": pais,
  });
  return iolFetch<{ titulos?: Array<Record<string, unknown>> }>(
    sessionId,
    "GET",
    `/api/v2/Cotizaciones/${encodeURIComponent(instrumento)}/${encodeURIComponent(pais)}/Todos?${p.toString()}`,
  );
}

export function iolFCITodos(sessionId: string) {
  return iolFetch<unknown[]>(sessionId, "GET", "/api/v2/Titulos/FCI");
}

export function iolFCISimbolo(sessionId: string, simbolo: string) {
  return iolFetch<Record<string, unknown>>(
    sessionId,
    "GET",
    `/api/v2/Titulos/FCI/${encodeURIComponent(simbolo)}`,
  );
}

export function iolFCITipoFondos(sessionId: string) {
  return iolFetch<unknown[]>(sessionId, "GET", "/api/v2/Titulos/FCI/TipoFondos");
}

export function iolMEPGet(sessionId: string, simbolo: string) {
  return iolFetch<number>(
    sessionId,
    "GET",
    `/api/v2/Cotizaciones/MEP/${encodeURIComponent(simbolo)}`,
  );
}

export function iolMEPPost(
  sessionId: string,
  simbolo: string,
  idPlazoOperatoriaCompra?: number,
  idPlazoOperatoriaVenta?: number,
) {
  return iolFetch<number>(sessionId, "POST", "/api/v2/Cotizaciones/MEP", {
    simbolo,
    ...(idPlazoOperatoriaCompra != null ? { idPlazoOperatoriaCompra } : {}),
    ...(idPlazoOperatoriaVenta != null ? { idPlazoOperatoriaVenta } : {}),
  });
}

// ---------------------------------------------------------------------------
// Operar
// ---------------------------------------------------------------------------

export type RespuestaOperacion = {
  ok?: boolean;
  messages?: Array<{ title?: string; description?: string }>;
};

function textoRespuestaOperacion(r: RespuestaOperacion): string {
  if (r.ok) return "Orden aceptada por IOL.";
  const msgs = (r.messages ?? [])
    .map((m) => [m.title, m.description].filter(Boolean).join(": "))
    .filter(Boolean)
    .join(" · ");
  return msgs || "IOL no aceptó la operación (sin detalle).";
}

export type OrdenBase = {
  mercado: string;
  simbolo: string;
  cantidad: number;
  precio?: number;
  validez?: string;
  tipoOrden?: string;
  plazo?: string;
  monto?: number;
  idFuente?: number;
};

export function iolComprar(sessionId: string, o: OrdenBase) {
  return iolFetch<RespuestaOperacion>(sessionId, "POST", "/api/v2/operar/Comprar", o).then((r) => ({
    ...r,
    resumen: r.data ? textoRespuestaOperacion(r.data) : r.error,
  }));
}

export function iolVender(sessionId: string, o: OrdenBase) {
  return iolFetch<RespuestaOperacion>(sessionId, "POST", "/api/v2/operar/Vender", o).then((r) => ({
    ...r,
    resumen: r.data ? textoRespuestaOperacion(r.data) : r.error,
  }));
}

export function iolComprarEspecieD(sessionId: string, o: OrdenBase) {
  return iolFetch<RespuestaOperacion>(sessionId, "POST", "/api/v2/operar/ComprarEspecieD", o).then(
    (r) => ({ ...r, resumen: r.data ? textoRespuestaOperacion(r.data) : r.error }),
  );
}

export function iolVenderEspecieD(sessionId: string, o: OrdenBase & { idCuentaBancaria?: number }) {
  return iolFetch<RespuestaOperacion>(sessionId, "POST", "/api/v2/operar/VenderEspecieD", o).then(
    (r) => ({ ...r, resumen: r.data ? textoRespuestaOperacion(r.data) : r.error }),
  );
}

export function iolSuscripcionFCI(
  sessionId: string,
  simbolo: string,
  monto: number,
  soloValidar = true,
) {
  return iolFetch<RespuestaOperacion>(sessionId, "POST", "/api/v2/operar/suscripcion/fci", {
    simbolo,
    monto,
    soloValidar,
  }).then((r) => ({ ...r, resumen: r.data ? textoRespuestaOperacion(r.data) : r.error }));
}

export function iolRescateFCI(
  sessionId: string,
  simbolo: string,
  cantidad: number,
  soloValidar = true,
) {
  return iolFetch<RespuestaOperacion>(sessionId, "POST", "/api/v2/operar/rescate/fci", {
    simbolo,
    cantidad,
    soloValidar,
  }).then((r) => ({ ...r, resumen: r.data ? textoRespuestaOperacion(r.data) : r.error }));
}

export function iolTokenDDJJ(
  sessionId: string,
  datos: { mercado: string; simbolo: string; cantidad: number; monto: number },
) {
  return iolFetch<{ token?: string; expiration?: string }>(
    sessionId,
    "POST",
    "/api/v2/operar/Token",
    datos,
  );
}

export function iolPuedeOperarCPD(sessionId: string) {
  return iolFetch<{ operatoriaHabilitada?: boolean }>(
    sessionId,
    "GET",
    "/api/v2/operar/CPD/PuedeOperar",
  );
}

export function iolSubastasCPD(sessionId: string, estado: string, segmento: string) {
  return iolFetch<Record<string, unknown>>(
    sessionId,
    "GET",
    `/api/v2/operar/CPD/${encodeURIComponent(estado)}/${encodeURIComponent(segmento)}`,
  );
}

export function iolComisionesCPD(sessionId: string, importe: number, plazo: string, tasa: number) {
  return iolFetch<Record<string, unknown>>(
    sessionId,
    "GET",
    `/api/v2/operar/CPD/Comisiones/${importe}/${encodeURIComponent(plazo)}/${tasa}`,
  );
}

export function iolOperarCPD(sessionId: string, idSubasta: number, tasa: number) {
  return iolFetch<{ idTransaccion?: number }>(sessionId, "POST", "/api/v2/operar/CPD", {
    idSubasta,
    tasa,
    fuente: "compra_Venta_Por_Web",
  });
}

// ---------------------------------------------------------------------------
// Operatoria simplificada (dólar MEP / venta simple)
// ---------------------------------------------------------------------------

export function iolMontosEstimados(sessionId: string, monto: number) {
  return iolFetch<Record<string, unknown>>(
    sessionId,
    "GET",
    `/api/v2/OperatoriaSimplificada/MontosEstimados/${monto}`,
  );
}

export function iolParametrosOperatoria(sessionId: string, idTipoOperatoria: number) {
  return iolFetch<Record<string, unknown>>(
    sessionId,
    "GET",
    `/api/v2/OperatoriaSimplificada/${idTipoOperatoria}/Parametros`,
  );
}

export function iolValidarMonto(sessionId: string, monto: number, idTipoOperatoria: number) {
  return iolFetch<RespuestaOperacion>(
    sessionId,
    "GET",
    `/api/v2/OperatoriaSimplificada/Validar/${monto}/${idTipoOperatoria}`,
  ).then((r) => ({ ...r, resumen: r.data ? textoRespuestaOperacion(r.data) : r.error }));
}

export function iolVentaMepSimpleMontos(sessionId: string, monto: number) {
  return iolFetch<Record<string, unknown>>(
    sessionId,
    "GET",
    `/api/v2/OperatoriaSimplificada/VentaMepSimple/MontosEstimados/${monto}`,
  );
}

export function iolOperatoriaComprar(
  sessionId: string,
  monto: number,
  idTipoOperatoriaSimplificada: number,
  idCuentaBancaria?: number,
) {
  return iolFetch<RespuestaOperacion>(sessionId, "POST", "/api/v2/OperatoriaSimplificada/Comprar", {
    monto,
    idTipoOperatoriaSimplificada,
    ...(idCuentaBancaria != null ? { idCuentaBancaria } : {}),
  }).then((r) => ({ ...r, resumen: r.data ? textoRespuestaOperacion(r.data) : r.error }));
}
