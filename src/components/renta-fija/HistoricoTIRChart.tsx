// @ts-nocheck
"use client";
import { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { SerieHistoricaPoint } from "@/lib/renta-fija.functions";

interface HistoricoTIRChartProps {
  serie: SerieHistoricaPoint[];
  loading?: boolean;
}

export function HistoricoTIRChart({ serie, loading }: HistoricoTIRChartProps) {
  const data = useMemo(
    () =>
      [...serie]
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map((p) => ({
          fecha: p.fecha,
          tir: p.tir != null ? +(p.tir * 100).toFixed(2) : null,
          paridad: p.paridad != null ? +p.paridad.toFixed(2) : null,
          precio: p.precio,
          interesesCorridos: p.precioTecnico != null ? p.precioTecnico : null,
        })),
    [serie],
  );

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-[11px] text-muted-foreground">
        Cargando histórico...
      </div>
    );
  }

  if (data.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center text-[11px] text-muted-foreground">
        No hay suficientes datos históricos.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/40 bg-background/40/40 p-3">
      <div className="mono mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Histórico TIR / Paridad
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data}>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="fecha"
            tick={{ fontSize: 9, fontFamily: "monospace" }}
            tickFormatter={(v: string) => v?.slice(5, 10) ?? ""}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 9, fontFamily: "monospace" }}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            stroke="#4ade80"
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 9, fontFamily: "monospace" }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            stroke="#a855f7"
          />
          <Tooltip
            contentStyle={{
              background: "#141a28",
              border: "1px solid #2b3242",
              borderRadius: 8,
              fontSize: 11,
              fontFamily: "monospace",
            }}
            formatter={(value: number, name: string) => {
              if (name === "TIR") return [`${value.toFixed(2)}%`, "TIR"];
              if (name === "Paridad") return [`${value.toFixed(2)}%`, "Paridad"];
              if (name === "Precio") return [`$${value.toFixed(2)}`, "Precio"];
              if (name === "Int. Corridos") return [`$${value.toFixed(2)}`, "Int. Corridos"];
              return [value, name];
            }}
            labelFormatter={(label: string) => `Fecha: ${label}`}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="tir"
            stroke="#4ade80"
            dot={false}
            strokeWidth={2}
            name="TIR"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="paridad"
            stroke="#a855f7"
            dot={false}
            strokeWidth={2}
            name="Paridad"
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Interpretación dinámica */}
      {(() => {
        const tirs = serie.filter((p) => p.tir !== null).map((p) => p.tir as number);
        if (tirs.length < 10) return null;
        const tirsSorted = [...tirs].sort((a, b) => a - b);
        const p25 = tirsSorted[Math.floor(tirsSorted.length * 0.25)];
        const p75 = tirsSorted[Math.floor(tirsSorted.length * 0.75)];
        const ultimaTIR = tirs[tirs.length - 1];
        const ultimoPunto = serie[serie.length - 1];
        const paridadActual = ultimoPunto?.paridad ?? 100;
        const ultimas20 = tirs.slice(-20);
        const tendenciaBaja =
          ultimas20.length >= 5 && ultimas20[ultimas20.length - 1] < ultimas20[0];
        let interpretacion = "";
        if (ultimaTIR > p75) {
          interpretacion =
            "La TIR está en la zona más alta del período — el mercado le exige más rendimiento a este bono.";
        } else if (ultimaTIR < p25) {
          interpretacion =
            "La TIR está en la zona más baja del período — el bono comprimió rendimiento (subió de precio).";
        } else if (paridadActual < 100 && tendenciaBaja) {
          interpretacion =
            "El bono cotiza bajo la par y su rendimiento viene comprimiendo — puede ser indicio de mayor apetito.";
        } else {
          interpretacion = "La TIR se mantiene en rangos normales para el período analizado.";
        }
        return (
          <div className="mt-3 rounded-lg border border-border/40 bg-muted/10 p-3 text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Interpretación: </span>
            {interpretacion}
          </div>
        );
      })()}
    </div>
  );
}
