/** Valoración con datos reales + noticias de sustento, para el chat.
 *  Combina el pipeline del Asesor (paper → Yahoo Finance → DCF) con la
 *  búsqueda de noticias recientes sobre la empresa, para que el resultado
 *  quede fundamentado por noticias reales que coincidan con el dato. */

import {
  analisisValorIntrinseco,
  textoAnalisis,
  type AnalisisCompleto,
} from "./valuation-pipeline";
import { consultarNoticias } from "./noticias.server";
import { buscar, dominio, extraerTexto } from "./search.server";
import type { FuenteMercado } from "./mercado.server";

export interface ResultadoValorIntrinseco {
  texto: string;
  fuentes: FuenteMercado[];
  analisis: AnalisisCompleto | null;
  error: string | null;
  noticias: string;
}

/** Validación en la web: resultados relevantes que contrasten el valor/perspectiva de la empresa. */
async function validarEnWeb(
  consulta: string,
  simbolo: string,
): Promise<{ texto: string; fuentes: FuenteMercado[] }> {
  const consultaTexto = `${consulta} ${simbolo} análisis valor intrínseco precio objetivo`;
  try {
    const results = await buscar(consultaTexto);
    const tokens = new Set<string>();
    for (const tok of `${simbolo} ${consulta}`.toLowerCase().split(/\s+/)) {
      const t = tok.replace(/\.\w{1,4}$/, "").trim();
      if (t.length >= 3) tokens.add(t);
    }
    const relevantes = (results ?? []).filter((r) => {
      const texto = `${r.title} ${r.url}`.toLowerCase();
      return [...tokens].some((t) => texto.includes(t));
    });
    const top = (relevantes.length ? relevantes : (results ?? [])).slice(0, 3);
    const fuentes: FuenteMercado[] = top
      .filter((r) => r.url)
      .map((r) => ({ dominio: dominio(r.url), url: r.url, title: r.title }));
    if (!top.length) return { texto: "s/d", fuentes: [] };
    const cuerpos = await Promise.all(
      top.map(async (r) => {
        let snippet = r.snippet?.trim() ?? "";
        if (!snippet) {
          try {
            snippet = (await extraerTexto(r.url, 900)).trim().slice(0, 900);
          } catch {
            snippet = "";
          }
        }
        return snippet;
      }),
    );
    const cuerpo = top
      .map((r, i) => {
        const c = cuerpos[i] || "Contenido no disponible.";
        return `${i + 1}. ${r.title}\n${c}\nFuente: ${dominio(r.url)}`;
      })
      .join("\n\n");
    return { texto: `Validación en la web sobre ${consulta} (${simbolo}):\n${cuerpo}`, fuentes };
  } catch {
    return { texto: "s/d", fuentes: [] };
  }
}

export async function valorIntrinsecoConNoticias(
  simbolo: string,
  tema?: string,
): Promise<ResultadoValorIntrinseco> {
  const temaEfectivo = (tema ?? "").trim() || "DCF Flujo de Caja Descontado";
  const consulta = (simbolo ?? "").trim();

  let analisis: AnalisisCompleto | null = null;
  try {
    analisis = await analisisValorIntrinseco(consulta, temaEfectivo);
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: falló el cálculo de valor intrínseco de "${consulta}". ${e instanceof Error ? e.message : "error inesperado"}`,
      fuentes: [],
      analisis: null,
      error: e instanceof Error ? e.message : "error inesperado",
      noticias: "",
    };
  }

  const fuentes: FuenteMercado[] = [];
  for (const f of analisis.fuentes ?? []) {
    if (f.url) fuentes.push({ dominio: f.tipo, url: f.url, title: f.descripcion });
  }

  // Noticias recientes sobre la empresa para fundamentar el dato y el resultado.
  const nombreCompania = analisis?.empresa ?? analisis?.simboloResuelto ?? consulta;
  let textoNoticias = "";
  try {
    const noticias = await consultarNoticias(nombreCompania, "última semana");
    textoNoticias = noticias.texto;
    for (const f of noticias.fuentes) {
      if (!fuentes.some((x) => x.url === f.url)) fuentes.push(f);
    }
  } catch {
    textoNoticias = `No se pudieron obtener noticias recientes sobre ${nombreCompania}.`;
  }

  // Validación en la web: contrasta la valoración con análisis/perspectivas publicadas.
  const validacion = await validarEnWeb(nombreCompania, consulta);
  for (const f of validacion.fuentes) {
    if (!fuentes.some((x) => x.url === f.url)) fuentes.push(f);
  }

  const texto = [
    textoAnalisis(analisis),
    "",
    "NOTICIAS QUE FUNDAMENTAN EL DATO Y EL RESULTADO:",
    textoNoticias,
    "",
    "VALIDACIÓN EN LA WEB:",
    validacion.texto,
  ].join("\n");

  return { texto, fuentes, analisis, error: null, noticias: textoNoticias };
}
