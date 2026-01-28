"use client";

import { useState, useCallback } from "react";
import { EmailThread } from "@/components/email-thread";
import { EmailComposer } from "@/components/email-composer";
import { AnalysisPanel } from "@/components/analysis-panel";
import { ScenarioSelector } from "@/components/scenario-selector";
import { DocumentViewer } from "@/components/document-viewer";
import { DEFAULT_SCENARIOS } from "@/lib/prompts";
import { generateId } from "@/lib/utils";
import {
  Email,
  NegotiationScenario,
  NegotiationAnalysis,
  ParsedDocumentData,
  Attachment,
  DocumentAnalysis,
} from "@/lib/types";
import { BookOpen, RotateCcw, Gavel, FileText, X } from "lucide-react";

interface AttachedFile {
  file: File;
  name: string;
  parsed?: ParsedDocumentData;
  parsing?: boolean;
  error?: string;
}

export default function Home() {
  const [scenario, setScenario] = useState<NegotiationScenario | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [analysis, setAnalysis] = useState<NegotiationAnalysis | null>(null);
  const [documentAnalysis, setDocumentAnalysis] = useState<DocumentAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showScenarioSelector, setShowScenarioSelector] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Document-related state
  const [documentHistory, setDocumentHistory] = useState<ParsedDocumentData[]>([]);
  const [currentDocument, setCurrentDocument] = useState<ParsedDocumentData | null>(null);
  const [showDocumentPanel, setShowDocumentPanel] = useState(false);

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
      } finally {
        setIsAnalyzing(false);
      }
    },
    []
  );

  // Analyze document markup
  const analyzeDocument = useCallback(
    async (
      document: ParsedDocumentData,
      currentScenario: NegotiationScenario,
      previousVersions: ParsedDocumentData[]
    ) => {
      try {
        const response = await fetch("/api/analyze-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario: currentScenario,
            document,
            previousVersions: previousVersions.length > 0 ? previousVersions : undefined,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to analyze document");
        }

        const data = await response.json();
        setDocumentAnalysis(data.analysis);
      } catch (err) {
        console.error("Document analysis error:", err);
      }
    },
    []
  );

  // Send user email and get counterparty response
  const handleSendEmail = useCallback(
    async (body: string, attachments?: AttachedFile[]) => {
      if (!scenario) return;

      setError(null);
      setIsLoading(true);

      // Process attachments
      const emailAttachments: Attachment[] = [];
      let newDocument: ParsedDocumentData | null = null;

      if (attachments) {
        for (const attachment of attachments) {
          if (attachment.parsed) {
            emailAttachments.push({
              id: generateId(),
              name: attachment.name,
              type: "markup",
              content: attachment.parsed.fullText,
              parsedDocument: attachment.parsed,
            });
            newDocument = attachment.parsed;
          }
        }
      }

      // Add user email
      const userEmail: Email = {
        id: generateId(),
        from: "user",
        fromName: scenario.userRole,
        toName: scenario.counterpartyRole,
        subject,
        body,
        timestamp: new Date(),
        attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
      };

      const updatedEmails = [...emails, userEmail];
      setEmails(updatedEmails);

      // If there's a new document, update document state and trigger analysis
      if (newDocument) {
        const newHistory = currentDocument
          ? [...documentHistory, currentDocument]
          : documentHistory;

        setDocumentHistory(newHistory);
        setCurrentDocument(newDocument);
        setShowDocumentPanel(true);

        // Analyze the document
        analyzeDocument(newDocument, scenario, newHistory);
      }

      try {
        let counterpartyResponseBody: string;

        // If there's a document with track changes, use the document negotiation API
        // which applies the hidden baseline to evaluate and respond to changes
        if (newDocument && newDocument.trackChanges.length > 0) {
          const negotiateResponse = await fetch("/api/negotiate-document", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scenario,
              userDocument: newDocument,
              previousEmails: updatedEmails.map((e) => ({
                from: e.from,
                fromName: e.fromName,
                toName: e.toName,
                subject: e.subject,
                body: e.body,
              })),
              previousDocuments: documentHistory,
            }),
          });

          if (!negotiateResponse.ok) {
            throw new Error("Failed to negotiate document");
          }

          const negotiateData = await negotiateResponse.json();
          counterpartyResponseBody = negotiateData.emailResponse ||
            "Thank you for your proposed revisions. We are reviewing them carefully.";

          // Store negotiation result for potential display
          if (negotiateData.negotiationResult) {
            console.log("Document negotiation result:", negotiateData.negotiationResult);
          }
        } else {
          // No document - use regular chat API
          const chatPayload: any = {
            scenario,
            emails: updatedEmails.map((e) => ({
              ...e,
              timestamp: e.timestamp.toISOString(),
            })),
          };

          const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(chatPayload),
          });

          if (!response.ok) {
            throw new Error("Failed to get response");
          }

          const data = await response.json();
          counterpartyResponseBody = data.response;
        }

        // Add counterparty email
        const counterpartyEmail: Email = {
          id: generateId(),
          from: "counterparty",
          fromName: scenario.counterpartyRole,
          toName: scenario.userRole,
          subject,
          body: counterpartyResponseBody,
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
    [scenario, emails, subject, analyzeNegotiation, analyzeDocument, currentDocument, documentHistory]
  );

  // Start a scenario with initial counterparty email
  const handleSelectScenario = useCallback(
    async (selectedScenario: NegotiationScenario) => {
      setScenario(selectedScenario);
      setEmails([]);
      setAnalysis(null);
      setDocumentAnalysis(null);
      setDocumentHistory([]);
      setCurrentDocument(null);
      setShowDocumentPanel(false);
      setError(null);
      setIsLoading(true);

      try {
        // Generate initial email from counterparty
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario: selectedScenario,
            emails: [],
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
          {currentDocument && (
            <button
              onClick={() => setShowDocumentPanel(!showDocumentPanel)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                showDocumentPanel
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-700 bg-gray-100 hover:bg-gray-200"
              }`}
            >
              <FileText className="w-4 h-4" />
              Document
              <span className="text-xs bg-blue-200 text-blue-700 px-1.5 py-0.5 rounded">
                {currentDocument.trackChanges.length}
              </span>
            </button>
          )}
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
        <div className="flex-1 flex flex-col bg-white border-r min-w-0">
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
              placeholder="Write your negotiation response... Attach a marked-up .docx for redline analysis."
            />
          )}
        </div>

        {/* Document Panel - Middle (conditional) */}
        {showDocumentPanel && currentDocument && (
          <div className="w-96 bg-white border-r overflow-hidden shrink-0 flex flex-col">
            <div className="flex items-center justify-between p-3 border-b bg-gray-50">
              <span className="font-medium text-sm text-gray-700">
                Document Markup
              </span>
              <button
                onClick={() => setShowDocumentPanel(false)}
                className="p-1 hover:bg-gray-200 rounded"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <DocumentViewer document={currentDocument} />
            </div>
            {documentAnalysis && (
              <div className="border-t p-3 bg-blue-50 max-h-48 overflow-y-auto">
                <div className="text-xs font-medium text-blue-700 mb-2">
                  AI Assessment
                </div>
                <p className="text-xs text-blue-900">
                  {documentAnalysis.overallAssessment}
                </p>
                {documentAnalysis.scores && (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                      Overall: {documentAnalysis.scores.overall}/100
                    </span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                      Drafting: {documentAnalysis.scores.draftingQuality}/100
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
