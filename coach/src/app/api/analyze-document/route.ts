import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { NegotiationScenario, ParsedDocumentData, DocumentAnalysis } from "@/lib/types";
import { getDocumentAnalysisPrompt } from "@/lib/prompts";
import { formatDocumentForAnalysis } from "@/lib/document-parser";

const anthropic = new Anthropic();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scenario, document, previousVersions } = body as {
      scenario: NegotiationScenario;
      document: ParsedDocumentData;
      previousVersions?: ParsedDocumentData[];
    };

    if (!scenario || !document) {
      return NextResponse.json(
        { error: "Missing scenario or document" },
        { status: 400 }
      );
    }

    const systemPrompt = getDocumentAnalysisPrompt();
    const documentContext = formatDocumentForAnalysis(document);

    // Build comparison context if previous versions exist
    let comparisonContext = "";
    if (previousVersions && previousVersions.length > 0) {
      comparisonContext = "\n\n=== PREVIOUS VERSION(S) FOR COMPARISON ===\n";
      for (let i = 0; i < previousVersions.length; i++) {
        comparisonContext += `\n--- Version ${i + 1} ---\n`;
        comparisonContext += formatDocumentForAnalysis(previousVersions[i]);
      }
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Analyze this contract markup from a negotiation:

SCENARIO: ${scenario.title}
USER ROLE: ${scenario.userRole}
COUNTERPARTY ROLE: ${scenario.counterpartyRole}

CONTEXT:
${scenario.context}

USER'S OBJECTIVES:
${scenario.objectives.map((o) => `- ${o}`).join("\n")}

=== DOCUMENT WITH MARKUP ===
${documentContext}
${comparisonContext}

Analyze the markup and provide your assessment in the specified JSON format.`,
        },
      ],
    });

    const responseContent = message.content[0];
    if (responseContent.type !== "text") {
      return NextResponse.json(
        { error: "Unexpected response type" },
        { status: 500 }
      );
    }

    // Parse the JSON response
    let analysis: DocumentAnalysis;
    try {
      const jsonMatch = responseContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Failed to parse document analysis response:", parseError);
      // Return a default analysis if parsing fails
      analysis = {
        substantiveChanges: [],
        commentResponses: [],
        overallAssessment: "Analysis in progress. The document markup is being evaluated.",
        riskAreas: [],
        negotiationAdvice: ["Continue reviewing the document markup"],
      };
    }

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error("Document analysis API error:", error);
    return NextResponse.json(
      { error: "Failed to analyze document" },
      { status: 500 }
    );
  }
}
