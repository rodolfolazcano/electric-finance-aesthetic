export type PaymentModality = "Hard Dollar" | "Dólar Linked" | "UVA / CER" | "Pesos" | "";
export type AmortType = "Bullet" | "Sinkable" | "Amortizing";
export type OnBenchmark = "Top Tier" | "High Yield" | "";

const SECTOR_DATA: [string, string[]][] = [
  ["Energía, Petróleo y Gas", [
    "CAC6O","CAC7O","CACAO","CACBO","CACDO","CACBD","CACDD","CACBC","CACDC",
    "CP28O","CP36O","CP37O","CP38O","CP39O","CP40O","CP28D","CP36D","CP37D","CP38D","CP40D","CP28C","CP37C","CP38C","CP40C",
    "PN34O","PN35O","PN36O","PN34D","PN35D","PN36D","PN37D","PN35C","PN36C","PN37C",
    "PLC5O","PLC5D","PQCSD","EMC1O","EMC1D","EMC1C","CWC6O","CWC6D",
    "YM34O","YM38O","YM39O","YM42O","YM43O","YMCXO","YMCIO","YMCJO","YM37O",
    "YM34D","YM38D","YM39D","YM42D","YM43D","YMCXD","YMCID","YMCJD","YM37D",
    "VSCXO","VSCOO","VSCRO","VSCWO","VSCYO","VSCVO","VSCIO","VSCTO",
    "VSCXD","VSCOD","VSCRD","VSCWD","VSCYD","VSCVD","VSCID","VSCTD",
  ]],
  ["Electricidad y Energías Renovables", [
    "GN49D","GN49C","GN49O","GN37O","GN48C","GN48D","GN48O",
    "AEC2C","AEC2D","AEC2O","CAC4O","CAC5C","CAC5D","CAC5O",
    "DEC2C","DEC2D","DEC2O","DNC7C","DNC7D","DNC7O","DNCAC","DNCAD","DNCAO",
    "DNC3O","DNC5O","DNC9O","DNCBO","DNC3D","DNC5D","DNCBD","DNC3C","DNC5C","DNCBC",
    "EAC4C","EAC4D","EAC4O","EAC1O","EAC2O","EAC3O","EAC1D","EAC2D","EAC3D",
    "GMCGO","GMCJO","MGCEC","MGCED","MGCEO","MGCMC","MGCMD","MGCMO",
    "MGCNC","MGCND","MGCNO","MGCOC","MGCOD","MGCOO","MGCRC","MGCRD","MGCRO",
    "MR46C","MR46D","MR46O","MR47D","MR47O","OZC6C","OZC6D","OZC6O","OZC8C","OZC8D","OZC8O",
  ]],
  ["Gas (Transporte y Distribución)", [
    "ZZC1C","ZZC1D","ZZC1O","TSC3O","TSC3D","TSC4O","TSC4D",
  ]],
  ["Financiero y Bancos", [
    "BACAC","BACAD","BACAO","BACGC","BACGD","BACGO","BACHC","BACHD","BACHO",
    "BF37O","BF38O","BF39O","BF40O","BF44O","BF46O","BF50O","BF37D","BF39D","BF40D","BF44D","BF45D","BF50D","BF37C",
    "BYCHO","BYCVO","BYCWO","BYCXO","BYCHD","BYCVD","BYCWD","BYCXD","BYCHC","BYCVC",
    "AFCHO","AFCIO","AFCJO","AFCKO","AFCLO","AFCNO","AFCHD","AFCID","AFCJD","AFCKD","AFCLD","AFCMD","AFCKC","AFCLC",
    "BPCSO","BPCTO","BPCUO","BPCVO","BPCSD","BPCTD","BPCUD","BPCVD",
    "BGC4O","BGC4D","BVCPO","BVCPD","BVCRD","COC1O","COC2O","BDCKO",
  ]],
  ["Real Estate / Inmobiliarias", [
    "CS40O","IRCFC","IRCFD","IRCFO","IRCOC","IRCOD","IRCOO","IRCPC","IRCPD","IRCPO",
    "RAC5C","RAC5D","RAC5O","RAC7C","RAC7D","RAC7O",
  ]],
  ["Agro, Agroindustria e Industria", [
    "CS45O","CS46O","CS47O","CS48O","CS49O","CS50O","CS51O","CS52O","CS53O",
    "CS45D","CS47D","CS48D","CS49D","CS50D","CS51D","CS52D","CS53D","CS45C","CS47C","CS48C","CS49C","CS50C",
    "CIC7O","CIC8O","CIC9O","CICAO","CICBO","CIC7D","CIC8D","CIC9D","CICAD","CICBD","CIC8C","CICAC",
    "AU1LD","FO4AO","FO4AD","FO4BD","CRCJO",
  ]],
  ["Transportation", [
    "AER1D","AER5O","AER9O","AERAC","AERAD","AERAO","AERBO","AERBC","AERBD",
    "ARC1C","ARC1D","ARC1O","CLI1C","CLI1D","CLI1O","CLSIC","CLSID","CLSIO",
  ]],
  ["Maquinaria y Financiamiento", [
    "HJCJC","HJCJD","HJCJO","HJCKC","HJCKD","HJCKO","HJCLD","HJCLO","SBC1C","SBC1D","SBC1O",
  ]],
  ["Materiales de Construcción", [
    "PQCSC","PQCSD","PQCSO",
  ]],
  ["Telecomunicaciones", [
    "TLCPD","TLCPO","TLCPC","TLCDD","TLCDO","TLCFD","TLCFO",
    "TLCMC","TLCMD","TLCMO","TLCOC","TLCOD","TLCOO","TLCQC","TLCQD","TLCQO",
    "TLCTC","TLCTD","TLCTO","ZPC3O",
  ]],
  ["Minería / Metales", [
    "LMS8C","LMS8D","LMS8O",
  ]],
  ["Químicos / Agroquímicos", [
    "RZ8BO",
  ]],
  ["Farmacéuticas", [
    "LR3DO",
  ]],
  ["Alimentos y Consumo Masivo", [
    "RC1CC","RC1CD","RC1CO",
  ]],
  ["Otras / PyME", [
    "BT21P",
  ]],
];

