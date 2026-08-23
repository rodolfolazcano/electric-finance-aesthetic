// @ts-nocheck
import { describe, it, expect, beforeAll } from "vitest";
import { parseBrokerAR, parseCSV, parseSimpleLines, clasificarTicker, loadCatalogs } from "./portfolio-agent.functions";

const PASTE_BERTUCCI = `Cuentas:264900
Alias:CINTIABOSS.INVIU
Con mandato:Sí
Perfil de inversor:Moderado
Arancel:0,90%

Custodio Argentina

Patrimonio total global
en ARS

ARS 25.742.273,03

Monto en activos

ARS 10.143.815,00

Tenencias

Acciones

(1.45%)

ARS 374.070,00

PAMP

(1.45%) | Pampa Energia SA

74

0,50%↗

ARS 5.055,00

ARS 5.345,75

ARS -21.515,58 ↘

-5,44%↘

ARS 374.070,00

Cedears

(37.96%)

ARS 9.769.745,00

AMZN

(2.33%) | CEDEAR AMAZON INC

209

0,10%↗

ARS 2.870,00

ARS 2.741,15

ARS 26.929,35 ↗

4,70%↗

ARS 599.830,00

SPY

(26.18%) | SPDR S&P 500

331

0,80%↗

ARS 20.360,00

ARS 20.017,22

ARS 113.458,67 ↗

1,71%↗

ARS 6.739.160,00

Dólares

(59.63%)

USD 10.011,57

Pesos

(0.97%)

ARS 249.319,60

BERTUCCI, JAVIER MARCELO`;

const PASTE_VISCARRA = `Viscarra Belarde, Gonzalo Martin

Cuentas:200349
Alias:CINTIABOSS.INVIU
Con mandato:Sí
Perfil de inversor:Arriesgado
Arancel:0,90%

Custodio Argentina

Patrimonio total global
en ARS

ARS 24.569.044,26

Monto en activos

ARS 23.708.274,30

Saldo por
Disponibilidad

Moneda

ARS

USD

USD.C

C.I.

527.900,91

194,60

21,69

24HS

527.900,91

194,60

21,69

48HS

527.900,91

194,60

21,69

Tenencias

Cantidad

Variación (24h)

Último operado

Precio promedio
Ganancia

Rendimiento

Monto

Bonos

(4.45%)

ARS 1.093.634,30

AO28

(2.82%) | USD BONO TESORO NACIONAL VTO. 31/10/2028

477

1,50%↗

ARS 145.100,00

ARS 140.130,00

ARS 23.706,91 ↗

3,55%↗

ARS 692.127,00

CRCEO

(0.02%) | USD ON Celulosa Arg. Vto. 04/06/2025

96

0,00%

ARS 4.000,00

ARS 8.136,17

ARS -3.970,73 ↘

-50,84%↘

ARS 3.840,00

IRCFO

(0.17%) | USD ON Irsa Vto 22/06/28

54

1,30%↗

ARS 78.690,00

ARS 32.409,26

ARS 24.991,60 ↗

142,80%↗

ARS 42.492,60

IRCPO

(0.26%) | IRSA Inversiones y Representaciones SA Vto. 31/03/2035

38

1,10%↗

ARS 170.500,00

ARS 117.524,86

ARS 20.130,55 ↗

45,08%↗

ARS 64.790,00

YMCIO

(1.18%) | ON YPF S.A. Vto 30/06/2029

201

1,50%↗

ARS 144.470,00

ARS 72.367,25

ARS 144.926,53 ↗

99,63%↗

ARS 290.384,70

Cedears

(92.04%)

ARS 22.614.640,00

AAPL

(27.12%) | Apple Inc

270

0,00%

ARS 24.680,00

ARS 19.865,23

ARS 1.299.988,57 ↗

24,24%↗

ARS 6.663.600,00

GOOGL

(1.93%) | CEDEAR GOOGLE INC.

50

1,80%↗

ARS 9.490,00

ARS 3.145,40

ARS 317.230,18 ↗

201,71%↗

ARS 474.500,00

LMT

(11.88%) | CEDEAR LOCKHEED MARTIN CORP.ESC.

65

-0,70%↘

ARS 44.920,00

ARS 33.754,80

ARS 725.738,04 ↗

33,08%↗

ARS 2.919.800,00

NU

(13.22%) | NU Holdings Ltd

280

3,10%↗

ARS 11.600,00

ARS 9.234,95

ARS 662.214,18 ↗

25,61%↗

ARS 3.248.000,00

PEP

(15.3%) | CEDEAR PEPSICO INC

296

1,30%↗

ARS 12.700,00

ARS 11.674,50

ARS 303.547,32 ↗

8,78%↗

ARS 3.759.200,00

SLV

(5.7%) | ETF ISHARES SILVER TRUST

84

2,20%↗

ARS 16.670,00

ARS 17.721,39

ARS -88.316,97 ↘

-5,93%↘

ARS 1.400.280,00

URA

(2.1%) | CEDEAR GLOBAL X URANIUM ETF

35

5,80%↗

ARS 14.710,00

ARS 13.396,26

ARS 45.980,73 ↗

9,81%↗

ARS 514.850,00

XLE

(1.65%) | Cef Select Sector Spdr Energy

8

0,30%↗

ARS 50.775,00

ARS 24.839,98

ARS 207.480,12 ↗

104,41%↗

ARS 406.200,00

Pesos

(2.15%)

ARS 527.900,91

Dólares cable

(0.14%)

USD.C 21,69

Dólares

(1.21%)

USD 194,60`;

