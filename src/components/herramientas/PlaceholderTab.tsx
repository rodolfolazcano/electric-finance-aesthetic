import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function PlaceholderTab({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <p className="text-sm text-muted-foreground">{descripcion}</p>
      </div>
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <Construction className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Este tab está en migración desde el dashboard de análisis. El núcleo (Contexto, Análisis,
            Cuantitativo y Sectores) ya está operativo.
          </p>
          <p className="text-xs text-muted-foreground">
            Mientras tanto, podés pedirle estos análisis al asistente IA del sitio: entiende
            instrucciones en lenguaje natural y ejecuta los cálculos por vos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
