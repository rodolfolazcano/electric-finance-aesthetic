import type { PortfolioAssetInput, PositionEnriquecida, PipelineContext } from "../types";
import type { Clasificacion } from "../clasificador";

export interface AssetAdapter {
  readonly tipo: string;
  enriquecer(input: PortfolioAssetInput, clasificacion: Clasificacion, ctx?: PipelineContext): Promise<PositionEnriquecida>;
}
