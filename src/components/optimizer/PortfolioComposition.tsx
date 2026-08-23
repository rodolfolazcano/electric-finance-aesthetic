// @ts-nocheck
import { useState, useMemo, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardPaste, Database, RefreshCw, Sparkles, TrendingUp, Wallet, LineChart } from "lucide-react";
import { useCriptoYaPolling } from "@/hooks/useCriptoYaPolling";
import { useIOLSession } from "@/lib/iol-context";
import {
  importarPortfolioPegado,
  guardarPortafolioCliente,
  listarPortafoliosGuardados,
  eliminarPortafolioGuardado,
  cargarPortafolioGuardado,
  type DataFrameRow,
  type ClienteDetectado,
  type ResumenPortfolio,
  type PortafolioImportado,
  type PortafolioGuardado,
} from "@/lib/portfolio-agent.functions";

const fmtNum = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPct = (n: number | null) =>
  n == null ? "--" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-primary-foreground" : "bg-current"}`} />
      {children}
    </button>
  );
}

export function PortfolioComposition() {
  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [resultado, setResultado] = useState<PortafolioImportado | null>(null);
  const [filas, setFilas] = useState<DataFrameRow[]>([]);
  const [cliente, setCliente] = useState<ClienteDetectado | null>(null);
  const [resumen, setResumen] = useState<ResumenPortfolio | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);

  const [monedaDisplay, setMonedaDisplay] = useState<"ARS" | "USD">("ARS");
  const [tcMode, setTcMode] = useState<"MEP" | "CCL">("MEP");
  const [groupMode, setGroupMode] = useState<"tipo" | "mercado">("tipo");

  const [guardando, setGuardando] = useState(false);
  const [guardados, setGuardados] = useState<PortafolioGuardado[]>([]);
  const [cargandoGuardados, setCargandoGuardados] = useState(false);
  const [mostrarGuardados, setMostrarGuardados] = useState(false);

  const { dolar, loading: dolarLoading } = useCriptoYaPolling(30000);
  const tcRate = useMemo(() => {
    if (!dolar) return 1350;
    if (tcMode === "MEP") return dolar.mep || 1350;
    return dolar.ccl || 1350;
  }, [dolar, tcMode]);

  const { accessToken } = useIOLSession();
  const importarFn = useServerFn(importarPortfolioPegado);
  const guardarFn = useServerFn(guardarPortafolioCliente);
  const listarFn = useServerFn(listarPortafoliosGuardados);
  const eliminarFn = useServerFn(eliminarPortafolioGuardado);
  const cargarFn = useServerFn(cargarPortafolioGuardado);

  const handleImportar = useCallback(async () => {
    if (!pasteText.trim()) return;
    setParsing(true);
    try {
      const result = await importarFn({ data: { texto: pasteText, bearerToken: accessToken ?? undefined } });
      setResultado(result);
      setFilas(result.filas);
      setCliente(result.cliente);
      setResumen(result.resumen);
      setAvisos(result.avisos);
    } catch {
      setAvisos(["Error al analizar el texto pegado."]);
    } finally {
      setParsing(false);
    }
  }, [pasteText, importarFn, accessToken]);

  const handleGuardar = useCallback(async () => {
    if (!resultado || !cliente || !resumen) return;
    setGuardando(true);
    try {
      const res = await guardarFn({ data: { cliente, df: filas, resumen, textoOriginal: pasteText } });
      setAvisos((prev) =>
        res.error ? [...prev, `Error al guardar: ${res.error}`] : [...prev, "✓ Portafolio guardado en base de datos."],
      );
      if (!res.error) cargarGuardados();
    } finally {
      setGuardando(false);
    }
  }, [resultado, cliente, filas, resumen, pasteText, guardarFn]);

  const cargarGuardados = useCallback(async () => {
    setCargandoGuardados(true);
    try {
      setGuardados(await listarFn());
    } finally {
      setCargandoGuardados(false);
    }
  }, [listarFn]);

  const handleEliminar = useCallback(
    async (id: string) => {
      await eliminarFn({ data: { id } });
      setGuardados((prev) => prev.filter((g) => g.id !== id));
    },
    [eliminarFn],
  );

  const handleCargar = useCallback(
    async (id: string) => {
      const g = await cargarFn({ data: { id } });
      if (!g) return;
      const cli: ClienteDetectado = {
        nombreCompleto: g.cliente_nombre,
        cuenta: g.cliente_cuenta,
        alias: g.cliente_alias,
        perfil: g.cliente_perfil,
        custodio: g.cliente_custodio,
        mandato: null,
        arancel: null,
      };
      setCliente(cli);
      setFilas(g.df as DataFrameRow[]);
      setResumen(g.resumen as ResumenPortfolio);
      setResultado({ cliente: cli, filas: g.df as DataFrameRow[], resumen: g.resumen as ResumenPortfolio, avisos: [] });
      setAvisos(["✓ Portafolio cargado desde base de datos."]);
    },
    [cargarFn],
  );

  // Conversión dinámica ARS ⇄ USD desde el mismo DF
  const filasConvertidas = useMemo(() => {
    return filas.map((f) => {
      let monto = f.montoMonedaOrigen;
      const mo = f.monedaOrigen;
      if (monedaDisplay === "USD" && (mo === "ARS")) monto = f.montoMonedaOrigen / tcRate;
      else if (monedaDisplay === "ARS" && (mo === "USD" || mo === "USD.C")) monto = f.montoMonedaOrigen * tcRate;
      return { ...f, montoConvertido: monto };
    });
  }, [filas, monedaDisplay, tcRate]);

  const totalConvertido = useMemo(() => filasConvertidas.reduce((s, f) => s + f.montoConvertido, 0), [filasConvertidas]);

  const groupedData = useMemo(() => {
    const map = new Map<string, { rows: any[]; monto: number }>();
    for (const f of filasConvertidas) {
      const key =
        groupMode === "tipo"
          ? `${f.categoriaMacro} · ${f.tipo}`
          : f.categoriaMacro === "Efectivo"
            ? "Efectivo"
            : f.mercado;
      const prev = map.get(key) ?? { rows: [], monto: 0 };
      prev.rows.push(f);
      prev.monto += f.montoConvertido;
      map.set(key, prev);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].monto - a[1].monto)
      .map(([grupo, d]) => ({
        grupo,
        rows: d.rows.sort((a, b) => b.montoConvertido - a.montoConvertido),
        monto: d.monto,
        pesoPct: totalConvertido > 0 ? (d.monto / totalConvertido) * 100 : 0,
      }));
  }, [filasConvertidas, totalConvertido, groupMode]);

  const cards = useMemo(() => {
    const invertido = filasConvertidas.filter((f) => f.categoriaMacro !== "Efectivo").reduce((s, f) => s + f.montoConvertido, 0);
    const efectivo = filasConvertidas.filter((f) => f.categoriaMacro === "Efectivo").reduce((s, f) => s + f.montoConvertido, 0);
    return [
      { label: "Patrimonio Total", value: invertido + efectivo },
      { label: `Invertido (${((invertido / (invertido + efectivo || 1)) * 100).toFixed(1)}%)`, value: invertido },
      { label: "Efectivo", value: efectivo },
      { label: `TC ${tcMode} aplicado`, value: tcRate, isTC: true },
    ];
  }, [filasConvertidas, tcMode, tcRate]);

  const symbolPrefix = monedaDisplay === "ARS" ? "$" : "US$";

  return (
    <div className="space-y-8">
      {/* ══════════ HEADER — estilo hero home ══════════ */}
      <div>
        <p className="eyebrow flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Agente clasificador · Catálogo CNV + IOL en vivo
        </p>
        <h1 className="mt-4 font-display text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-tight tracking-tight">
          Composición del <em className="italic text-primary">portafolio</em>
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground lg:text-[17px]">
          Pegá el texto de tu broker (IOL, INVIU, Bull Market…), un CSV o una lista simple.
          El agente razona sobre sección, descripción y catálogo, consulta la API de IOL para los
          tickers desconocidos y agrupa todo en DataFrames con visualización dinámica en{" "}
          <span className="text-foreground">ARS</span> y <span className="text-foreground">USD</span>.
        </p>
      </div>

      {/* ══════════ PASTE — tarjeta home ══════════ */}
      <div className="rounded-2xl border border-border/70 bg-secondary/20 p-5 transition-colors sm:p-6">
        <p className="flex items-center gap-2 font-display text-[15px] font-semibold text-foreground">
          <ClipboardPaste className="h-4 w-4 flex-none text-primary" />
          Pegar portafolio (cualquier formato)
        </p>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={"Pegá acá el texto completo de tu broker…\no CSV: ticker,cantidad,precio\no líneas: GGAL 100 5000"}
          className="mt-4 h-52 w-full resize-y rounded-xl border border-border bg-background px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/60"
        />
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            onClick={handleImportar}
            disabled={!pasteText.trim() || parsing}
            className="btn-primary inline-flex items-center gap-2.5 rounded-full px-6 py-3 text-[13.5px] font-semibold disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" />
            {parsing ? "Analizando…" : "Analizar e importar"}
          </button>
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            El agente detecta cliente · tipo · mercado · moneda
          </span>
        </div>
      </div>

      {/* ══════════ CLIENTE — banner ══════════ */}
      {cliente?.nombreCompleto && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/70 bg-background/40 px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <p className="font-display text-[16px] font-semibold leading-none">{cliente.nombreCompleto}</p>
            {cliente.perfil && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ring-1 ${
                  /conserv/i.test(cliente.perfil)
                    ? "bg-emerald-400/10 text-emerald-400 ring-emerald-400/30"
                    : /moderad/i.test(cliente.perfil)
                      ? "bg-gold/10 text-gold ring-gold/40"
                      : "bg-rose-400/10 text-rose-400 ring-rose-400/30"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {cliente.perfil}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            {cliente.cuenta && <span>Cuenta {cliente.cuenta}</span>}
            {cliente.alias && <span>{cliente.alias}</span>}
            {cliente.custodio && <span>Custodio {cliente.custodio}</span>}
            {cliente.arancel && <span>Arancel {cliente.arancel}</span>}
          </div>
        </div>
      )}

      {/* Avisos */}
      {avisos.length > 0 && (
        <div className="space-y-1.5" aria-live="polite">
          {avisos.map((a, i) => (
            <p key={i} className="rounded-xl border border-gold/25 bg-gold/5 px-3 py-2 text-[12px] text-gold">
              {a}
            </p>
          ))}
        </div>
      )}

      {/* ══════════ CONTROLES ══════════ */}
      {filas.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Chip active={monedaDisplay === "ARS"} onClick={() => setMonedaDisplay("ARS")}>Ver en ARS</Chip>
          <Chip active={monedaDisplay === "USD"} onClick={() => setMonedaDisplay("USD")}>Ver en USD</Chip>
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
          <Chip active={tcMode === "MEP"} onClick={() => setTcMode("MEP")}>TC MEP</Chip>
          <Chip active={tcMode === "CCL"} onClick={() => setTcMode("CCL")}>TC CCL</Chip>
          <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:inline">
            {dolarLoading ? "cotizando…" : `$ ${fmtNum(tcRate)}`}
          </span>
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
          <Chip active={groupMode === "tipo"} onClick={() => setGroupMode("tipo")}>Por tipo</Chip>
          <Chip active={groupMode === "mercado"} onClick={() => setGroupMode("mercado")}>Por mercado</Chip>
          <span className="flex-1" />
          <button
            onClick={handleGuardar}
            disabled={guardando}
            className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/[0.07] px-5 py-2.5 text-[12.5px] font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-40"
          >
            <Database className="h-4 w-4" />
            {guardando ? "Guardando…" : "Guardar en base de datos"}
          </button>
        </div>
      )}

      {/* ══════════ STATS — barra credibilidad home ══════════ */}
      {filas.length > 0 && (
        <section className="rounded-2xl border-y border-border/50 bg-background/20 backdrop-blur-sm">
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 p-6 md:grid-cols-4 md:divide-x md:divide-border/70 lg:p-8">
            {cards.map((c) => (
              <div key={c.label} className="md:px-6 md:first:pl-0">
                <p className="font-display text-[24px] font-semibold leading-none text-primary tabular-nums lg:text-[28px]">
                  {c.isTC ? `$ ${fmtNum(c.value)}` : `${symbolPrefix} ${fmtNum(c.value)}`}
                </p>
                <p className="mt-2.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  {c.label}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ══════════ DATAFRAMES agrupados ══════════ */}
      {groupedData.map((grupo) => (
        <div
          key={grupo.grupo}
          className="overflow-hidden rounded-2xl border border-border/70 bg-secondary/20 transition-colors hover:border-primary/40"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-5 py-4">
            <p className="flex items-center gap-2 font-display text-[15px] font-semibold text-foreground">
              {grupo.grupo.startsWith("RentaFija") ? (
                <LineChart className="h-4 w-4 text-primary" />
              ) : grupo.grupo.startsWith("Efectivo") ? (
                <Wallet className="h-4 w-4 text-primary" />
              ) : (
                <TrendingUp className="h-4 w-4 text-primary" />
              )}
              {grupo.grupo.replace("RentaVariable · ", "").replace("RentaFija · ", "")}
            </p>
            <div className="flex items-center gap-5 text-[12px] tabular-nums text-muted-foreground">
              <span>{grupo.rows.length} activos</span>
              <span className="font-display text-[14px] font-semibold text-foreground">
                {symbolPrefix} {fmtNum(grupo.monto)}
              </span>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-semibold text-primary">
                {grupo.pesoPct.toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left font-mono text-[12.5px]">
              <thead>
                <tr className="border-b border-border/40 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Ticker</th>
                  <th className="py-2.5 pr-3 font-medium">Nombre</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cant</th>
                  <th className="px-3 py-2.5 text-right font-medium">Último</th>
                  <th className="px-3 py-2.5 text-right font-medium">Promedio</th>
                  <th className="px-3 py-2.5 text-right font-medium">Var 24h</th>
                  <th className="px-3 py-2.5 text-right font-medium">Rend.</th>
                  <th className="px-3 py-2.5 text-right font-medium">Monto</th>
                  <th className="px-5 py-2.5 text-right font-medium">Peso</th>
                </tr>
              </thead>
              <tbody>
                {grupo.rows.map((f) => (
                  <tr key={f.id} className="border-b border-border/20 transition-colors last:border-0 hover:bg-muted/20">
                    <td className="px-5 py-2.5 font-semibold text-foreground">{f.ticker}</td>
                    <td className="max-w-[180px] truncate py-2.5 pr-3 text-muted-foreground" title={f.nombre}>
                      {f.nombre || "--"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{f.cantidad || "--"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {f.ultimoOperado != null ? fmtNum(f.ultimoOperado) : "--"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {f.precioPromedio != null ? fmtNum(f.precioPromedio) : "--"}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${(f.variacion24h ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {fmtPct(f.variacion24h)}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${(f.rendimientoPct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {fmtPct(f.rendimientoPct)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-foreground">
                      {symbolPrefix} {fmtNum(f.montoConvertido)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                      {totalConvertido > 0 ? ((f.montoConvertido / totalConvertido) * 100).toFixed(1) : "0.0"}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/50 bg-background/30 text-[11px] font-bold uppercase tracking-wider">
                  <td className="px-5 py-3" colSpan={7}>Total {grupo.grupo}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-foreground">
                    {symbolPrefix} {fmtNum(grupo.monto)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-primary">
                    {grupo.pesoPct.toFixed(1)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}

      {/* Desconocidos */}
      {resumen?.tickersDesconocidos?.length > 0 && (
        <p className="rounded-xl border border-gold/25 bg-gold/5 px-3 py-2 text-[12px] text-gold">
          Tickers no resueltos ni por catálogo ni por IOL: {resumen.tickersDesconocidos.join(", ")}
        </p>
      )}

      {/* Optimizar */}
      {filas.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            disabled={filas.filter((f) => f.tipo !== "Moneda").length === 0}
            onClick={() => {
              const tickers = filas.filter((f) => f.tipo !== "Moneda").map((f) => f.ticker);
              alert(`Optimizar cartera (${tickers.length} activos): ${tickers.join(", ")}`);
            }}
            className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-[12.5px] font-semibold text-foreground transition-colors hover:border-primary/50"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            Optimizar cartera
          </button>
        </div>
      )}

      {/* Vacío */}
      {filas.length === 0 && !parsing && (
        <div className="flex h-36 items-center justify-center rounded-2xl border border-dashed border-border/60 text-[13px] text-muted-foreground">
          Pegá el texto de tu portafolio arriba para que el agente lo analice.
        </div>
      )}

      {/* ══════════ GUARDADOS ══════════ */}
      <div className="rounded-2xl border border-border/70 bg-secondary/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-display text-[15px] font-semibold">
            <Database className="h-4 w-4 text-primary" />
            Portafolios guardados
          </p>
          <button
            onClick={() => {
              if (!mostrarGuardados) cargarGuardados();
              setMostrarGuardados((v) => !v);
            }}
            disabled={cargandoGuardados}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground"
          >
            <RefreshCw className={`h-3 w-3 ${cargandoGuardados ? "animate-spin" : ""}`} />
            Refrescar
          </button>
        </div>

        {mostrarGuardados && guardados.length === 0 && (
          <p className="mt-3 text-[12.5px] text-muted-foreground/70">
            No hay portafolios guardados todavía.
          </p>
        )}
        {guardados.map((g) => (
          <div
            key={g.id}
            className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/40 bg-background/40 px-4 py-2.5"
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
              <span className="font-display font-semibold">{g.cliente_nombre}</span>
              {g.cliente_cuenta && <span className="text-muted-foreground">#{g.cliente_cuenta}</span>}
              <span className="tabular-nums text-muted-foreground/70">
                {new Date(g.created_at).toLocaleDateString("es-AR")} · {(g.df ?? []).length} activos
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCargar(g.id)}
                className="rounded-full border border-primary/40 bg-primary/[0.07] px-4 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/15"
              >
                Cargar
              </button>
              <button
                onClick={() => handleEliminar(g.id)}
                aria-label="Eliminar portafolio guardado"
                className="rounded-full border border-rose-400/30 px-3 py-1 text-[11px] font-semibold text-rose-400 transition-colors hover:bg-rose-400/10"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <p className="text-[11.5px] leading-relaxed text-muted-foreground/70">
        Herramientas informativas con datos de terceros. No constituyen recomendación de inversión.
        Clasificación automática vía catálogo integrado + API IOL. Fuentes: BYMA · IOL · Yahoo Finance ·
        BCRA · CriptoYa · Delay 15–20'.
      </p>
    </div>
  );
}
