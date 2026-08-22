import type { AssetAdapter } from "./adapter.interface";
import { bonoAdapter } from "./bono.adapter";
import { onAdapter } from "./on.adapter";
import { letraAdapter } from "./letra.adapter";
import { fciAdapter } from "./fci.adapter";
import { rentaVariableAdapter } from "./renta-variable.adapter";
import type { TipoDeclarado } from "../types";

const registry: Record<string, AssetAdapter> = {
  bono: bonoAdapter,
  on: onAdapter,
  letra: letraAdapter,
  fci: fciAdapter,
  cedear: rentaVariableAdapter,
  accion: rentaVariableAdapter,
  adr: rentaVariableAdapter,
};

export function getAdapter(tipo: TipoDeclarado): AssetAdapter {
  const adapter = registry[tipo];
  if (!adapter) {
    throw new Error(`No hay adaptador registrado para el tipo "${tipo}"`);
  }
  return adapter;
}

export function adaptersDisponibles(): string[] {
  return Object.keys(registry);
}
