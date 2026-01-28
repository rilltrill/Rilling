"use client";

import { useState, useCallback, useEffect } from "react";
import { EmailThread } from "@/components/email-thread";
import { EmailComposer } from "@/components/email-composer";
import { AnalysisPanel } from "@/components/analysis-panel";
import { ScenarioSelector } from "@/components/scenario-selector";
import { DEFAULT_SCENARIOS } from "@/lib/prompts";
import { generateId } from "@/lib/utils";
import {
  Email,
  NegotiationScenario,
  NegotiationAnalysis,
} from "@/lib/types";
import { BookOpen, RotateCcw, Gavel } from "lucide-react";

export default function Home() {
  const [scenario, setScenario] = useState<NegotiationScenario | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [analysis, setAnalysis] = useState<NegotiationAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showScenarioSelector, setShowScenarioSelector] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get subject line from scenario
  const subject = scenario?.title || "Negotiation";

  // Analyze the negotiation after each exchange
  const analyzeNegotiation = useCallback(
    async (currentEmails: Email[], currentScenario: NegotiationScenario) => {
      if (currentEmails.length === 0) return;

      setIsAnalyzing(true);
      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario: currentScenario,
            emails: currentEmails.map((e) => ({
              ...e,
              timestamp: e.timestamp.toISOString(),
            })),
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to analyze");
        }

        const data = await response.json();
        setAnalysis(data.analysis);
      } catch (err) {
        console.error("Analysis error:", err);
        // Don't show error for analysis - it's supplementary
      } finally {
        setIsAnalyzing(false);
      }
    },
    []
  );

  // Send user email and get counterparty response
  const handleSendEmail = useCallback(
    async (body: string) => {
      if (!scenario) return;

      setError(null);
      setIsLoading(true);

      // Add user email
      const userEmail: Email = {
        id: generateId(),
        from: "user",
        fromName: scenario.userRole,
        toName: scenario.counterpartyRole,
        subject,
        body,
        timestamp: new Date(),
      };

      const updatedEmails = [...emails, userEmail];
      setEmails(updatedEmails);

      try {
        // Get counterparty response
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario,
            emails: updatedEmails.map((e) => ({
              ...e,
              timestamp: e.timestamp.toISOString(),
            })),
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to get response");
        }

        const data = await response.json();

        // Add counterparty email
        const counterpartyEmail: Email = {
          id: generateId(),
          from: "counterparty",
          fromName: scenario.counterpartyRole,
          toName: scenario.userRole,
          subject,
          body: data.response,
          timestamp: new Date(),
        };

        const finalEmails = [...updatedEmails, counterpartyEmail];
        setEmails(finalEmails);

        // Analyze after the exchange
        analyzeNegotiation(finalEmails, scenario);
      } catch (err) {
        console.error("Send error:", err);
        setError("Failed to get response. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [scenario, emails, subject, analyzeNegotiation]
  );

  // Start a scenario with initial counterparty email
  const handleSelectScenario = useCallback(
    async (selectedScenario: NegotiationScenario) => {
      setScenario(selectedScenario);
      setEmails([]);
      setAnalysis(null);
      setError(null);
      setIsLoading(true);

      try {
        // Generate initial email from counterparty
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario: selectedScenario,
            emails: [], // Empty - will trigger initial email
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to start scenario");
        }

        const data = await response.json();

        const initialEmail: Email = {
          id: generateId(),
          from: "counterparty",
          fromName: selectedScenario.counterpartyRole,
          toName: selectedScenario.userRole,
          subject: selectedScenario.title,
          body: data.response,
          timestamp: new Date(),
        };

        setEmails([initialEmail]);
      } catch (err) {
        console.error("Start scenario error:", err);
        setError("Failed to start scenario. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Reset current negotiation
  const handleReset = useCallback(() => {
    if (scenario) {
      handleSelectScenario(scenario);
    }
  }, [scenario, handleSelectScenario]);

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Gavel className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Coach</h1>
            <p className="text-sm text-gray-500">Negotiation Training</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowScenarioSelector(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            Scenarios
          </button>
          {scenario && (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Email Panel - Left Side */}
        <div className="flex-1 flex flex-col bg-white border-r">
          {/* Email Thread */}
          <div className="flex-1 overflow-hidden">
            <EmailThread emails={emails} subject={subject} />
          </div>

          {/* Error Message */}
          {error && (
            <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Email Composer */}
          {scenario && (
            <EmailComposer
              recipientName={scenario.counterpartyRole}
              subject={subject}
              onSend={handleSendEmail}
              disabled={isLoading}
              placeholder="Write your negotiation response..."
            />
          )}
        </div>

        {/* Analysis Panel - Right Side */}
        <div className="w-96 bg-gray-50 border-l overflow-hidden shrink-0">
          <AnalysisPanel
            analysis={analysis}
            scenario={scenario}
            isLoading={isAnalyzing}
          />
        </div>
      </div>

      {/* Scenario Selector Modal */}
      <ScenarioSelector
        scenarios={DEFAULT_SCENARIOS}
        selectedScenario={scenario}
        onSelect={handleSelectScenario}
        onClose={() => setShowScenarioSelector(false)}
        isOpen={showScenarioSelector}
      />
    </div>
  );
}
