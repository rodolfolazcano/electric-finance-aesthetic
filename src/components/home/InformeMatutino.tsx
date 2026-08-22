import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { getInformeDelDia } from "@/lib/informe-matutino/persistence.functions";
import { CnvDisclaimer } from "@/components/shared/CnvDisclaimer";
import type { InformeMatutinoIA } from "@/lib/informe-matutino/types";
import type { SemaforoResult } from "@/lib/finance.functions";

const colorHumor: Record<string, string> = {
  "risk-on": "bg-success/15 text-success border-success/30",
  "risk-off": "bg-danger/15 text-danger border-danger/30",
  mixto: "bg-warning/15 text-warning border-warning/30",
};

const labelHumor: Record<string, string> = {
  "risk-on": "Risk On",
  "risk-off": "Risk Off",
  mixto: "Mixto",
};

const colorRelevancia: Record<string, string> = {
  alta: "bg-danger/10 text-danger",
  media: "bg-warning/10 text-warning",
  baja: "bg-muted/20 text-muted-foreground",
};

function formatearHora(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function SkeletonLine({ width }: { width: string }) {
  return <div className={`h-3 rounded bg-white/5 ${width}`} />;
}

function Skeleton() {
  return (
    <section className="border-y border-white/10 bg-white/[0.01] py-16 sm:py-20">
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
        <div className="animate-pulse space-y-6">
          <div className="flex items-center gap-3">
            <SkeletonLine width="w-32" />
            <SkeletonLine width="w-20" />
          </div>
          <SkeletonLine width="w-full" />
          <SkeletonLine width="w-3/4" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <SkeletonLine width="w-1/2" />
              <SkeletonLine width="w-full" />
              <SkeletonLine width="w-2/3" />
            </div>
            <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <SkeletonLine width="w-1/2" />
              <SkeletonLine width="w-full" />
              <SkeletonLine width="w-2/3" />
            </div>
            <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <SkeletonLine width="w-1/2" />
              <SkeletonLine width="w-full" />
              <SkeletonLine width="w-2/3" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ErrorState() {
  return (
    <section className="border-y border-white/10 bg-white/[0.01] py-16 sm:py-20">
      <div className="mx-auto w-full max-w-7xl px-5 text-center sm:px-8">
        <p className="text-sm text-muted-foreground">
          No pudimos cargar el informe matutino de hoy. Volvé a intentar más tarde.
        </p>
      </div>
    </section>
  );
}

function BulletsCard({ titular, bullets }: { titular: string; bullets: string[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 backdrop-blur-md">
      <h4 className="text-sm font-medium text-foreground">{titular}</h4>
      {bullets.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-muted-foreground">
              <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-primary/40" />
              {b}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PortafolioRow({ item }: { item: SemaforoResult }) {
  const colorLight =
    item.light === "green"
      ? "bg-success/10 text-success"
      : item.light === "yellow"
        ? "bg-warning/10 text-warning"
        : "bg-danger/10 text-danger";
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-semibold text-foreground">{item.ticker}</span>
        <span
          className={`rounded-md px-1.5 py-0.5 font-mono text-[8px] font-medium uppercase tracking-wider ${colorLight}`}
        >
          {item.light === "green" ? "OK" : item.light === "yellow" ? "!" : "!!"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-foreground/90">
          {item.price.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
        </span>
        <span
          className={`font-mono text-[10px] ${item.change1d >= 0 ? "text-success" : "text-danger"}`}
        >
          {item.change1d >= 0 ? "+" : ""}
          {item.change1d.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

export function InformeMatutino() {
  const fn = useServerFn(getInformeDelDia);
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["informe-matutino"],
    queryFn: () => fn(),
    staleTime: 15 * 60_000,
    retry: 1,
  });

  if (isLoading) return <Skeleton />;
  if (isError || !data || data.fuenteDatos === "fallback-vacio") return <ErrorState />;

  const { ia, miPortafolioHoy, fuenteDatos } = data;

  return (
    <section className="border-y border-white/10 bg-white/[0.01] py-16 sm:py-20">
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
        {/* 1. Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-light tracking-tight sm:text-3xl">
              Informe <span className="italic text-primary">matutino</span>
            </h2>
            <span
              className={`rounded-full border px-2.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider ${colorHumor[ia.humorMercado] ?? ""}`}
            >
              {labelHumor[ia.humorMercado] ?? ia.humorMercado}
            </span>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground/50">
            {formatearHora(data.generadoEn)}
          </span>
        </div>

        {/* 2. resumenEjecutivo */}
        <p className="mb-8 text-balance text-sm leading-relaxed text-muted-foreground sm:text-base">
          {ia.resumenEjecutivo}
        </p>

        {/* 3. radarInternacional + 4. radarLocal */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BulletsCard
            titular={ia.radarInternacional.titular}
            bullets={ia.radarInternacional.bullets}
          />
          <BulletsCard titular={ia.radarLocal.titular} bullets={ia.radarLocal.bullets} />
        </div>

        {/* 5. agendaDelDia */}
        {ia.agendaDelDia.length > 0 && (
          <div className="mb-8">
            <h3 className="mb-3 text-sm font-medium text-foreground">Agenda del día</h3>
            <div className="space-y-1">
              {ia.agendaDelDia.map((ev, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-2 backdrop-blur-md"
                >
                  <span className="font-mono text-[10px] text-muted-foreground/60">{ev.hora}</span>
                  <span className="flex-1 text-[13px] text-foreground/90">{ev.evento}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 font-mono text-[8px] font-medium uppercase tracking-wider ${colorRelevancia[ev.relevancia] ?? ""}`}
                  >
                    {ev.relevancia}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. miPortafolioHoy */}
        {miPortafolioHoy && miPortafolioHoy.length > 0 && (
          <div className="mb-8">
            <h3 className="mb-3 text-sm font-medium text-foreground">Mi portafolio</h3>
            <div className="space-y-1.5">
              {miPortafolioHoy.map((item) => (
                <PortafolioRow key={item.ticker} item={item} />
              ))}
            </div>
          </div>
        )}

        {/* 7. oportunidadesDelDia */}
        {ia.oportunidadesDelDia.length > 0 && (
          <div className="mb-8">
            <h3 className="mb-3 text-sm font-medium text-foreground">Oportunidades del día</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ia.oportunidadesDelDia.map((op, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-2.5 backdrop-blur-md"
                >
                  <span className="font-mono text-[11px] font-semibold text-foreground">
                    {op.activo}
                  </span>
                  <p className="mt-1 text-[12px] text-muted-foreground">{op.motivo}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 8. recomendacionPorPerfil */}
        {ia.recomendacionPorPerfil.length > 0 && (
          <div className="mb-8">
            <h3 className="mb-3 text-sm font-medium text-foreground">Recomendación por perfil</h3>
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                    <th className="px-4 py-2.5 font-medium">Perfil</th>
                    <th className="px-4 py-2.5 font-medium">Clase de activo</th>
                    <th className="px-4 py-2.5 font-medium">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {ia.recomendacionPorPerfil.map((r, i) => (
                    <tr key={i} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-foreground">{r.perfil}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.claseActivo}</td>
                      <td className="px-4 py-2.5 text-muted-foreground/80">{r.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 9. herramientasSugeridas */}
        {ia.herramientasSugeridas.length > 0 && (
          <div className="mb-8">
            <h3 className="mb-3 text-sm font-medium text-foreground">Herramientas sugeridas</h3>
            <div className="flex flex-wrap gap-2">
              {ia.herramientasSugeridas.map((h, i) => (
                <button
                  key={i}
                  onClick={() =>
                    navigate({
                      to: "/herramientas",
                      search: { tab: h.tab as string, subTab: undefined, ticker: undefined },
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-[11px] font-medium text-primary transition-all hover:bg-primary/10"
                >
                  {h.motivo}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 10. Footer */}
        <div className="space-y-2 border-t border-white/10 pt-4 text-center">
          <CnvDisclaimer />
          {fuenteDatos === "fallback-ayer" && (
            <p className="font-mono text-[9px] text-muted-foreground/40">
              Mostrando el último informe disponible (ayer)
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
