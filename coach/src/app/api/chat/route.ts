import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { Email, NegotiationScenario } from "@/lib/types";
import { getCounterpartySystemPrompt, buildEmailContext } from "@/lib/prompts";

const anthropic = new Anthropic();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scenario, emails } = body as {
      scenario: NegotiationScenario;
      emails: Email[];
    };

    if (!scenario || !emails) {
      return NextResponse.json(
        { error: "Missing scenario or emails" },
        { status: 400 }
      );
    }

    const systemPrompt = getCounterpartySystemPrompt(scenario);
    const emailContext = buildEmailContext(emails);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Here is the email conversation so far:\n\n${emailContext}\n\nPlease respond as ${scenario.counterpartyRole} with your next email in this negotiation. Write only the email body.`,
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

    return NextResponse.json({
      response: responseContent.text,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}