describe("parseBrokerAR — BERTUCCI", () => {
  let result;
  beforeAll(async () => {
    await loadCatalogs();
    result = parseBrokerAR(PASTE_BERTUCCI);
  });

  it("detecta cliente CAPS", () => {
    expect(result.cliente.nombreCompleto).toBe("BERTUCCI, JAVIER MARCELO");
  });
  it("detecta cuenta/alias/perfil/custodio", () => {
    expect(result.cliente.cuenta).toBe("264900");
    expect(result.cliente.alias).toBe("CINTIABOSS.INVIU");
    expect(result.cliente.perfil).toBe("Moderado");
    expect(result.cliente.custodio).toBe("Argentina");
  });
  it("detecta patrimonio y monto en activos", () => {
    expect(result.resumen.patrimonioTotal).toBe(25742273.03);
    expect(result.resumen.invertido).toBe(10143815);
  });
  it("detecta 5 filas (3 tenencias + USD + ARS) — paste truncado", () => {
    expect(result.activos.length).toBe(5);
  });
  it("PAMP acción con datos completos", () => {
    const pamp = result.activos.find((a) => a.tickerNorm === "PAMP");
    expect(pamp.cantidad).toBe(74);
    expect(pamp.montoMonedaOrigen).toBe(374070);
    expect(pamp.precioPromedio).toBe(5345.75);
    expect(pamp.variacion24h).toBe(0.5);
    expect(pamp.rendimientoPct).toBe(-5.44);
    expect(pamp.monedaPrecios).toBe("ARS");
  });
  it("AMZN y SPY en sección cedears", () => {
    const amzn = result.activos.find((a) => a.tickerNorm === "AMZN");
    const spy = result.activos.find((a) => a.tickerNorm === "SPY");
    expect(amzn.seccion).toBe("cedears");
    expect(amzn.montoMonedaOrigen).toBe(599830);
    expect(spy.montoMonedaOrigen).toBe(6739160);
  });
  it("efectivo USD 10.011,57 y ARS 249.319,60 sin duplicar", () => {
    const usd = result.activos.filter((a) => a.tickerNorm === "USD");
    const ars = result.activos.filter((a) => a.tickerNorm === "ARS");
    expect(usd.length).toBe(1);
    expect(usd[0].montoMonedaOrigen).toBe(10011.57);
    expect(ars.length).toBe(1);
    expect(ars[0].montoMonedaOrigen).toBe(249319.6);
  });
});

