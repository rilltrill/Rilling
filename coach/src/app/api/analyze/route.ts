import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { Email, NegotiationScenario, NegotiationAnalysis } from "@/lib/types";
import { getAnalysisSystemPrompt, buildEmailContext } from "@/lib/prompts";

const anthropic = new Anthropic();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scenario, emails } = body as {
      scenario: NegotiationScenario;
      emails: Email[];
    };

    if (!scenario || !emails || emails.length === 0) {
      return NextResponse.json(
        { error: "Missing scenario or emails" },
        { status: 400 }
      );
    }

    const systemPrompt = getAnalysisSystemPrompt();
    const emailContext = buildEmailContext(emails);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Analyze this negotiation:

SCENARIO: ${scenario.title}
USER ROLE: ${scenario.userRole}
COUNTERPARTY ROLE: ${scenario.counterpartyRole}

CONTEXT:
${scenario.context}

USER'S OBJECTIVES:
${scenario.objectives.map((o) => `- ${o}`).join("\n")}

EMAIL CONVERSATION:
${emailContext}

Provide your analysis in the specified JSON format.`,
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
    let analysis: NegotiationAnalysis;
    try {
      // Extract JSON from the response (it might be wrapped in markdown code blocks)
      const jsonMatch = responseContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Failed to parse analysis response:", parseError);
      // Return a default analysis if parsing fails
      analysis = {
        score: {
          overall: 50,
          categories: {
            persuasiveness: 50,
            clarity: 50,
            professionalism: 50,
            leverage: 50,
            strategy: 50,
          },
          trend: "stable",
        },
        points: [
          {
            type: "insight",
            title: "Analysis in Progress",
            description:
              "Continue the negotiation to receive detailed feedback.",
          },
        ],
        summary: "Negotiation is underway. Continue to receive detailed analysis.",
        userPosition: "Position being established",
        counterpartyPosition: "Position being evaluated",
        nextSteps: ["Continue the negotiation to receive more specific feedback"],
      };
    }

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error("Analyze API error:", error);
    return NextResponse.json(
      { error: "Failed to analyze negotiation" },
      { status: 500 }
    );
  }
}
