"use client";
import React, { useState } from "react";
import PropertyAnalysis from "./components/PropertyAnalysis";
import {
  PropertyData,
  AnalysisParameters,
  InvestmentAnalysis,
} from "./types/property";
import {
  calculateInvestmentAnalysis,
  estimateRentFromPrice,
} from "./utils/calculations";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<InvestmentAnalysis | null>(null);

  // Analysis parameters with defaults
  const [parameters, setParameters] = useState<AnalysisParameters>({
    downPaymentPercent: 20,
    interestRate: 7,
    loanTermYears: 30,
    monthlyRent: 0, // Will be calculated from price
    propertyTaxPercent: 1.2,
    insurancePercent: 0.5,
    hoaFees: 0,
    maintenancePercent: 1,
    vacancyRatePercent: 8,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError("");
    setAnalysis(null);

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "Failed to scrape property data");
        return;
      }

      const propertyData: PropertyData = result.data;

      // Auto-calculate rent if not set
      const monthlyRent =
        parameters.monthlyRent || estimateRentFromPrice(propertyData.price);

      const updatedParameters = { ...parameters, monthlyRent };
      setParameters(updatedParameters);

      const investmentAnalysis = calculateInvestmentAnalysis(
        propertyData,
        updatedParameters
      );
      setAnalysis(investmentAnalysis);
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const updateParameter = (key: keyof AnalysisParameters, value: number) => {
    const newParameters = { ...parameters, [key]: value };
    setParameters(newParameters);

    // Recalculate analysis if we have property data
    if (analysis) {
      const newAnalysis = calculateInvestmentAnalysis(
        analysis.propertyData,
        newParameters
      );
      setAnalysis(newAnalysis);
    }
  };

  const SliderInput = ({
    label,
    value,
    min,
    max,
    step,
    suffix,
    onChange,
  }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    suffix: string;
    onChange: (value: number) => void;
  }) => (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        {label}: {value}
        {suffix}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Real Estate Investment Analyzer
          </h1>
          <p className="text-lg text-gray-600">
            Analyze properties from Zillow, Redfin, and Homes.com
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Input Form */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Property URL
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <input
                    type="url"
                    placeholder="Paste Zillow, Redfin, or Homes.com URL here"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={loading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !url.trim()}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {loading ? "Analyzing..." : "Analyze Property"}
                </button>
              </form>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-red-600 text-sm">{error}</p>
                  {error.includes("Zillow") && (
                    <div className="mt-2 text-xs text-red-500">
                      <p>
                        <strong>Tip:</strong> Zillow has strong anti-scraping
                        measures. Try:
                      </p>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        <li>Using Redfin or Homes.com URLs instead</li>
                        <li>Waiting a few minutes and trying again</li>
                        <li>Using a different Zillow property URL</li>
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Analysis Parameters */}
            <div className="bg-white rounded-lg shadow-md p-6 mt-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Analysis Parameters
              </h2>

              <div className="space-y-6">
                <SliderInput
                  label="Down Payment"
                  value={parameters.downPaymentPercent}
                  min={5}
                  max={50}
                  step={1}
                  suffix="%"
                  onChange={(value) =>
                    updateParameter("downPaymentPercent", value)
                  }
                />

                <SliderInput
                  label="Interest Rate"
                  value={parameters.interestRate}
                  min={3}
                  max={12}
                  step={0.1}
                  suffix="%"
                  onChange={(value) => updateParameter("interestRate", value)}
                />

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Loan Term: {parameters.loanTermYears} years
                  </label>
                  <input
                    type="range"
                    min={15}
                    max={30}
                    step={5}
                    value={parameters.loanTermYears}
                    onChange={(e) =>
                      updateParameter("loanTermYears", parseInt(e.target.value))
                    }
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <SliderInput
                  label="Monthly Rent"
                  value={parameters.monthlyRent}
                  min={500}
                  max={10000}
                  step={50}
                  suffix=""
                  onChange={(value) => updateParameter("monthlyRent", value)}
                />

                <SliderInput
                  label="Property Tax"
                  value={parameters.propertyTaxPercent}
                  min={0.5}
                  max={3}
                  step={0.1}
                  suffix="%"
                  onChange={(value) =>
                    updateParameter("propertyTaxPercent", value)
                  }
                />

                <SliderInput
                  label="Insurance"
                  value={parameters.insurancePercent}
                  min={0.2}
                  max={2}
                  step={0.1}
                  suffix="%"
                  onChange={(value) =>
                    updateParameter("insurancePercent", value)
                  }
                />

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    HOA Fees: ${parameters.hoaFees}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1000}
                    step={25}
                    value={parameters.hoaFees}
                    onChange={(e) =>
                      updateParameter("hoaFees", parseInt(e.target.value))
                    }
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <SliderInput
                  label="Maintenance"
                  value={parameters.maintenancePercent}
                  min={0.5}
                  max={3}
                  step={0.1}
                  suffix="%"
                  onChange={(value) =>
                    updateParameter("maintenancePercent", value)
                  }
                />

                <SliderInput
                  label="Vacancy Rate"
                  value={parameters.vacancyRatePercent}
                  min={5}
                  max={15}
                  step={1}
                  suffix="%"
                  onChange={(value) =>
                    updateParameter("vacancyRatePercent", value)
                  }
                />
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="lg:col-span-2">
            {analysis && <PropertyAnalysis analysis={analysis} />}
          </div>
        </div>
      </div>
    </div>
  );
}
