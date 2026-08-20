/**
 * Orquestación del asistente según el modelo seleccionado por el usuario.
 *
 * Decide:
 * - Qué modelo redacta la respuesta final (modelo de salida).
 * - Qué modelo actúa como agente planner (razonamiento / decide y ejecuta tools).
 * - Qué skills oficiales se inyectan al prompt de cada modelo.
 * - Parámetros de invocación (thinking, max_tokens, reasoning_budget).
 */

import {
  type AgentModel,
  MODELO_PLANNER_POR_DEFECTO,
  MODELO_POR_DEFECTO,
  obtenerModelo,
} from "@/lib/model-registry";
import { construirPromptSkills } from "@/lib/skills";

export type ConfiguracionOrquestacion = {
  /** Modelo que redacta la respuesta final al usuario. */
  modeloSalida: AgentModel;
  /** Modelo agente que decide y ejecuta herramientas (planner). */
  modeloPlanner: AgentModel;
  /** Prompt adicional con las skills orquestadas (para el modelo de salida). */
  promptSkillsSalida: string;
  /** Prompt adicional con las skills orquestadas (para el planner). */
  promptSkillsPlanner: string;
};

/**
 * Si el usuario selecciona un modelo de razonamiento, ese mismo modelo actúa
 * como planner y como salida (es capaz de ambas cosas). Si selecciona uno de
 * rapidez, el modelo seleccionado redacta y el planner por defecto (ultra)
 * investiga y ejecuta las herramientas por él.
 */
export function orquestarModelos(
  modeloSeleccionadoId: string | undefined,
): ConfiguracionOrquestacion {
  const seleccionado = obtenerModelo(modeloSeleccionadoId);

  const esRazonamiento = seleccionado.categoria === "razonamiento" && seleccionado.puedePlanear;

  const modeloSalida = seleccionado;
  const modeloPlanner = esRazonamiento ? seleccionado : MODELO_PLANNER_POR_DEFECTO;

  return {
    modeloSalida,
    modeloPlanner,
    promptSkillsSalida: construirPromptSkills(modeloSalida.skills),
    promptSkillsPlanner: construirPromptSkills(modeloPlanner.skills),
  };
}

export function modeloPorDefecto(): AgentModel {
  return MODELO_POR_DEFECTO;
}
