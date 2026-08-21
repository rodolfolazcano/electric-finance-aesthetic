// @ts-nocheck
import { useState, useCallback, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getTickerInfo } from "@/lib/universos";
import cedearsUniverse from "@/data/cedears-universe.json";
import {
  iolObtenerTitulo,
  iolInstrumentosPorPais,
  type IOLTituloInfo,
} from "@/lib/api/iol-cotizaciones";
import { useIOLSession } from "@/lib/iol-context";

// ─── Cliente IOL reutilizado (pre-chequeo, paso 1) ─────────────────────────
// Se reutiliza el cliente IOL existente del repo:
//   src/lib/api/iol-cotizaciones.ts (resolveToken / IOL_EXTERNAL_TOKEN | bearerToken)
// Única excepción "sin fetchers nuevos": se le AGREGARON ahí los wrappers
//   GET /api/v2/{mercado}/Titulos/{simbolo}            → iolObtenerTitulo
//   GET /api/v2/{pais}/Titulos/Cotizacion/Instrumentos → iolInstrumentosPorPais
// El token llega desde useIOLSession() (IOLProvider, __root.tsx:155).

// ─── Types ────────────────────────────────────────────────────────────────

export type PortfolioClassification =
  "ARGENTINA - EEUU" | "ARGENTINA - RENTA FIJA" | "ARGENTINA - RENTA VARIABLE" | "ARS" | "USD";

export type AssetFuente = "IOL" | "Yahoo" | "ArgDatos";

export type AssetClasificacion =
  | "Accion"
  | "ADR"
  | "CEDEAR"
  | "Bono"
  | "Letra"
  | "ON"
  | "FCI"
  | "ETF"
  | "Opcion"
  | "Futuro"
  | "Caucion"
  | "Moneda"
  | "Cripto"
  | "Otro";

export interface PortfolioAsset {
  id: string;
  ticker: string;
  cantidad: number;
  fuente: AssetFuente;
  clasificacion: AssetClasificacion;
  moneda: "ARS" | "USD";
  mercado: string;
  valorizado: number;
  precio: number | null;
}

export interface Portfolio {
  id: string;
  name: string;
  classification: PortfolioClassification;
  assets: PortfolioAsset[];
}

// ─── Mapeos de FALLBACK (NO-IOL) ───────────────────────────────────────────
// Los 3 mapeos estáticos originales ya NO son la fuente primaria:
// para fuente "IOL" la clasificación/mercado/moneda salen de la API de IOL
// (estado `instrumentosPorPais` + respuesta de /Titulos/{simbolo}).
// Estas tablas se conservan únicamente para el fallback exacto de
// `clasificacionFallback` cuando la fuente no es IOL o la llamada falla (paso 2c).

const FALLBACK_CLASIFICACION_POR_FUENTE: Record<AssetFuente, AssetClasificacion[]> = {
  IOL: [
    "Accion",
    "CEDEAR",
    "Bono",
    "Letra",
    "ON",
    "FCI",
    "Opcion",
    "Futuro",
    "Caucion",
    "Moneda",
    "ETF",
  ],
  Yahoo: ["Accion", "ADR", "CEDEAR", "ETF", "Cripto"],
  ArgDatos: ["Bono", "Letra", "ON"],
};

const FALLBACK_MERCADO_POR_CLASIFICACION: Record<AssetClasificacion, string> = {
  Accion: "BCBA",
  ADR: "NYSE",
  CEDEAR: "BCBA",
  Bono: "BCBA",
  Letra: "BCBA",
  ON: "BCBA",
  FCI: "BCBA",
  ETF: "NYSE",
  Opcion: "BCBA",
  Futuro: "BCBA",
  Caucion: "BCBA",
  Moneda: "BCBA",
  Cripto: "CRIPT",
  Otro: "OTRO",
};

const FALLBACK_MONEDA_POR_MERCADO: Record<string, "ARS" | "USD"> = {
  BCBA: "ARS",
  NYSE: "USD",
  NASDAQ: "USD",
  CRIPT: "USD",
  OTRO: "USD",
};

