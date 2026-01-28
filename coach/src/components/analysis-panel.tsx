"use client";

import { NegotiationAnalysis, AnalysisPoint, NegotiationScenario } from "@/lib/types";
import {
  cn,
  getScoreColor,
  getScoreBgColor,
  getTrendIcon,
} from "@/lib/utils";
import {
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle,
  AlertCircle,
  Lightbulb,
  Info,
  ChevronRight,
} from "lucide-react";

interface AnalysisPanelProps {
  analysis: NegotiationAnalysis | null;
  scenario: NegotiationScenario | null;
  isLoading?: boolean;
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-600">{label}</span>
          <span className={cn("font-medium", getScoreColor(score))}>
            {score}
          </span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", getScoreBgColor(score))}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function PointIcon({ type }: { type: AnalysisPoint["type"] }) {
  switch (type) {
    case "strength":
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    case "weakness":
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    case "suggestion":
      return <Lightbulb className="w-4 h-4 text-yellow-500" />;
    case "insight":
      return <Info className="w-4 h-4 text-blue-500" />;
  }
}

function AnalysisPointCard({ point }: { point: AnalysisPoint }) {
  return (
    <div
      className={cn(
        "p-3 rounded-lg border",
        point.type === "strength" && "bg-green-50 border-green-200",
        point.type === "weakness" && "bg-red-50 border-red-200",
        point.type === "suggestion" && "bg-yellow-50 border-yellow-200",
        point.type === "insight" && "bg-blue-50 border-blue-200"
      )}
    >
      <div className="flex items-start gap-2">
        <PointIcon type={point.type} />
        <div>
          <div className="font-medium text-sm text-gray-900">{point.title}</div>
          <div className="text-sm text-gray-600 mt-1">{point.description}</div>
        </div>
      </div>
    </div>
  );
}

function TrendIndicator({ trend }: { trend: "improving" | "declining" | "stable" }) {
  const Icon =
    trend === "improving"
      ? TrendingUp
      : trend === "declining"
      ? TrendingDown
      : Minus;
  const color =
    trend === "improving"
      ? "text-green-600"
      : trend === "declining"
      ? "text-red-500"
      : "text-gray-500";
  const label =
    trend === "improving"
      ? "Improving"
      : trend === "declining"
      ? "Declining"
      : "Stable";

  return (
    <div className={cn("flex items-center gap-1 text-sm", color)}>
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </div>
  );
}

export function AnalysisPanel({
  analysis,
  scenario,
  isLoading,
}: AnalysisPanelProps) {
  if (!scenario) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8">
        <Target className="w-16 h-16 mb-4 opacity-50" />
        <p className="text-lg font-medium text-center">No Active Negotiation</p>
        <p className="text-sm text-center mt-2">
          Select a scenario to begin and see your analysis here
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <h2 className="font-semibold text-gray-900">Negotiation Analysis</h2>
        <p className="text-sm text-gray-500 mt-1">{scenario.title}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Objectives */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Your Objectives
          </h3>
          <ul className="space-y-1">
            {scenario.objectives.map((objective, index) => (
              <li
                key={index}
                className="flex items-start gap-2 text-sm text-gray-600"
              >
                <ChevronRight className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                {objective}
              </li>
            ))}
          </ul>
        </div>

        {isLoading && !analysis && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-pulse text-gray-400">
              Analyzing negotiation...
            </div>
          </div>
        )}

        {analysis && (
          <>
            {/* Overall Score */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  Overall Score
                </h3>
                <TrendIndicator trend={analysis.score.trend} />
              </div>
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "text-4xl font-bold",
                    getScoreColor(analysis.score.overall)
                  )}
                >
                  {analysis.score.overall}
                </div>
                <div className="text-sm text-gray-600">/ 100</div>
              </div>
            </div>

            {/* Category Scores */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Category Breakdown
              </h3>
              <div className="space-y-3">
                <ScoreGauge
                  score={analysis.score.categories.persuasiveness}
                  label="Persuasiveness"
                />
                <ScoreGauge
                  score={analysis.score.categories.clarity}
                  label="Clarity"
                />
                <ScoreGauge
                  score={analysis.score.categories.professionalism}
                  label="Professionalism"
                />
                <ScoreGauge
                  score={analysis.score.categories.leverage}
                  label="Leverage"
                />
                <ScoreGauge
                  score={analysis.score.categories.strategy}
                  label="Strategy"
                />
              </div>
            </div>

            {/* Summary */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Summary
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {analysis.summary}
              </p>
            </div>

            {/* Positions */}
            <div className="grid grid-cols-1 gap-3">
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <div className="text-xs font-medium text-blue-600 mb-1">
                  Your Position
                </div>
                <div className="text-sm text-gray-700">
                  {analysis.userPosition}
                </div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-xs font-medium text-gray-500 mb-1">
                  Counterparty Position
                </div>
                <div className="text-sm text-gray-700">
                  {analysis.counterpartyPosition}
                </div>
              </div>
            </div>

            {/* Analysis Points */}
            {analysis.points.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Feedback
                </h3>
                <div className="space-y-2">
                  {analysis.points.map((point, index) => (
                    <AnalysisPointCard key={index} point={point} />
                  ))}
                </div>
              </div>
            )}

            {/* Next Steps */}
            {analysis.nextSteps.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Suggested Next Steps
                </h3>
                <ul className="space-y-2">
                  {analysis.nextSteps.map((step, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2 text-sm text-gray-600"
                    >
                      <span className="w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium shrink-0">
                        {index + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
