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

  // Use offerPrice override if provided, otherwise list price
  const purchasePrice = parameters.offerPrice && parameters.offerPrice > 0 ? parameters.offerPrice : price;

  // Calculate down payment and loan amount based on purchase price
  const downPayment = purchasePrice * (downPaymentPercent / 100);
  const loanAmount = purchasePrice - downPayment;
  
  // Calculate closing costs (typically 3% of purchase price)
  const closingCosts = purchasePrice * 0.03;
  const totalCashNeeded = downPayment + closingCosts;

  // Calculate monthly mortgage payment (P&I)
  const monthlyInterestRate = interestRate / 100 / 12;
  const numberOfPayments = loanTermYears * 12;
  const monthlyMortgagePayment = loanAmount * 
    (monthlyInterestRate * Math.pow(1 + monthlyInterestRate, numberOfPayments)) /
    (Math.pow(1 + monthlyInterestRate, numberOfPayments) - 1);

  // Calculate monthly expenses
  const monthlyPropertyTax = (purchasePrice * propertyTaxPercent / 100) / 12;
  const monthlyInsurance = (purchasePrice * insurancePercent / 100) / 12;
  const monthlyMaintenance = (purchasePrice * maintenancePercent / 100) / 12;
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
  const capRate = (annualNOI / purchasePrice) * 100;
  const annualDebtService = monthlyMortgagePayment * 12;
  const dscr = annualDebtService > 0 ? (annualNOI / annualDebtService) : 0;

  // Calculate cash-on-cash return (Annual Cash Flow / Total Cash Invested)
  const cashOnCashReturn = (annualCashFlow / totalCashNeeded) * 100;

  const result: InvestmentAnalysis = {
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

  // Cash-out refinance scenario if ARV provided
  if (parameters.afterRepairValue && parameters.afterRepairValue > 0) {
    const refiLTV = 0.75; // default 75% LTV
    const refiLoanAmount = parameters.afterRepairValue * refiLTV;
    const refiCashOut = Math.max(0, refiLoanAmount - loanAmount);
    result.refiLoanAmount = refiLoanAmount;
    result.refiCashOut = refiCashOut;
    result.refiLTV = refiLTV * 100;
  }

  return result;
}

export function estimateRentFromPrice(price: number): number {
  // Rough estimate: 0.8% of property value per month
  // This is a starting point, user can adjust
  return Math.round(price * 0.008);
}