// ─── Mapeos IOL → enums TS existentes ─────────────────────────────────────
// Los valores vienen de la API IOL (tipo/mercado/moneda de /Titulos/{simbolo}
// y de /Titulos/Cotizacion/Instrumentos). Si un valor no tiene equivalente en
// los enums TS, NO se castea a la fuerza: se marca `# REVISAR` y se usa "Otro".

const IOL_TIPO_TO_CLASIFICACION: Record<string, AssetClasificacion> = {
  acciones: "Accion",
  adrs: "ADR",
  cedears: "CEDEAR",
  titulospublicos: "Bono",
  bonos: "Bono",
  letras: "Letra",
  obligacionesnegociables: "ON",
  cauciones: "Caucion",
  fondoscomunesinversion: "FCI",
  etf: "ETF",
  opciones: "Opcion",
  futuros: "Futuro",
  monedas: "Moneda",
  criptomonedas: "Cripto",
};

export function mapTipoIOLToClasificacion(
  tipo: string | null | undefined,
): AssetClasificacion | null {
  if (!tipo) return null;
  return IOL_TIPO_TO_CLASIFICACION[tipo.trim().toLowerCase()] ?? null;
}

export function mapMonedaIOLToEnum(moneda: string | null | undefined): "ARS" | "USD" | null {
  if (!moneda) return null;
  const key = moneda.trim().toLowerCase();
  if (key.includes("peso") || key === "ars") return "ARS";
  if (key.includes("dolar") || key.includes("dólar") || key === "usd") return "USD";
  return null;
}

// Resultado de clasificación. `revisar` lleva notas `# REVISAR: ...` visibles.
export interface ClasificacionResultado {
  clasificacion: AssetClasificacion;
  moneda: "ARS" | "USD";
  mercado: string;
  fuente?: AssetFuente;
  revisar?: string;
}

const CEDEARS_ARS = new Set<string>(cedearsUniverse.ARS ?? []);
const CEDEARS_USD = new Set<string>(cedearsUniverse.USD ?? []);

// Lógica estática original (pasos 1-4 de determinarClasificacion). NO se toca.
export function clasificacionFallback(ticker: string): ClasificacionResultado | null {
  const t = ticker.toUpperCase().trim();
  if (!t) return null;

  const esCEDEARenARS = CEDEARS_ARS.has(t);
  const esCEDEARenUSD = CEDEARS_USD.has(t) || /^[A-Z0-9]{1,5}D$/.test(t);
  if (esCEDEARenARS || esCEDEARenUSD) {
    return {
      clasificacion: "CEDEAR",
      moneda: esCEDEARenARS ? "ARS" : "USD",
      mercado: "BCBA",
      fuente: "IOL",
    };
  }

  const info = getTickerInfo(t);
  if (info?.tipo === "accion" && info.pais === "EE.UU.") {
    return {
      clasificacion: "ADR",
      moneda: "USD",
      mercado: info.mercado ?? "NYSE",
      fuente: "Yahoo",
    };
  }
  if (info?.tipo === "cedear") {
    return {
      clasificacion: "CEDEAR",
      moneda: (info.moneda as "ARS" | "USD") ?? "ARS",
      mercado: "BCBA",
      fuente: "IOL",
    };
  }
  if (info?.pais === "Argentina" || t.endsWith(".BA")) {
    return {
      clasificacion: "Accion",
      moneda: (info?.moneda as "ARS" | "USD") ?? "ARS",
      mercado: "BCBA",
      fuente: "IOL",
    };
  }
  if (/^[A-Z0-9]{1,5}$/.test(t)) {
    return {
      clasificacion: "ADR",
      moneda: "USD",
      mercado: "NYSE",
      fuente: "Yahoo",
    };
  }
  return null;
}

