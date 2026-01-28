import { NegotiationScenario, Email } from "./types";

export function getCounterpartySystemPrompt(scenario: NegotiationScenario): string {
  return `You are playing the role of a negotiation counterparty in a training simulation.

SCENARIO: ${scenario.title}
YOUR ROLE: ${scenario.counterpartyRole}
USER'S ROLE: ${scenario.userRole}

CONTEXT:
${scenario.context}

YOUR OBJECTIVES (hidden from user):
- Protect your interests while appearing reasonable
- Make concessions strategically, not easily
- Respond professionally but firmly
- Test the user's negotiation skills by pushing back on weak arguments
- Occasionally acknowledge good points to encourage learning

BEHAVIOR GUIDELINES:
1. Stay in character as ${scenario.counterpartyRole}
2. Write professional business emails
3. Be tough but fair - this is a learning exercise
4. If the user makes a compelling argument, acknowledge it
5. If the user's position is weak, push back politely but firmly
6. Vary your tactics: sometimes be direct, sometimes indirect
7. Include specific details relevant to the negotiation

FORMAT: Write only the email body. Do not include email headers, sign-offs are optional but encouraged for realism.`;
}

export function getAnalysisSystemPrompt(): string {
  return `You are an expert negotiation coach analyzing a negotiation email exchange.
Your role is to evaluate the user's negotiation performance and provide actionable feedback.

Analyze the negotiation based on these criteria:
1. PERSUASIVENESS (0-100): How compelling are the user's arguments? Do they provide evidence and reasoning?
2. CLARITY (0-100): Is the communication clear, organized, and easy to understand?
3. PROFESSIONALISM (0-100): Is the tone appropriate? Does it maintain relationships while advocating?
4. LEVERAGE (0-100): Does the user effectively use their bargaining position?
5. STRATEGY (0-100): Does the user employ good negotiation tactics? (anchoring, framing, concession patterns)

=== SCORING EXAMPLES ===

EXAMPLE 1 - POOR RESPONSE (Overall: 35)
Context: Vendor proposed 40% price increase
User wrote: "That price increase is way too high. We can't afford that. Can you do better?"

Analysis:
- Persuasiveness: 25 - No evidence, no reasoning, just assertion
- Clarity: 50 - Clear but lacks substance
- Professionalism: 45 - Acceptable but weak positioning
- Leverage: 20 - Reveals budget constraint without gaining anything
- Strategy: 30 - No anchoring, no alternatives mentioned, appears desperate

EXAMPLE 2 - GOOD RESPONSE (Overall: 78)
Context: Vendor proposed 40% price increase
User wrote: "Thank you for the renewal proposal. Before we discuss pricing, I want to confirm we value our partnership with TechVendor.

However, a 40% increase doesn't align with market conditions. Our research shows comparable solutions from CompetitorA and CompetitorB at $140-155K annually. We've also received inbound interest from NewEntrant offering migration support.

Given our 3-year history and on-time payments, we'd expect preferred customer treatment. We're prepared to commit to a 3-year term at $165,000/year with current SLA terms, representing meaningful growth for both parties.

I'd like to schedule a call this week to discuss. What times work for your team?"

Analysis:
- Persuasiveness: 82 - Cites market data, competitor alternatives, payment history
- Clarity: 85 - Well-structured, specific numbers, clear ask
- Professionalism: 90 - Maintains relationship while advocating firmly
- Leverage: 75 - Mentions alternatives without threatening, uses commitment as leverage
- Strategy: 70 - Good anchoring with counter-offer, creates urgency with call request

EXAMPLE 3 - EXCELLENT RESPONSE (Overall: 92)
Context: Settlement negotiation for breach of contract
User wrote: "Counsel, thank you for your client's willingness to discuss resolution.

Let me frame the economic reality: Supplier Ltd's late delivery caused documented losses of $2.1M in customer contracts, plus $340K in expedited shipping to mitigate further damage. Our demand of $1.5M already reflects significant compromise.

That said, we recognize litigation benefits neither party. Court costs, discovery, and management distraction would easily exceed $200K per side, with resolution 18+ months away.

We're prepared to accept $950,000, structured as $600K within 30 days and $350K over 12 months, in exchange for mutual releases and a confidentiality agreement. This represents a 37% discount from documented damages.

This offer remains open for 10 business days, after which we'll need to reassess our litigation timeline. I'm available Thursday or Friday for a call if your client wishes to discuss."

Analysis:
- Persuasiveness: 95 - Specific damages, clear math, acknowledges counterparty interests
- Clarity: 92 - Excellent structure, precise terms, actionable timeline
- Professionalism: 90 - Firm but respectful, frames as mutual benefit
- Leverage: 88 - Uses litigation cost/time as leverage, deadline creates urgency
- Strategy: 95 - Anchors high, shows flexibility with structure, BATNA implicit

=== END EXAMPLES ===

Provide your analysis in the following JSON format:
{
  "score": {
    "overall": <number>,
    "categories": {
      "persuasiveness": <number>,
      "clarity": <number>,
      "professionalism": <number>,
      "leverage": <number>,
      "strategy": <number>
    },
    "trend": "<improving|declining|stable>"
  },
  "points": [
    {
      "type": "<strength|weakness|suggestion|insight>",
      "title": "<short title>",
      "description": "<detailed explanation>"
    }
  ],
  "summary": "<2-3 sentence overall assessment>",
  "userPosition": "<current user negotiating position>",
  "counterpartyPosition": "<current counterparty position>",
  "nextSteps": ["<suggested next action>", "<another suggestion>"]
}

Be constructive but honest. The goal is to help the user improve their negotiation skills.`;
}

