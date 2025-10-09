import React from "react";
import { InvestmentAnalysis } from "../types/property";

interface PropertyAnalysisProps {
  analysis: InvestmentAnalysis;
}

export default function PropertyAnalysis({ analysis }: PropertyAnalysisProps) {
  const {
    propertyData,
    monthlyCashFlow,
    annualCashFlow,
    capRate,
    cashOnCashReturn,
    totalCashNeeded,
  } = analysis;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Property Info Card */}
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          Property Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Address</p>
            <p className="text-lg font-semibold text-gray-800">
              {propertyData.address}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Price</p>
            <p className="text-2xl font-bold text-blue-600">
              {formatCurrency(propertyData.price)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Property Type</p>
            <p className="text-lg text-gray-800">{propertyData.propertyType}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Specifications</p>
            <p className="text-lg text-gray-800">
              {propertyData.beds} bed{propertyData.beds !== 1 ? "s" : ""} •{" "}
              {propertyData.baths} bath{propertyData.baths !== 1 ? "s" : ""} •{" "}
              {propertyData.sqft.toLocaleString()} sqft
            </p>
          </div>
        </div>
      </div>

      {/* Investment Analysis Card */}
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          Investment Analysis
        </h2>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div
            className={`p-4 rounded-lg ${
              monthlyCashFlow >= 0
                ? "bg-green-50 border border-green-200"
                : "bg-red-50 border border-red-200"
            }`}
          >
            <p className="text-sm text-gray-600">Monthly Cash Flow</p>
            <p
              className={`text-xl font-bold ${
                monthlyCashFlow >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatCurrency(monthlyCashFlow)}
            </p>
          </div>

          <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
            <p className="text-sm text-gray-600">Annual Cash Flow</p>
            <p
              className={`text-xl font-bold ${
                annualCashFlow >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatCurrency(annualCashFlow)}
            </p>
          </div>

          <div className="p-4 rounded-lg bg-purple-50 border border-purple-200">
            <p className="text-sm text-gray-600">Cap Rate</p>
            <p className="text-xl font-bold text-purple-600">
              {formatPercentage(capRate)}
            </p>
          </div>

          <div className="p-4 rounded-lg bg-orange-50 border border-orange-200">
            <p className="text-sm text-gray-600">Cash-on-Cash Return</p>
            <p
              className={`text-xl font-bold ${
                cashOnCashReturn >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatPercentage(cashOnCashReturn)}
            </p>
          </div>
        </div>

        {/* Additional Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Total Cash Needed</p>
            <p className="text-lg font-semibold text-gray-800">
              {formatCurrency(totalCashNeeded)}
            </p>
            <p className="text-xs text-gray-500">
              Down payment + closing costs (~3%)
            </p>
          </div>

          <div>
            <p className="text-sm text-gray-600">Monthly Rent Estimate</p>
            <p className="text-lg font-semibold text-gray-800">
              {formatCurrency(analysis.parameters.monthlyRent)}
            </p>
            <p className="text-xs text-gray-500">
              Adjustable in parameters above
            </p>
          </div>
        </div>

        {/* Investment Summary */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold text-gray-800 mb-2">
            Investment Summary
          </h3>
          <div className="text-sm text-gray-600 space-y-1">
            <p>
              • Monthly mortgage payment:{" "}
              {formatCurrency(analysis.monthlyMortgagePayment)}
            </p>
            <p>
              • Total monthly expenses:{" "}
              {formatCurrency(analysis.monthlyExpenses)}
            </p>
            <p>
              • Down payment ({analysis.parameters.downPaymentPercent}%):{" "}
              {formatCurrency(analysis.downPayment)}
            </p>
            <p>• Closing costs: {formatCurrency(analysis.closingCosts)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
