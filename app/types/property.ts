export interface PropertyData {
  price: number;
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  propertyType: string;
  url: string;
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
}

export interface ScrapeResponse {
  success: boolean;
  data?: PropertyData;
  error?: string;
}
