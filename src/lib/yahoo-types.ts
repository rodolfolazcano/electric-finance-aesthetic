/**
 * Tipos TypeScript para respuestas de Yahoo Finance
 */

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

export interface CompanyOfficer {
  name?: string;
  title?: string;
  age?: number;
  totalPay?: { raw?: number; fmt?: string };
}

export interface AssetProfile {
  longName?: string;
  shortName?: string;
  sector?: string;
  industry?: string;
  country?: string;
  longBusinessSummary?: string;
  companyOfficers?: CompanyOfficer[];
  auditRisk?: number;
  boardRisk?: number;
  compensationRisk?: number;
  shareHolderRightsRisk?: number;
  overallRisk?: number;
  governanceEpochDate?: { fmt?: string };
}

export interface QuoteSummaryResult {
  incomeStatementHistory?: { incomeStatementHistory?: FinancialStatementRow[] };
  incomeStatementHistoryQuarterly?: { incomeStatementHistory?: FinancialStatementRow[] };
  balanceSheetHistory?: { balanceSheetStatements?: FinancialStatementRow[] };
  balanceSheetHistoryQuarterly?: { balanceSheetStatements?: FinancialStatementRow[] };
  cashflowStatementHistory?: { cashflowStatements?: FinancialStatementRow[] };
  cashflowStatementHistoryQuarterly?: { cashflowStatements?: FinancialStatementRow[] };
  earningsHistory?: { history?: EarningsHistoryRow[] };
  earningsTrend?: { trend?: Array<Record<string, any>> };
  recommendationTrend?: { trend?: RecommendationTrendRow[] };
  upgradeDowngradeHistory?: { history?: Array<Record<string, any>> };
  insiderTransactions?: { transactions?: InsiderTransactionRow[] };
  insiderHolders?: { holders?: InsiderTransactionRow[] };
  institutionOwnership?: { ownershipList?: InstitutionalHolderRow[] };
  fundOwnership?: { ownershipList?: InstitutionalHolderRow[] };
  majorHoldersBreakdown?: Record<string, number>;
  netSharePurchaseActivity?: Record<string, any>;
  calendarEvents?: Record<string, any>;
  assetProfile?: AssetProfile;
  summaryDetail?: Record<string, any>;
  financialData?: Record<string, any>;
  defaultKeyStatistics?: Record<string, any>;
  earnings?: Record<string, any>;
  secFilings?: { filings?: Array<Record<string, any>> };
}
