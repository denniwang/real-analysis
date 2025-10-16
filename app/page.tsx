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
  type Unit = "%" | "$/mo" | "years" | "";
  type SliderConfig = {
    key: keyof AnalysisParameters;
    label: string;
    min: number;
    max: number;
    step: number;
    unit: Unit;
    defaultValue: number;
  };

  const SLIDER_CONFIGS: SliderConfig[] = [
    {
      key: "downPaymentPercent",
      label: "Down Payment",
      min: 5,
      max: 50,
      step: 1,
      unit: "%",
      defaultValue: 20,
    },
    {
      key: "interestRate",
      label: "Interest Rate",
      min: 3,
      max: 12,
      step: 0.1,
      unit: "%",
      defaultValue: 7,
    },
    {
      key: "loanTermYears",
      label: "Loan Term",
      min: 15,
      max: 30,
      step: 5,
      unit: "years",
      defaultValue: 30,
    },
    {
      key: "monthlyRent",
      label: "Monthly Rent",
      min: 500,
      max: 10000,
      step: 50,
      unit: "",
      defaultValue: 0,
    },
    {
      key: "propertyTaxPercent",
      label: "Property Tax",
      min: 0.5,
      max: 3,
      step: 0.1,
      unit: "%",
      defaultValue: 1.2,
    },
    {
      key: "insurancePercent",
      label: "Insurance",
      min: 0.2,
      max: 2,
      step: 0.1,
      unit: "%",
      defaultValue: 0.5,
    },
    {
      key: "hoaFees",
      label: "HOA Fees",
      min: 0,
      max: 1000,
      step: 25,
      unit: "$/mo",
      defaultValue: 0,
    },
    {
      key: "maintenancePercent",
      label: "Maintenance",
      min: 0.5,
      max: 3,
      step: 0.1,
      unit: "%",
      defaultValue: 1,
    },
    {
      key: "vacancyRatePercent",
      label: "Vacancy Rate",
      min: 5,
      max: 15,
      step: 1,
      unit: "%",
      defaultValue: 8,
    },
  ];

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<InvestmentAnalysis | null>(null);

  // Analysis parameters with defaults
  const [parameters, setParameters] = useState<AnalysisParameters>(() =>
    SLIDER_CONFIGS.reduce((acc, cfg) => {
      (acc as any)[cfg.key] = cfg.defaultValue;
      return acc;
    }, {} as AnalysisParameters)
  );

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

      let propertyData: PropertyData = result.data;
      // Prefer Redfin Estimate for off-market listings in analysis, but still display sold info
      if (
        (propertyData as any).status === "off-market" &&
        (propertyData as any).redfinEstimate &&
        (propertyData as any).redfinEstimate > 0
      ) {
        propertyData = {
          ...propertyData,
          price: (propertyData as any).redfinEstimate,
        } as PropertyData;
      }

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
      <label className="block text-xs font-medium text-gray-600">{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
        />
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            className="w-20 px-2 py-1 text-xs border border-gray-300 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-500 min-w-[20px]">{suffix}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-8"></div>

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

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {SLIDER_CONFIGS.map((cfg) => (
                  <div className="space-y-3" key={cfg.key}>
                    <SliderInput
                      label={cfg.label}
                      value={parameters[cfg.key]}
                      min={cfg.min}
                      max={cfg.max}
                      step={cfg.step}
                      suffix={cfg.unit}
                      onChange={(value) => updateParameter(cfg.key, value)}
                    />
                  </div>
                ))}
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
