import type { FuenteDatos } from "./clasificacion-activos.types";

interface ConvencionPrecioRentaFija {
  fuente: FuenteDatos;
  escalaVN: 100 | 1;
  formula: string;
}

export const CONVENCIONES_PRECIO_RENTA_FIJA: ConvencionPrecioRentaFija[] = [
  {
    fuente: "IOL",
    escalaVN: 100,
    formula: "valorizado = nominales * (precioIOL / 100)  // IOL cotiza títulos públicos/ONs cada 100 VN",
  },
  {
    fuente: "ArgentinaDatos",
    escalaVN: 1,
    formula:
      "valorizado = nominales * precioArgentinaDatos  // VPV expresado por 1 VN según lo indicado. " +
      "⚠ VERIFICAR contra una respuesta real de /finanzas/letras antes de confiar en producción: " +
      "si en la práctica VPV viniera cada 100 VN, hay que cambiar escalaVN a 100 acá.",
  },
];

export function calcularValorizadoRentaFija(
  nominales: number,
  precio: number,
  fuente: FuenteDatos
): number {
  const convencion = CONVENCIONES_PRECIO_RENTA_FIJA.find((c) => c.fuente === fuente);
  if (!convencion) {
    throw new Error(
      `No hay convención de precio para renta fija desde fuente "${fuente}". ` +
      `Fuentes soportadas: ${CONVENCIONES_PRECIO_RENTA_FIJA.map((c) => c.fuente).join(", ")}`
    );
  }
  return convencion.escalaVN === 100 ? nominales * (precio / 100) : nominales * precio;
}
