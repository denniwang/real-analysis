import { PropertyData, AnalysisParameters, InvestmentAnalysis } from '../types/property';

export function calculateInvestmentAnalysis(
  propertyData: PropertyData,
  parameters: AnalysisParameters
): InvestmentAnalysis {
  const {
    price,
  } = propertyData;
  
  const {
    downPaymentPercent,
    interestRate,
    loanTermYears,
    monthlyRent,
    propertyTaxPercent,
    insurancePercent,
    hoaFees,
    maintenancePercent,
    vacancyRatePercent,
  } = parameters;

  // Calculate down payment and loan amount
  const downPayment = price * (downPaymentPercent / 100);
  const loanAmount = price - downPayment;
  
  // Calculate closing costs (typically 3% of purchase price)
  const closingCosts = price * 0.03;
  const totalCashNeeded = downPayment + closingCosts;

  // Calculate monthly mortgage payment (P&I)
  const monthlyInterestRate = interestRate / 100 / 12;
  const numberOfPayments = loanTermYears * 12;
  const monthlyMortgagePayment = loanAmount * 
    (monthlyInterestRate * Math.pow(1 + monthlyInterestRate, numberOfPayments)) /
    (Math.pow(1 + monthlyInterestRate, numberOfPayments) - 1);

  // Calculate monthly expenses
  const monthlyPropertyTax = (price * propertyTaxPercent / 100) / 12;
  const monthlyInsurance = (price * insurancePercent / 100) / 12;
  const monthlyMaintenance = (price * maintenancePercent / 100) / 12;
  // Adjust rent for vacancy
  const effectiveMonthlyRent = monthlyRent * (1 - vacancyRatePercent / 100);
  const monthlyOperatingExpenses = monthlyPropertyTax + monthlyInsurance + hoaFees + monthlyMaintenance;
  
  const monthlyExpenses = monthlyMortgagePayment + monthlyPropertyTax + 
    monthlyInsurance + hoaFees + monthlyMaintenance;

  // Calculate cash flow
  const monthlyCashFlow = effectiveMonthlyRent - monthlyExpenses;
  const annualCashFlow = monthlyCashFlow * 12;

  // Calculate cap rate (NOI / Purchase Price)
  const annualNOI = (effectiveMonthlyRent * 12) - (monthlyOperatingExpenses * 12);
  const capRate = (annualNOI / price) * 100;
  const annualDebtService = monthlyMortgagePayment * 12;
  const dscr = annualDebtService > 0 ? (annualNOI / annualDebtService) : 0;

  // Calculate cash-on-cash return (Annual Cash Flow / Total Cash Invested)
  const cashOnCashReturn = (annualCashFlow / totalCashNeeded) * 100;

  return {
    propertyData,
    parameters,
    monthlyMortgagePayment,
    monthlyExpenses,
    monthlyCashFlow,
    annualCashFlow,
    capRate,
    cashOnCashReturn,
    totalCashNeeded,
    downPayment,
    closingCosts,
    effectiveMonthlyRent,
    monthlyOperatingExpenses,
    annualNOI,
    dscr,
  };
}

export function estimateRentFromPrice(price: number): number {
  // Rough estimate: 0.8% of property value per month
  // This is a starting point, user can adjust
  return Math.round(price * 0.008);
}