// Clasifica desde la respuesta de GET /api/v2/{mercado}/Titulos/{simbolo}.
// tipo/moneda sin equivalente en los enums TS → "Otro" + `# REVISAR: valor IOL no mapeado [...]`.
export function clasificarDesdeIOL(titulo: IOLTituloInfo | null): ClasificacionResultado | null {
  if (!titulo) return null;
  const tipo = titulo.tipo ?? "";
  const mercado = titulo.mercado ?? "";
  const moneda = titulo.moneda ?? "";
  const clasificacion = mapTipoIOLToClasificacion(tipo);
  const monedaEnum = mapMonedaIOLToEnum(moneda);
  const notas: string[] = [];
  if (!clasificacion) notas.push(`# REVISAR: valor IOL no mapeado [${tipo}]`);
  if (!monedaEnum) notas.push(`# REVISAR: valor IOL no mapeado [${moneda}]`);
  return {
    clasificacion: clasificacion ?? "Otro",
    moneda: monedaEnum ?? "USD",
    mercado: mercado || "OTRO",
    fuente: "IOL",
    ...(notas.length ? { revisar: notas.join(" ") } : {}),
  };
}

// Determina clasificación. Con fuente "IOL" consulta IOL primero
// (mercado inicial "bCBA"; si falla, reintenta una vez con "nYSE") y si la
// llamada falla (401/404/network) o la fuente no es IOL, usa el fallback exacto.
export async function determinarClasificacion(
  ticker: string,
  fuente: AssetFuente,
  fetchTitulo?: (mercado: string, simbolo: string) => Promise<IOLTituloInfo | null>,
): Promise<ClasificacionResultado | null> {
  if (fuente === "IOL" && fetchTitulo) {
    let titulo = await fetchTitulo("bCBA", ticker).catch(() => null);
    if (!titulo) titulo = await fetchTitulo("nYSE", ticker).catch(() => null);
    const desdeIOL = clasificarDesdeIOL(titulo);
    if (desdeIOL) return desdeIOL;
  }
  return clasificacionFallback(ticker);
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

const STORAGE_KEY = "clarity-portfolio-composition";

function loadPortfolios(): Portfolio[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Portfolio[];
  } catch {
    /* ignore */
  }
  return [];
}

function savePortfolios(portfolios: Portfolio[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolios));
  } catch {
    /* ignore */
  }
}

// ─── Component ────────────────────────────────────────────────────────────

