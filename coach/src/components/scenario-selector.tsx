"use client";

import { NegotiationScenario } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BookOpen, ChevronRight, X } from "lucide-react";

interface ScenarioSelectorProps {
  scenarios: NegotiationScenario[];
  selectedScenario: NegotiationScenario | null;
  onSelect: (scenario: NegotiationScenario) => void;
  onClose: () => void;
  isOpen: boolean;
}

function DifficultyBadge({
  difficulty,
}: {
  difficulty: NegotiationScenario["difficulty"];
}) {
  return (
    <span
      className={cn(
        "px-2 py-0.5 text-xs font-medium rounded-full",
        difficulty === "beginner" && "bg-green-100 text-green-700",
        difficulty === "intermediate" && "bg-yellow-100 text-yellow-700",
        difficulty === "advanced" && "bg-red-100 text-red-700"
      )}
    >
      {difficulty}
    </span>
  );
}

export function ScenarioSelector({
  scenarios,
  selectedScenario,
  onSelect,
  onClose,
  isOpen,
}: ScenarioSelectorProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Select a Negotiation Scenario
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              onClick={() => {
                onSelect(scenario);
                onClose();
              }}
              className={cn(
                "w-full text-left p-4 rounded-lg border-2 transition-all hover:border-blue-300 hover:bg-blue-50",
                selectedScenario?.id === scenario.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200"
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">
                      {scenario.title}
                    </h3>
                    <DifficultyBadge difficulty={scenario.difficulty} />
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    {scenario.description}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>
                      <strong>You:</strong> {scenario.userRole}
                    </span>
                    <span>
                      <strong>vs:</strong> {scenario.counterpartyRole}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
