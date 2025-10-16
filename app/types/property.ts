export interface PropertyData {
  price: number;
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  propertyType: string;
  url: string;
  status?: 'active' | 'off-market' | 'sold';
  redfinEstimate?: number;
  redfinEstimateChangeText?: string;
  lastSoldPrice?: number;
  lastSoldDate?: string;
  comps?: Array<{
    address?: string;
    price: number;
    beds?: number;
    baths?: number;
    sqft?: number;
    url?: string;
  }>;
}

export interface AnalysisParameters {
  downPaymentPercent: number;
  interestRate: number;
  loanTermYears: number;
  monthlyRent: number;
  propertyTaxPercent: number;
  insurancePercent: number;
  hoaFees: number;
  maintenancePercent: number;
  vacancyRatePercent: number;
}

export interface InvestmentAnalysis {
  propertyData: PropertyData;
  parameters: AnalysisParameters;
  monthlyMortgagePayment: number;
  monthlyExpenses: number;
  monthlyCashFlow: number;
  annualCashFlow: number;
  capRate: number;
  cashOnCashReturn: number;
  totalCashNeeded: number;
  downPayment: number;
  closingCosts: number;
  // New detailed metrics
  effectiveMonthlyRent: number; // rent adjusted for vacancy
  monthlyOperatingExpenses: number; // excluding mortgage
  annualNOI: number; // NOI based on effective rent and operating expenses
  dscr: number; // Debt Service Coverage Ratio = NOI / Annual Debt Service
}

export interface ScrapeResponse {
  success: boolean;
  data?: PropertyData;
  error?: string;
}