export function PortfolioComposition() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>(loadPortfolios);
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null);
  const [newPortfolioName, setNewPortfolioName] = useState("");

  // ── New asset form state ──
  const [newTicker, setNewTicker] = useState("");
  const [newCantidad, setNewCantidad] = useState(0);
  const [newFuente, setNewFuente] = useState<AssetFuente>("IOL");
  const [newClasificacion, setNewClasificacion] = useState<AssetClasificacion>("Accion");
  const [newPrecio, setNewPrecio] = useState<number | null>(null);
  const [newMercado, setNewMercado] = useState("BCBA");
  const [newMoneda, setNewMoneda] = useState<"ARS" | "USD">("ARS");
  const [revisarNota, setRevisarNota] = useState("");

  // ── IOL: estado configurable en vez de los mapeos estáticos ──
  const { accessToken } = useIOLSession();
  const iolTituloFn = useServerFn(iolObtenerTitulo);
  const iolInstrumentosFn = useServerFn(iolInstrumentosPorPais);
  const [instrumentosPorPais, setInstrumentosPorPais] = useState<
    Record<string, { instrumento: string; pais: string }[]>
  >({});

  // Poblar tipos de instrumento válidos por país desde IOL (un llamado por país, nunca combinados)
  useEffect(() => {
    let active = true;
    const token = accessToken ?? undefined;
    Promise.all([
      iolInstrumentosFn({ data: { pais: "argentina", bearerToken: token } }).catch(() => []),
      iolInstrumentosFn({ data: { pais: "estados_Unidos", bearerToken: token } }).catch(() => []),
    ]).then(([argentina, estados_Unidos]) => {
      if (!active) return;
      setInstrumentosPorPais({ argentina, estados_Unidos });
    });
    return () => {
      active = false;
    };
  }, [iolInstrumentosFn, accessToken]);

  // Auto-clasificar activo según ticker + fuente: IOL primero, fallback exacto después
  const determinarClasificacionCb = useCallback(
    (ticker: string, fuente: AssetFuente) =>
      determinarClasificacion(ticker, fuente, async (mercado, simbolo) => {
        const res = await iolTituloFn({
          data: { mercado, simbolo, bearerToken: accessToken ?? undefined },
        }).catch(() => null);
        return res?.ok ? (res.titulo ?? null) : null;
      }),
    [iolTituloFn, accessToken],
  );

  const prevTickerRef = useRef("");
  useEffect(() => {
    const tickerChanged = newTicker !== prevTickerRef.current;
    prevTickerRef.current = newTicker;
    let cancelled = false;
    (async () => {
      const result = await determinarClasificacionCb(newTicker, newFuente);
      if (cancelled) return;
      if (!result) {
        setRevisarNota("");
        return;
      }
      setNewClasificacion(result.clasificacion);
      setNewMercado(result.mercado);
      setNewMoneda(result.moneda);
      setRevisarNota(result.revisar ?? "");
      // El fallback define la fuente solo cuando cambia el ticker (comportamiento original)
      if (tickerChanged) setNewFuente((prev) => result.fuente ?? prev);
    })();
    return () => {
      cancelled = true;
    };
  }, [newTicker, newFuente, determinarClasificacionCb]);

  // Clasificaciones disponibles: para IOL salen de los instrumentos de IOL; resto usa fallback
  const clasificacionesParaFuente = useCallback(
    (fuente: AssetFuente): AssetClasificacion[] => {
      if (fuente === "IOL") {
        const iolList = [
          ...(instrumentosPorPais.argentina ?? []),
          ...(instrumentosPorPais.estados_Unidos ?? []),
        ];
        const out: AssetClasificacion[] = [];
        for (const i of iolList) {
          const c = mapTipoIOLToClasificacion(i.instrumento);
          if (c && !out.includes(c)) out.push(c);
        }
        if (out.length > 0) return out;
      }
      return FALLBACK_CLASIFICACION_POR_FUENTE[fuente];
    },
    [instrumentosPorPais],
  );

  // Save to localStorage on change
  useEffect(() => {
    savePortfolios(portfolios);
  }, [portfolios]);

  const activePortfolio = portfolios.find((p) => p.id === activePortfolioId) ?? portfolios[0];

  // Auto-select first portfolio
  useEffect(() => {
    if (!activePortfolioId && portfolios.length > 0) {
      setActivePortfolioId(portfolios[0].id);
    }
  }, [portfolios, activePortfolioId]);

  // ── Portfolio CRUD ──
  const createPortfolio = useCallback(() => {
    const name = newPortfolioName.trim() || `Portafolio ${portfolios.length + 1}`;
    const newPort: Portfolio = {
      id: generateId(),
      name,
      classification: "ARGENTINA - EEUU",
      assets: [],
    };
    setPortfolios((prev) => [...prev, newPort]);
    setActivePortfolioId(newPort.id);
    setNewPortfolioName("");
  }, [portfolios.length, newPortfolioName]);

  const deletePortfolio = useCallback(
    (id: string) => {
      setPortfolios((prev) => {
        const next = prev.filter((p) => p.id !== id);
        if (activePortfolioId === id) {
          setActivePortfolioId(next.length > 0 ? next[0].id : null);
        }
        return next;
      });
    },
    [activePortfolioId],
  );

  const updatePortfolioClassification = useCallback(
    (id: string, classification: PortfolioClassification) => {
      setPortfolios((prev) => prev.map((p) => (p.id === id ? { ...p, classification } : p)));
    },
    [],
  );

  const updatePortfolioName = useCallback((id: string, name: string) => {
    setPortfolios((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }, []);

  // ── Asset CRUD ──
  const addAsset = useCallback(() => {
    const ticker = newTicker.trim().toUpperCase();
    if (!ticker) return;

    const mercado = newMercado || (FALLBACK_MERCADO_POR_CLASIFICACION[newClasificacion] ?? "OTRO");
    const moneda =
      newFuente === "ArgDatos"
        ? "ARS"
        : newMoneda || (FALLBACK_MONEDA_POR_MERCADO[mercado] ?? "USD");

    const asset: PortfolioAsset = {
      id: generateId(),
      ticker,
      cantidad: newCantidad || 1,
      fuente: newFuente,
      clasificacion: newClasificacion,
      moneda,
      mercado,
      valorizado: (newPrecio ?? 0) * (newCantidad || 1),
      precio: newPrecio,
    };

    setPortfolios((prev) =>
      prev.map((p) => (p.id === activePortfolioId ? { ...p, assets: [...p.assets, asset] } : p)),
    );

    setNewTicker("");
    setNewCantidad(0);
    setNewPrecio(null);
    setNewClasificacion("Accion");
    setNewFuente("IOL");
  }, [newTicker, newCantidad, newFuente, newClasificacion, newPrecio, activePortfolioId]);

  const removeAsset = useCallback((portfolioId: string, assetId: string) => {
    setPortfolios((prev) =>
      prev.map((p) =>
        p.id === portfolioId ? { ...p, assets: p.assets.filter((a) => a.id !== assetId) } : p,
      ),
    );
  }, []);

  const updateAssetCantidad = useCallback(
    (portfolioId: string, assetId: string, cantidad: number) => {
      setPortfolios((prev) =>
        prev.map((p) =>
          p.id === portfolioId
            ? {
                ...p,
                assets: p.assets.map((a) =>
                  a.id === assetId ? { ...a, cantidad, valorizado: (a.precio ?? 0) * cantidad } : a,
                ),
              }
            : p,
        ),
      );
    },
    [],
  );

  const updateAssetPrecio = useCallback((portfolioId: string, assetId: string, precio: number) => {
    setPortfolios((prev) =>
      prev.map((p) =>
        p.id === portfolioId
          ? {
              ...p,
              assets: p.assets.map((a) =>
                a.id === assetId ? { ...a, precio, valorizado: precio * a.cantidad } : a,
              ),
            }
          : p,
      ),
    );
  }, []);

  const updateAssetFuente = useCallback(
    (portfolioId: string, assetId: string, fuente: AssetFuente) => {
      setPortfolios((prev) =>
        prev.map((p) =>
          p.id === portfolioId
            ? {
                ...p,
                assets: p.assets.map((a) => (a.id === assetId ? { ...a, fuente } : a)),
              }
            : p,
        ),
      );
    },
    [],
  );

  const updateAssetClasificacion = useCallback(
    (portfolioId: string, assetId: string, clasificacion: AssetClasificacion) => {
      setPortfolios((prev) =>
        prev.map((p) =>
          p.id === portfolioId
            ? {
                ...p,
                assets: p.assets.map((a) => {
                  if (a.id !== assetId) return a;
                  const mercado = FALLBACK_MERCADO_POR_CLASIFICACION[clasificacion] ?? "OTRO";
                  const moneda =
                    a.fuente === "ArgDatos"
                      ? "ARS"
                      : (FALLBACK_MONEDA_POR_MERCADO[mercado] ?? a.moneda);
                  return { ...a, clasificacion, mercado, moneda };
                }),
              }
            : p,
        ),
      );
    },
    [],
  );

  // ── Computed ──
  const totalValorizado = activePortfolio?.assets.reduce((s, a) => s + a.valorizado, 0) ?? 0;
  const totalARS =
    activePortfolio?.assets
      .filter((a) => a.moneda === "ARS")
      .reduce((s, a) => s + a.valorizado, 0) ?? 0;
  const totalUSD =
    activePortfolio?.assets
      .filter((a) => a.moneda === "USD")
      .reduce((s, a) => s + a.valorizado, 0) ?? 0;

  const clasificacionesDisponibles = clasificacionesParaFuente(newFuente);

  const fmtNum = (n: number) =>
    n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-light tracking-tight sm:text-3xl">
          Composición del <span className="italic text-primary">portafolio</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Ingresá los activos que querés diagnosticar
        </p>
      </div>

      {/* ── Portfolio selector / creator ── */}
      <div className="flex flex-wrap items-center gap-2">
        {portfolios.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePortfolioId(p.id)}
            className={`font-mono text-[11px] px-3 py-1.5 rounded-md border transition-colors ${
              p.id === activePortfolioId
                ? "border-primary/60 bg-primary/10 text-foreground"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.name}
            {p.id === activePortfolioId && <span className="ml-1.5 text-[9px] opacity-60">✎</span>}
          </button>
        ))}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={newPortfolioName}
            onChange={(e) => setNewPortfolioName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createPortfolio();
            }}
            placeholder="+ Nuevo"
            className="w-24 h-7 rounded border border-border/40 bg-background/60 px-2 text-[10px] font-mono text-foreground outline-none focus:border-primary/60 placeholder:text-muted-foreground/40"
          />
          <button
            onClick={createPortfolio}
            className="h-7 px-2.5 rounded text-[10px] font-mono font-semibold bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {activePortfolio ? (
        <>
          {/* ── Portfolio classification / name editor ── */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                Nombre
              </label>
              <input
                type="text"
                value={activePortfolio.name}
                onChange={(e) => updatePortfolioName(activePortfolio.id, e.target.value)}
                className="h-7 rounded border border-border/40 bg-background/60 px-2 text-[11px] font-mono text-foreground outline-none focus:border-primary/60"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                Clasificación
              </label>
              <select
                value={activePortfolio.classification}
                onChange={(e) =>
                  updatePortfolioClassification(
                    activePortfolio.id,
                    e.target.value as PortfolioClassification,
                  )
                }
                className="h-7 rounded border border-border/40 bg-background/60 px-2 text-[10px] font-mono text-foreground outline-none focus:border-primary/60"
              >
                <option value="ARGENTINA - EEUU">ARGENTINA - EEUU</option>
                <option value="ARGENTINA - RENTA FIJA">ARGENTINA - RENTA FIJA</option>
                <option value="ARGENTINA - RENTA VARIABLE">ARGENTINA - RENTA VARIABLE</option>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>
            {activePortfolio.assets.length > 0 && (
              <button
                onClick={() => {
                  setPortfolios((prev) =>
                    prev.map((p) => (p.id === activePortfolio.id ? { ...p, assets: [] } : p)),
                  );
                }}
                className="h-7 px-3 rounded text-[10px] font-mono text-red-400 border border-red-400/40 hover:bg-red-400/10 transition-colors"
              >
                Limpiar todo
              </button>
            )}
            <button
              onClick={() => deletePortfolio(activePortfolio.id)}
              className="h-7 px-3 rounded text-[10px] font-mono text-red-400 border border-red-400/40 hover:bg-red-400/10 transition-colors"
            >
              Eliminar portafolio
            </button>
          </div>

          {/* ── Add asset form ── */}
          <div className="rounded border border-border/40 bg-background/40 p-4 space-y-3">
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              + Agregar activo
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                  Ticker
                </label>
                <input
                  type="text"
                  value={newTicker}
                  onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addAsset();
                  }}
                  placeholder="GGAL"
                  className="w-24 h-7 rounded border border-border/40 bg-background/60 px-2 text-[11px] font-mono text-foreground outline-none focus:border-primary/60 placeholder:text-muted-foreground/40"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                  Cantidad
                </label>
                <input
                  type="number"
                  min={0}
                  value={newCantidad || ""}
                  onChange={(e) => setNewCantidad(Number(e.target.value))}
                  placeholder="100"
                  className="w-24 h-7 rounded border border-border/40 bg-background/60 px-2 text-[11px] font-mono text-foreground outline-none focus:border-primary/60 placeholder:text-muted-foreground/40"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                  Fuente
                </label>
                <select
                  value={newFuente}
                  onChange={(e) => {
                    const fuente = e.target.value as AssetFuente;
                    setNewFuente(fuente);
                    // Auto-set clasificacion based on fuente
                    const available = clasificacionesParaFuente(fuente);
                    if (available && !available.includes(newClasificacion)) {
                      setNewClasificacion(available[0]);
                    }
                  }}
                  className="h-7 rounded border border-border/40 bg-background/60 px-2 text-[10px] font-mono text-foreground outline-none focus:border-primary/60"
                >
                  <option value="IOL">IOL</option>
                  <option value="Yahoo">Yahoo</option>
                  <option value="ArgDatos">ArgDatos</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                  Clasificación
                </label>
                <select
                  value={newClasificacion}
                  onChange={(e) => setNewClasificacion(e.target.value as AssetClasificacion)}
                  className="h-7 rounded border border-border/40 bg-background/60 px-2 text-[10px] font-mono text-foreground outline-none focus:border-primary/60"
                >
                  {clasificacionesDisponibles.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                  Precio
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={newPrecio ?? ""}
                  onChange={(e) => setNewPrecio(e.target.value ? Number(e.target.value) : null)}
                  placeholder="0.00"
                  className="w-24 h-7 rounded border border-border/40 bg-background/60 px-2 text-[11px] font-mono text-foreground outline-none focus:border-primary/60 placeholder:text-muted-foreground/40"
                />
              </div>
              <button
                onClick={addAsset}
                disabled={!newTicker.trim()}
                className="h-7 px-4 rounded text-[10px] font-mono font-semibold bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 transition-colors disabled:opacity-40"
              >
                + Agregar activo
              </button>
            </div>
            {revisarNota && (
              <p className="text-[10px] font-mono text-amber-400/90 bg-amber-400/5 border border-amber-400/20 rounded px-2 py-1.5">
                {revisarNota}
              </p>
            )}
          </div>

          {/* ── Assets table ── */}
          {activePortfolio.assets.length > 0 ? (
            <div className="overflow-x-auto rounded border border-border/40">
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border/40 bg-background/40">
                  <tr>
                    <th className="px-2 py-1.5">Ticker</th>
                    <th className="px-2 py-1.5 text-right w-20">Cantidad</th>
                    <th className="px-2 py-1.5 w-20">Fuente</th>
                    <th className="px-2 py-1.5 w-24">Clasificación</th>
                    <th className="px-2 py-1.5 w-16">Mercado</th>
                    <th className="px-2 py-1.5 text-center w-12">Mon</th>
                    <th className="px-2 py-1.5 text-right w-20">Precio</th>
                    <th className="px-2 py-1.5 text-right w-24">Valorizado</th>
                    <th className="px-2 py-1.5 text-right w-16">Peso %</th>
                    <th className="px-2 py-1.5 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {activePortfolio.assets.map((a) => {
                    const peso = totalValorizado > 0 ? (a.valorizado / totalValorizado) * 100 : 0;
                    return (
                      <tr
                        key={a.id}
                        className="border-b border-border/20 last:border-0 hover:bg-muted/10"
                      >
                        <td className="px-2 py-1 font-semibold text-foreground">{a.ticker}</td>
                        <td className="px-2 py-1 text-right">
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={a.cantidad}
                            onChange={(e) =>
                              updateAssetCantidad(
                                activePortfolio.id,
                                a.id,
                                Math.max(0, parseInt(e.target.value) || 0),
                              )
                            }
                            className="w-16 text-right bg-transparent border-b border-border/30 text-[10px] font-mono text-foreground outline-none focus:border-primary/60"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <select
                            value={a.fuente}
                            onChange={(e) =>
                              updateAssetFuente(
                                activePortfolio.id,
                                a.id,
                                e.target.value as AssetFuente,
                              )
                            }
                            className="bg-transparent border-b border-border/30 text-[10px] font-mono text-foreground outline-none focus:border-primary/60"
                          >
                            <option value="IOL">IOL</option>
                            <option value="Yahoo">Yahoo</option>
                            <option value="ArgDatos">ArgDatos</option>
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <select
                            value={a.clasificacion}
                            onChange={(e) =>
                              updateAssetClasificacion(
                                activePortfolio.id,
                                a.id,
                                e.target.value as AssetClasificacion,
                              )
                            }
                            className="bg-transparent border-b border-border/30 text-[10px] font-mono text-foreground outline-none focus:border-primary/60 max-w-[90px]"
                          >
                            {clasificacionesParaFuente(a.fuente).map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1 text-[10px] text-muted-foreground">{a.mercado}</td>
                        <td className="px-2 py-1 text-center text-[9px] text-muted-foreground">
                          {a.moneda}
                        </td>
                        <td className="px-2 py-1 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={a.precio ?? 0}
                            onChange={(e) =>
                              updateAssetPrecio(
                                activePortfolio.id,
                                a.id,
                                Number(e.target.value) || 0,
                              )
                            }
                            className="w-16 text-right bg-transparent border-b border-border/30 text-[10px] font-mono text-foreground outline-none focus:border-primary/60"
                          />
                        </td>
                        <td className="px-2 py-1 text-right font-semibold text-foreground">
                          ${fmtNum(a.valorizado)}
                        </td>
                        <td className="px-2 py-1 text-right text-foreground">{peso.toFixed(1)}%</td>
                        <td className="px-2 py-1 text-center">
                          <button
                            onClick={() => removeAsset(activePortfolio.id, a.id)}
                            className="text-[9px] text-red-400 hover:text-red-300"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-border/40 bg-muted/10">
                  <tr>
                    <td className="px-2 py-1.5 text-[10px] font-bold text-foreground">TOTAL</td>
                    <td className="px-2 py-1.5 text-right text-[10px] font-bold">
                      {activePortfolio.assets.length}
                    </td>
                    <td colSpan={5}></td>
                    <td className="px-2 py-1.5 text-right text-[10px] font-bold text-foreground">
                      ${fmtNum(totalValorizado)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[10px] font-bold text-foreground">
                      100%
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 rounded border border-dashed border-border/40 text-muted-foreground text-[10px] font-mono">
              No hay activos en este portafolio. Usá el formulario de arriba para agregar activos.
            </div>
          )}

          {/* ── Summary cards ── */}
          {activePortfolio.assets.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded border border-border/40 bg-background/40 p-3">
                <p className="mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                  Valor Total
                </p>
                <p className="mt-1 font-mono text-sm font-bold text-foreground">
                  ${fmtNum(totalValorizado)}
                </p>
              </div>
              <div className="rounded border border-border/40 bg-background/40 p-3">
                <p className="mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                  Total ARS
                </p>
                <p className="mt-1 font-mono text-sm font-bold text-foreground">
                  ${fmtNum(totalARS)}
                </p>
              </div>
              <div className="rounded border border-border/40 bg-background/40 p-3">
                <p className="mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                  Total USD
                </p>
                <p className="mt-1 font-mono text-sm font-bold text-foreground">
                  ${fmtNum(totalUSD)}
                </p>
              </div>
            </div>
          )}

          {/* ── Classification info ── */}
          <div className="rounded border border-border/40 bg-background/40 p-3">
            <p className="text-[10px] font-mono text-muted-foreground">
              Clasificación del portafolio:{" "}
              <span className="text-foreground font-semibold">
                {activePortfolio.classification}
              </span>
              {" · "}
              Activos:{" "}
              <span className="text-foreground font-semibold">{activePortfolio.assets.length}</span>
              {" · "}
              Monedas:{" "}
              <span className="text-foreground font-semibold">
                {[...new Set(activePortfolio.assets.map((a) => a.moneda))].join(" / ")}
              </span>
            </p>
            <p className="text-[9px] font-mono text-muted-foreground/60 mt-1">
              Fuentes disponibles: IOL · Yahoo Finance · ArgDatos — Clasificaciones según cada
              fuente
            </p>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-40 rounded border border-dashed border-border/40 text-muted-foreground text-[10px] font-mono">
          Creá un portafolio usando el campo "+ Nuevo" de arriba
        </div>
      )}
    </div>
  );
}