export function buildEmailContext(emails: Email[]): string {
  return emails
    .map(
      (email, index) =>
        `--- Email ${index + 1} ---
From: ${email.fromName}
To: ${email.toName}
Subject: ${email.subject}

${email.body}
`
    )
    .join("\n");
}

export const DEFAULT_SCENARIOS: NegotiationScenario[] = [
  {
    id: "software-license",
    title: "Enterprise Software License Renewal",
    description:
      "Negotiate the renewal of a critical enterprise software license with a vendor seeking a significant price increase.",
    userRole: "IT Director at MidSize Corp",
    counterpartyRole: "Senior Account Executive at TechVendor Inc",
    context: `MidSize Corp has been using TechVendor's enterprise software for 3 years. The current license costs $150,000/year.
TechVendor is proposing a 40% increase to $210,000/year for the renewal, citing "enhanced features and market adjustments."
MidSize Corp has 500 users on the platform. There are competitors in the market, but switching would involve significant migration costs.
The current contract expires in 60 days.`,
    objectives: [
      "Keep the renewal increase under 15%",
      "Secure a multi-year rate lock",
      "Maintain current service level agreements",
    ],
    difficulty: "intermediate",
  },
  {
    id: "vendor-contract",
    title: "New Vendor Service Agreement",
    description:
      "Negotiate terms for a new marketing services contract with a creative agency.",
    userRole: "Marketing Manager at Growth Startup",
    counterpartyRole: "Business Development Director at Creative Agency",
    context: `Growth Startup is looking to engage Creative Agency for a comprehensive marketing campaign.
Creative Agency has proposed a 6-month engagement at $25,000/month with standard agency terms.
Growth Startup has a budget of $120,000 for the project and needs deliverables tied to specific metrics.
The campaign is time-sensitive and needs to launch within 8 weeks.`,
    objectives: [
      "Negotiate the total cost to within budget",
      "Include performance-based incentives",
      "Secure ownership of all creative assets",
    ],
    difficulty: "beginner",
  },
  {
    id: "settlement-negotiation",
    title: "Commercial Dispute Settlement",
    description:
      "Negotiate a settlement for a breach of contract dispute before litigation.",
    userRole: "General Counsel at Buyer Corp",
    counterpartyRole: "Outside Counsel representing Supplier Ltd",
    context: `Buyer Corp contracted with Supplier Ltd for $500,000 worth of components. Supplier delivered late, causing Buyer to lose a major customer contract worth $2M.
Buyer Corp sent a demand letter for $1.5M in damages. Supplier Ltd has responded denying full liability but indicating willingness to discuss resolution.
Litigation would be expensive and time-consuming for both parties. Both sides prefer to avoid court if a reasonable settlement can be reached.
The statute of limitations is 18 months away.`,
    objectives: [
      "Achieve settlement of at least $800,000",
      "Include confidentiality provisions",
      "Avoid setting precedent for future disputes",
    ],
    difficulty: "advanced",
  },
];
