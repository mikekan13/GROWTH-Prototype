"use client";

import { useState, useEffect } from "react";

interface BudgetSummary {
  totalBudget: string;
  allocated: string;
  liquid: string;
  utilizationPercent: number;
  characterCount: number;
  worldAssetCount: number;
  isOverBudget: boolean;
}

interface KrmaBudgetWidgetProps {
  campaignId: string;
}

export function KrmaBudgetWidget({ campaignId }: KrmaBudgetWidgetProps) {
  const [budget, setBudget] = useState<BudgetSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBudget = async () => {
      try {
        const response = await fetch(`/api/campaigns/${campaignId}/budget`);
        if (response.ok) {
          const data = await response.json();
          setBudget(data.summary);
        }
      } catch (error) {
        console.error("Failed to fetch campaign budget:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBudget();
    
    // Auto-refresh budget every 30 seconds
    const interval = setInterval(fetchBudget, 30000);
    return () => clearInterval(interval);
  }, [campaignId]);

  if (loading) {
    return (
      <div className="growth-card p-6 animate-pulse">
        <div className="h-6 bg-growth-gray-200 rounded mb-4"></div>
        <div className="space-y-3">
          <div className="h-4 bg-growth-gray-200 rounded"></div>
          <div className="h-4 bg-growth-gray-200 rounded"></div>
          <div className="h-4 bg-growth-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (!budget) {
    return (
      <div className="growth-card p-6">
        <div className="text-center growth-body">
          <div className="growth-title text-lg mb-2">KRMA Budget</div>
          <p>Unable to load budget information</p>
        </div>
      </div>
    );
  }

  const totalBudgetNum = BigInt(budget.totalBudget);
  const allocatedNum = BigInt(budget.allocated);
  const liquidNum = BigInt(budget.liquid);

  return (
    <div className={`growth-card p-6 border-l-4 ${
      budget.isOverBudget 
        ? 'border-growth-error' 
        : budget.utilizationPercent > 80 
        ? 'border-growth-warning' 
        : 'border-growth-success'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="growth-title text-lg">
          KRMA Budget
        </h3>
        {budget.isOverBudget && (
          <span className="bg-growth-error bg-opacity-10 text-growth-error text-xs font-medium px-2.5 py-0.5 rounded-full">
            Over Budget!
          </span>
        )}
      </div>

      {/* Budget Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm growth-subtitle mb-2">
          <span>Utilization</span>
          <span>{budget.utilizationPercent.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-growth-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-300 ${
              budget.isOverBudget
                ? 'bg-growth-error'
                : budget.utilizationPercent > 80
                ? 'bg-growth-warning'
                : 'bg-growth-success'
            }`}
            style={{ width: `${Math.min(budget.utilizationPercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Budget Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-growth-primary">
            {totalBudgetNum.toLocaleString()}
          </div>
          <div className="text-xs text-growth-gray-500">Total Budget</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-growth-accent">
            {allocatedNum.toLocaleString()}
          </div>
          <div className="text-xs text-growth-gray-500">Allocated</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-growth-success">
            {liquidNum.toLocaleString()}
          </div>
          <div className="text-xs text-growth-gray-500">Liquid Available</div>
        </div>
      </div>

      {/* Resource Breakdown */}
      <div className="border-t pt-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex justify-between">
            <span className="growth-body">Characters:</span>
            <span className="font-medium">{budget.characterCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="growth-body">World Assets:</span>
            <span className="font-medium">{budget.worldAssetCount}</span>
          </div>
        </div>
      </div>

      {/* Warning Messages */}
      {budget.isOverBudget && (
        <div className="mt-4 p-3 bg-growth-error bg-opacity-10 border border-growth-error border-opacity-30 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-growth-error" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-growth-error">
                Budget Exceeded
              </h3>
              <p className="text-xs text-growth-error opacity-90 mt-1">
                Campaign allocation exceeds available KRMA. Consider reducing character complexity or world assets.
              </p>
            </div>
          </div>
        </div>
      )}

      {budget.utilizationPercent > 90 && !budget.isOverBudget && (
        <div className="mt-4 p-3 bg-growth-warning bg-opacity-10 border border-growth-warning border-opacity-30 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-growth-warning" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-growth-warning">
                Budget Nearly Full
              </h3>
              <p className="text-xs text-growth-warning opacity-90 mt-1">
                You&apos;re using {budget.utilizationPercent.toFixed(1)}% of your KRMA budget. Consider acquiring more KRMA before adding new characters or assets.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}