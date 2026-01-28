import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { NegotiationScenario, ParsedDocumentData } from "@/lib/types";
import {
  getBaselineNegotiationPrompt,
  buildBaselineNegotiationContext,
  buildEmailContext,
} from "@/lib/prompts";
import {
  loadBaselineDocument,
  formatBaselineForPrompt,
  DocumentNegotiationResult,
} from "@/lib/baseline-document";
import { formatDocumentForAnalysis } from "@/lib/document-parser";

const anthropic = new Anthropic();

export interface NegotiateDocumentRequest {
  scenario: NegotiationScenario;
  userDocument: ParsedDocumentData;
  previousEmails?: { from: string; fromName: string; toName: string; subject: string; body: string }[];
  previousDocuments?: ParsedDocumentData[];
}

export interface NegotiateDocumentResponse {
  success: boolean;
  negotiationResult?: DocumentNegotiationResult;
  emailResponse?: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: NegotiateDocumentRequest = await request.json();
    const { scenario, userDocument, previousEmails, previousDocuments } = body;

    if (!scenario || !userDocument) {
      return NextResponse.json(
        { success: false, error: "Missing scenario or document" },
        { status: 400 }
      );
    }

    // Load the baseline document for this scenario
    const baseline = loadBaselineDocument(scenario.id);

    // Format the user's document for analysis
    const userDocumentSummary = formatDocumentForAnalysis(userDocument);

    // Build previous exchange context
    let previousExchanges = "";
    if (previousEmails && previousEmails.length > 0) {
      previousExchanges = previousEmails
        .map(
          (email, i) =>
            `Email ${i + 1} from ${email.fromName}:\n${email.body}`
        )
        .join("\n\n---\n\n");
    }

    // Build the prompt
    const systemPrompt = getBaselineNegotiationPrompt();

    let baselineContext: string;
    if (baseline) {
      // We have a structured baseline
      baselineContext = buildBaselineNegotiationContext(
        formatBaselineForPrompt(baseline),
        userDocumentSummary,
        previousExchanges
      );
    } else {
      // No baseline - use scenario context to generate reasonable positions
      baselineContext = buildBaselineNegotiationContext(
        generateDefaultBaselineFromScenario(scenario),
        userDocumentSummary,
        previousExchanges
      );
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: baselineContext,
        },
      ],
    });

    const responseContent = message.content[0];
    if (responseContent.type !== "text") {
      return NextResponse.json(
        { success: false, error: "Unexpected response type" },
        { status: 500 }
      );
    }

    // Parse the response
    let negotiationResult: DocumentNegotiationResult;
    let emailResponse: string;

    try {
      const jsonMatch = responseContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Extract the structured result
      negotiationResult = {
        overallAssessment: parsed.internalNotes || "Evaluation complete",
        termEvaluations: (parsed.evaluations || []).map((e: any) => ({
          termId: e.termId || "",
          termName: e.termId || "Unknown",
          userProposal: e.userChange,
          baselinePosition: e.counterProposal || "",
          idealPosition: "",
          comparison:
            e.decision === "accept"
              ? "meets_baseline"
              : e.decision === "counter"
              ? "below_baseline"
              : "below_baseline",
          decision: e.decision,
          counterProposal: e.counterProposal,
          reasoning: e.reasoning,
          responseLanguage: e.responseToUser,
        })),
        acceptedChanges: (parsed.evaluations || [])
          .filter((e: any) => e.decision === "accept")
          .map((e: any) => ({
            termId: e.termId || "",
            termName: e.termId || "",
            userProposal: e.userChange,
            baselinePosition: "",
            idealPosition: "",
            comparison: "meets_baseline" as const,
            decision: "accept" as const,
            reasoning: e.reasoning,
            responseLanguage: e.responseToUser,
          })),
        counteredChanges: (parsed.evaluations || [])
          .filter((e: any) => e.decision === "counter")
          .map((e: any) => ({
            termId: e.termId || "",
            termName: e.termId || "",
            userProposal: e.userChange,
            baselinePosition: e.counterProposal || "",
            idealPosition: "",
            comparison: "below_baseline" as const,
            decision: "counter" as const,
            counterProposal: e.counterProposal,
            reasoning: e.reasoning,
            responseLanguage: e.responseToUser,
          })),
        rejectedChanges: (parsed.evaluations || [])
          .filter((e: any) => e.decision === "reject")
          .map((e: any) => ({
            termId: e.termId || "",
            termName: e.termId || "",
            userProposal: e.userChange,
            baselinePosition: "",
            idealPosition: "",
            comparison: "below_baseline" as const,
            decision: "reject" as const,
            reasoning: e.reasoning,
            responseLanguage: e.responseToUser,
          })),
        responseMarkup: {
          insertions: (parsed.responseMarkup?.insertions || []).map((i: any) => ({
            text: i.text,
            context: i.location || "",
            rationale: i.comment || "",
          })),
          deletions: (parsed.responseMarkup?.deletions || []).map((d: any) => ({
            text: d.text,
            context: d.location || "",
            rationale: d.comment || "",
          })),
          comments: (parsed.responseMarkup?.comments || []).map((c: any) => ({
            text: c.comment,
            targetText: c.targetText || "",
          })),
        },
        emailSummary: parsed.emailResponse || "",
        dealProximity: parsed.dealStatus || "moderate",
      };

      emailResponse = parsed.emailResponse || "";
    } catch (parseError) {
      console.error("Failed to parse negotiation response:", parseError);

      // Return a default response
      negotiationResult = {
        overallAssessment: "Review in progress",
        termEvaluations: [],
        acceptedChanges: [],
        counteredChanges: [],
        rejectedChanges: [],
        responseMarkup: {
          insertions: [],
          deletions: [],
          comments: [],
        },
        emailSummary:
          "Thank you for your proposed revisions. We are reviewing them and will respond with our comments shortly.",
        dealProximity: "moderate",
      };

      emailResponse = negotiationResult.emailSummary;
    }

    return NextResponse.json({
      success: true,
      negotiationResult,
      emailResponse,
    });
  } catch (error) {
    console.error("Document negotiation API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to negotiate document" },
      { status: 500 }
    );
  }
}

/**
 * Generate a reasonable baseline from scenario context when no explicit baseline exists
 */
function generateDefaultBaselineFromScenario(
  scenario: NegotiationScenario
): string {
  return `=== INTERNAL BASELINE (AUTO-GENERATED FROM SCENARIO) ===

You are ${scenario.counterpartyRole} in this negotiation.
The user is ${scenario.userRole}.

SCENARIO CONTEXT:
${scenario.context}

USER'S STATED OBJECTIVES (use these to understand what they want - and resist appropriately):
${scenario.objectives.map((o) => `- ${o}`).join("\n")}

YOUR POSTURE: MODERATE
- Be willing to negotiate but protect your core interests
- Make the user work for concessions
- Don't reveal any minimum positions

GENERAL GUIDELINES:
- Protect revenue/value for your side
- Resist overly one-sided terms
- Accept reasonable middle-ground positions
- Counter aggressive positions with balanced alternatives
- Maintain professional relationships

Since no explicit baseline document was provided, use reasonable business judgment
to determine what positions to accept, counter, or reject based on the scenario context.

=== END BASELINE ===`;
}
