export interface BinanceDepthLevel {
  price: number;
  volume: number;
  total: number;
}

export interface OrderBook {
  bids: BinanceDepthLevel[];
  asks: BinanceDepthLevel[];
  bestBid: number;
  bestAsk: number;
  spread: number;
  spreadPct: number;
  midPrice: number;
}

export interface Ticker24h {
  symbol: string;
  priceChange: number;
  priceChangePercent: number;
  lastPrice: number;
  volume: number;
  quoteVolume: number;
  highPrice: number;
  lowPrice: number;
  weightedAvgPrice: number;
}

export interface ObzScore {
  obi: number;
  zScore: number;
  microPrice: number;
  mean: number;
  std: number;
}

export interface AtrResult {
  atr: number;
  atrPct: number;
  tr: number;
}

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface Signal {
  timestamp: number;
  type: "LONG" | "SHORT";
  entryPrice: number;
  sl: number;
  tp: number;
  zScore: number;
  obi: number;
  status: "abierta" | "tp" | "sl" | "cancelada";
  exitPrice?: number;
  exitTime?: number;
  pnl?: number;
  pnlPct?: number;
  exitReason?: "tp" | "sl" | "cancelada";
  binanceOrderId?: number;
  quantity?: number;
}

export interface PaperTradingMetrics {
  totalSignals: number;
  winRate: number;
  pnlTotal: number;
  bestTrade: number;
  bestTradeRR: number;
  worstTrade: number;
  avgRR: number;
}

export interface CriptoYaDolar {
  mayorista: { compra: number; venta: number };
  oficial: { compra: number; venta: number };
  ahorro: number;
  tarjeta: number;
  blue: { compra: number; venta: number };
  cripto: number;
  mep: number;
  ccl: number;
}

export interface UsdtExchange {
  [exchange: string]: {
    bid: number;
    ask: number;
    totalAsk: number;
    totalBid: number;
    time: number;
  };
}

export interface ArbitrajeOportunidad {
  tipo: "usdt-vs-blue" | "usdt-vs-mep" | "usdt-vs-ccl" | "entre-exchanges";
  descripcion: string;
  spreadBruto: number;
  costos: number;
  spreadNeto: number;
  viable: boolean;
  exchangeCompra?: string;
  exchangeVenta?: string;
  precioCompra?: number;
  precioVenta?: number;
}

export interface ExchangeCotizacion {
  exchange: string;
  compra: number;
  venta: number;
  spread: number;
  fee: number;
  spreadNeto: number;
}

export interface SpreadHistoryPoint {
  timestamp: number;
  usdtBlue: number | null;
  usdtMep: number | null;
  usdtCcl: number | null;
}

export interface CriptoState {
  orderBook: OrderBook | null;
  ticker: Ticker24h | null;
  obiHistory: number[];
  zScore: number | null;
  microPrice: number | null;
  currentObi: number | null;
  klines: Kline[];
  signals: Signal[];
  atr: AtrResult | null;
  vwap: number | null;

  dolar: CriptoYaDolar | null;
  usdtExchanges: UsdtExchange | null;
  exchangeList: ExchangeCotizacion[];
  arbitrajeOportunidades: ArbitrajeOportunidad[];
  spreadHistory: SpreadHistoryPoint[];
}