const _sectorMap: Record<string, string> = {};
for (const [sector, tickers] of SECTOR_DATA) {
  for (const t of tickers) _sectorMap[t] = sector;
}

const _modalityMap: Record<string, PaymentModality> = {};

function setModality(tickers: string[], m: PaymentModality) {
  for (const t of tickers) _modalityMap[t] = m;
}

setModality([
  "YM34","YM38","YM39","YM42","YM43","YMCX","YMCI","YMCJ","YM37",
  "VSCX","VSCO","VSCR","VSCW","VSCY","VSCV","VSCI","VSCT",
  "PLC7","PLC4","PLC5","PLC2","PLC3",
  "PN43","PN35","PN36","PN37","PN38","PNXC",
  "TTC8","TTCD","TSC4","TSC3",
  "OLC7","OLC6","OTS5","OTS3","PQCS",
  "MCC3","MGCR","MGCO","MGCM","MGCQ",
  "GN49","GN47","EAC4","RUCD",
  "NPCD","NPCC","DNCA","DNC7","DNC3","DNC5","DNCB","DNC9",
  "LUC4","LUC5","MR46","MR44","MR47",
  "TLCM","TLCP","TLCT","TLCO","TLCU",
  "BYCH","BYCW","BACG","BACA",
  "BF37","BF40","BF50","HJCJ","HJCI","SBC2","SBC3","T662","AFCK","BPCT",
  "IRCP","IRCF","CS48","CS50","CS52","CS47",
  "RCCR","RC2C","AER5","AER9","AERA","AERB","ARC1","ZPC5",
  "MIC6","XMC1","SIC2","CICB",
], "Hard Dollar");

setModality([
  "VSCM","VSCQ","CAC6","CAC7","CAC4","CACD","CAC5","CACA","CACB",
  "CP38","CP39","CP37","CP36","CP40",
  "PECM","PECN","CWC6","GN39","GN37","GN42",
  "RUCE","EAC3","EAC1","EAC2","OZC3","OZC8","OZC6","ZZC1",
  "CS46","CS51","CS53","CS45",
  "RC2C","RC5C","RC1C","RC3C","RC4C",
  "SNEB","SNEA","SNSB","RZBC","RZBB","RZ9A","RZ9B","RZAB","RZBA","RZBB",
  "PFC3","LDCG","FYC1","MTC2","SXC5","SXC3","SXC4","SXC6",
  "CICA","CIC7","CIC8","CIC9","JNC7","JNC5","JNC6","FPC1","YFCJ",
], "Dólar Linked");

setModality([
  "RB66","LR7B","LR7A","LR6B","LR3D","GMCJ","GMCG",
], "UVA / CER");

setModality([
  "T671","T672","T661","T662","T641","VBC3","VBC1","VBC2",
  "BDCK","STCF","COC1","COC2","NHC1",
  "AFCN","AFCH","AFCI","AFCJ","AFCK","AFCL",
  "VWCD","PNEC","PZCA","PZCE","PZCG",
  "OT41","OT42","OTS2","OTS3","OTS5","OTS6",
], "Pesos");

export function getSector(ticker: string): string {
  return _sectorMap[ticker] ?? "";
}

export function getPaymentModality(ticker: string): PaymentModality {
  const root = ticker.slice(0, -1);
  return _modalityMap[root] ?? "";
}

export function getAmortizationType(tipoAmortizacion?: string): AmortType {
  if (!tipoAmortizacion) return "Bullet";
  const lower = tipoAmortizacion.toLowerCase();
  if (lower.includes("sinkable") || lower.includes("parcial")) return "Sinkable";
  if (lower.includes("amortizing")) return "Amortizing";
  return "Bullet";
}

export function getFrecuenciaNumerica(frecuencia?: string): number {
  switch (frecuencia) {
    case "Semiannual": case "Semiannually": return 2;
    case "Quarterly": return 4;
    case "Monthly": return 12;
    case "Annual": default: return 1;
  }
}

export interface OnRowData {
  ticker: string;
  emisor: string;
  vencimiento: string;
  sector: string;
  modality: PaymentModality;
  amortType: AmortType;
  cuponTasa: number;
  frecuencia: string;
  precio: number | null;
  tir: number | null;
  tea: number | null;
  tna: number | null;
  duration: number | null;
  paridad: number | null;
  moneda: string;
  isin: string;
}