describe("parseBrokerAR — VISCARRA (bonos/ONs/USD.C)", () => {
  let result;
  beforeAll(() => {
    result = parseBrokerAR(PASTE_VISCARRA);
  });

  it("detecta cliente Title Case", () => {
    expect(result.cliente.nombreCompleto).toBe("Viscarra Belarde, Gonzalo Martin");
  });
  it("detecta perfil Arriesgado y cuenta 200349", () => {
    expect(result.cliente.perfil).toBe("Arriesgado");
    expect(result.cliente.cuenta).toBe("200349");
  });
  it("AO28: bloque completo correcto (var 1.5, rend 3.55, monto 692.127)", () => {
    const ao = result.activos.find((a) => a.tickerNorm === "AO28");
    expect(ao).toBeDefined();
    expect(ao.cantidad).toBe(477);
    expect(ao.ultimoOperado).toBe(145100);
    expect(ao.precioPromedio).toBe(140130);
    expect(ao.ganancia).toBe(23706.91);
    expect(ao.montoMonedaOrigen).toBe(692127);
    expect(ao.variacion24h).toBe(1.5);
    expect(ao.rendimientoPct).toBe(3.55);
    expect(ao.monedaPrecios).toBe("ARS");
  });
  it("YMCIO: ON por descripción con monto exacto 290.384,70", () => {
    const ym = result.activos.find((a) => a.tickerNorm === "YMCIO");
    expect(ym.descripcion.toUpperCase()).toContain("ON YPF");
    expect(ym.montoMonedaOrigen).toBe(290384.7);
    expect(ym.rendimientoPct).toBe(99.63);
  });
  it("NO infla montos: ningún activo supera el monto máximo del paste", () => {
    const maxEsperado = 6739160 * 2; // holgura
    const inflados = result.activos.filter(
      (a) => a.seccion !== "efectivo" && a.montoMonedaOrigen > maxEsperado,
    );
    expect(inflados).toEqual([]);
  });
  it("cash triple sin duplicados: ARS 527.900,91 · USD 194,60 · USD.C 21,69", () => {
    const usdc = result.activos.filter((a) => a.tickerNorm === "USD.C");
    const usd = result.activos.filter((a) => a.tickerNorm === "USD");
    const ars = result.activos.filter((a) => a.tickerNorm === "ARS");
    expect(usdc.length).toBe(1);
    expect(usdc[0].montoMonedaOrigen).toBe(21.69);
    expect(usd.length).toBe(1);
    expect(usd[0].montoMonedaOrigen).toBe(194.6);
    expect(ars.length).toBe(1);
    expect(ars[0].montoMonedaOrigen).toBe(527900.91);
  });
  it("ignora la tabla Saldo por Disponibilidad como tickers (24HS/48HS)", () => {
    expect(result.activos.find((a) => a.tickerNorm === "24HS")).toBeUndefined();
    expect(result.activos.find((a) => a.tickerNorm === "48HS")).toBeUndefined();
  });
});

describe("clasificarTicker — razonamiento por sección y descripción", () => {
  beforeAll(async () => {
    await loadCatalogs();
  });

  it("AO28 por sección bonos → Bono RentaFija BCBA ARS", () => {
    const c = clasificarTicker("AO28", { seccion: "bonos", descripcion: "USD BONO TESORO NACIONAL VTO. 31/10/2028" });
    expect(c.tipo).toBe("Bono");
    expect(c.categoriaMacro).toBe("RentaFija");
    expect(c.mercado).toBe("BCBA");
    expect(c.moneda).toBe("ARS");
  });
  it("CRCEO por descripción 'ON' → ON RentaFija", () => {
    const c = clasificarTicker("CRCEO", { descripcion: "USD ON Celulosa Arg. Vto. 04/06/2025" });
    expect(c.tipo).toBe("ON");
    expect(c.categoriaMacro).toBe("RentaFija");
  });
  it("AMZN sección cedears → CEDEAR ARS", () => {
    const c = clasificarTicker("AMZN", { seccion: "cedears", descripcion: "CEDEAR AMAZON INC" });
    expect(c.tipo).toBe("CEDEAR");
    expect(c.moneda).toBe("ARS");
  });
  it("SLV sección cedears → ETF (CEDEAR de ETF)", () => {
    const c = clasificarTicker("SLV", { seccion: "cedears", descripcion: "ETF ISHARES SILVER TRUST" });
    expect(c.tipo).toBe("ETF");
  });
  it("PAMP catálogo → Accion BCBA ARS", () => {
    const c = clasificarTicker("PAMP");
    expect(c.tipo).toBe("Accion");
    expect(c.mercado).toBe("BCBA");
  });
});

describe("parseCSV y líneas simples", () => {
  it("CSV con header", () => {
    const r = parseCSV("ticker,cantidad,precio\nGGAL,100,5000");
    expect(r.length).toBe(1);
    expect(r[0].cantidad).toBe(100);
  });
  it("TSV", () => {
    const r = parseCSV("ticker\tqty\tprice\nAMZN\t100\t2870");
    expect(r.length).toBe(1);
    expect(r[0].cantidad).toBe(100);
  });
  it("líneas simples", () => {
    const r = parseSimpleLines("GGAL 100 5000\nYPF 50");
    expect(r.length).toBe(2);
    expect(r[0].precioPromedio).toBe(5000);
  });
});
