/** Tipos del response de Yahoo Finance quoteSummary (v10). */

export interface YahooMoney {
  raw?: number;
  fmt?: string;
  longFmt?: string;
}

export type FinancialStatementRow = Record<string, any>;

export interface EarningsHistoryRow {
  quarter?: { fmt?: string };
  epsActual?: number;
  epsEstimate?: number;
  epsDifference?: number;
  surprisePercent?: number;
  period?: string;
}

export interface RecommendationTrendRow {
  period?: string;
  strongBuy?: number;
  buy?: number;
  hold?: number;
  sell?: number;
  strongSell?: number;
}

export interface EarningsTrendRow {
  maxAge?: number;
  period?: string;
  endDate?: string;
  growth?: number;
  earningsEstimate?: {
    avg?: number;
    low?: number;
    high?: number;
    yearAgoEps?: number;
    numberOfAnalysts?: number;
    growth?: number;
  };
  revenueEstimate?: {
    avg?: number;
    low?: number;
    high?: number;
    numberOfAnalysts?: number;
    yearAgoRevenue?: number;
    growth?: number;
  };
}

export interface InsiderTransactionRow {
  filerName?: string;
  filerRelation?: string;
  transactionText?: string;
  shares?: number;
  value?: number;
  startDate?: { fmt?: string };
}

export interface InstitutionalHolderRow {
  organization?: string;
  pctHeld?: number;
  position?: number;
  value?: number;
  reportDate?: { fmt?: string };
}

export interface QuoteSummaryResult {
  incomeStatementHistory?: { incomeStatementHistory?: FinancialStatementRow[] };
  incomeStatementHistoryQuarterly?: { incomeStatementHistory?: FinancialStatementRow[] };
  balanceSheetHistory?: { balanceSheetStatements?: FinancialStatementRow[] };
  balanceSheetHistoryQuarterly?: { balanceSheetStatements?: FinancialStatementRow[] };
  cashflowStatementHistory?: { cashflowStatements?: FinancialStatementRow[] };
  cashflowStatementHistoryQuarterly?: { cashflowStatements?: FinancialStatementRow[] };
  earningsHistory?: { history?: EarningsHistoryRow[] };
  earningsTrend?: { trend?: EarningsTrendRow[] };
  recommendationTrend?: { trend?: RecommendationTrendRow[] };
  upgradeDowngradeHistory?: { history?: Array<Record<string, any>> };
  insiderTransactions?: { transactions?: InsiderTransactionRow[] };
  insiderHolders?: { holders?: InsiderTransactionRow[] };
  institutionOwnership?: { ownershipList?: InstitutionalHolderRow[] };
  fundOwnership?: { ownershipList?: InstitutionalHolderRow[] };
  majorHoldersBreakdown?: Record<string, number>;
  netSharePurchaseActivity?: Record<string, any>;
  calendarEvents?: Record<string, any>;
  assetProfile?: {
    sector?: string;
    sectorKey?: string;
    industry?: string;
    country?: string;
    website?: string;
    longBusinessSummary?: string;
    fullTimeEmployees?: number;
  };
  summaryDetail?: {
    trailingPE?: number;
    forwardPE?: number;
    priceToBook?: number;
    beta?: number;
    marketCap?: number;
    sharesOutstanding?: number;
    fiftyTwoWeekLow?: number;
    fiftyTwoWeekHigh?: number;
    currency?: string;
    trailingAnnualDividendYield?: number;
  };
  price?: {
    regularMarketPrice?: number;
    regularMarketChangePercent?: number;
    regularMarketDayHigh?: number;
    regularMarketDayLow?: number;
    marketCap?: number;
    currency?: string;
    longName?: string;
    shortName?: string;
  };
  financialData?: {
    currentPrice?: number;
    targetHighPrice?: number;
    targetLowPrice?: number;
    targetMeanPrice?: number;
    targetMedianPrice?: number;
    recommendationMean?: number;
    recommendationKey?: string;
    numberOfAnalystOpinions?: number;
    totalCash?: number;
    totalCashPerShare?: number;
    totalDebt?: number;
    totalRevenue?: number;
    revenueGrowth?: number;
    earningsGrowth?: number;
    returnOnEquity?: number;
    returnOnAssets?: number;
    debtToEquity?: number;
    freeCashflow?: number;
    operatingCashflow?: number;
    grossMargins?: number;
    operatingMargins?: number;
    profitMargins?: number;
    currentRatio?: number;
    totalCurrentAssets?: number;
    totalCurrentLiabilities?: number;
  };
  defaultKeyStatistics?: {
    beta?: number;
    trailingPE?: number;
    forwardPE?: number;
    priceToBook?: number;
    enterpriseToEbitda?: number;
    enterpriseValue?: number;
    sharesOutstanding?: number;
    sharesShort?: number;
    fiftyTwoWeekLow?: number;
    fiftyTwoWeekHigh?: number;
    bookValue?: number;
    earningsQuarterlyGrowth?: number;
  };
  earnings?: Record<string, any>;
  secFilings?: { filings?: Array<Record<string, any>> };
}
