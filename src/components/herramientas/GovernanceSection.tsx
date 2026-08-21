import type { FundamentalAFResult } from "@/lib/fundamental-af.functions";

interface GovernanceSectionProps {
  result: FundamentalAFResult;
}

export function GovernanceSection({ result }: GovernanceSectionProps) {
  const { governanceRiskScores, governanceRiskLabel, companyOfficers } = result;

  const hasGovernanceData = governanceRiskScores.overallRisk !== null || companyOfficers.length > 0;

  if (!hasGovernanceData) {
    return null;
  }

  const formatScore = (score: number | null) => {
    if (score === null) return "--";
    return `${score}/10`;
  };

  const formatCompensation = (comp: number | null) => {
    if (comp === null) return "— No disponible";
    if (comp === 0) return "— No disponible";
    return `$${(comp / 1000000).toFixed(1)}M`;
  };

  const getRiskColor = (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score <= 3) return "text-emerald-400";
    if (score <= 7) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
      <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-3">
        Gobierno Corporativo
      </p>

      {/* Riesgo General */}
      {governanceRiskLabel && (
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-foreground">Riesgo General:</span>
            <span
              className={`text-[13px] font-semibold ${getRiskColor(governanceRiskScores.overallRisk)}`}
            >
              {governanceRiskLabel}
            </span>
          </div>
        </div>
      )}

      {/* Scores de Riesgo */}
      {governanceRiskScores.overallRisk !== null && (
        <div className="mb-4">
          <p className="text-[12px] text-muted-foreground mb-2">
            Riesgos de Governance (1=mejor, 10=peor)
          </p>
          <div className="grid w-full grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
            <div className="flex justify-between">
              <span className="text-[13px] text-muted-foreground">Riesgo de Auditoría</span>
              <span
                className={`text-[13px] font-mono ${getRiskColor(governanceRiskScores.auditRisk)}`}
              >
                {formatScore(governanceRiskScores.auditRisk)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[13px] text-muted-foreground">Riesgo de Directorio</span>
              <span
                className={`text-[13px] font-mono ${getRiskColor(governanceRiskScores.boardRisk)}`}
              >
                {formatScore(governanceRiskScores.boardRisk)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[13px] text-muted-foreground">Riesgo de Compensación</span>
              <span
                className={`text-[13px] font-mono ${getRiskColor(governanceRiskScores.compensationRisk)}`}
              >
                {formatScore(governanceRiskScores.compensationRisk)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[13px] text-muted-foreground">Riesgo de Accionistas</span>
              <span
                className={`text-[13px] font-mono ${getRiskColor(governanceRiskScores.shareHolderRightsRisk)}`}
              >
                {formatScore(governanceRiskScores.shareHolderRightsRisk)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[13px] text-muted-foreground">Riesgo General (Overall)</span>
              <span
                className={`text-[13px] font-mono ${getRiskColor(governanceRiskScores.overallRisk)}`}
              >
                {formatScore(governanceRiskScores.overallRisk)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Directivos */}
      {companyOfficers.length > 0 && (
        <div>
          <p className="text-[12px] text-muted-foreground mb-2">Directivos Ejecutivos</p>
          <div className="overflow-x-auto w-full">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left py-1 px-2 text-muted-foreground font-normal">Nombre</th>
                  <th className="text-left py-1 px-2 text-muted-foreground font-normal">Cargo</th>
                  <th className="text-center py-1 px-2 text-muted-foreground font-normal">Edad</th>
                  <th className="text-right py-1 px-2 text-muted-foreground font-normal">
                    Compensación Anual
                  </th>
                </tr>
              </thead>
              <tbody>
                {companyOfficers.map((officer, idx) => (
                  <tr key={idx} className="border-b border-border/20 last:border-0">
                    <td className="py-1 px-2 text-foreground">{officer.nombre}</td>
                    <td className="py-1 px-2 text-muted-foreground">{officer.cargo}</td>
                    <td className="py-1 px-2 text-center text-muted-foreground">
                      {officer.edad ?? "--"}
                    </td>
                    <td className="py-1 px-2 text-right text-muted-foreground">
                      {formatCompensation(officer.compensacionAnual)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result.governanceEpochDate && (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Datos de governance actualizados: {result.governanceEpochDate}
        </p>
      )}
    </div>
  );
}
