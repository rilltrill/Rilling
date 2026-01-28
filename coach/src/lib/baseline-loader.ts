/**
 * Baseline Document Loader
 *
 * This module handles loading baseline documents from various sources:
 * - JSON files
 * - Database (future)
 * - Programmatic registration
 *
 * In production, baselines would typically be stored in a database
 * and loaded based on scenario ID.
 */

import {
  BaselineDocument,
  TermDefinition,
  registerBaseline,
  loadBaselineDocument,
} from "./baseline-document";

/**
 * Load a baseline from a JSON object
 */
export function loadBaselineFromJson(json: any): BaselineDocument {
  // Validate required fields
  if (!json.id || !json.scenarioId || !json.name) {
    throw new Error("Baseline JSON missing required fields: id, scenarioId, name");
  }

  const baseline: BaselineDocument = {
    id: json.id,
    name: json.name,
    description: json.description || "",
    scenarioId: json.scenarioId,
    fullText: json.fullText,
    terms: (json.terms || []).map((t: any) => validateTerm(t)),
    posture: json.posture || "moderate",
    maxConcessionsPerRound: json.maxConcessionsPerRound || 2,
    dealBreakers: json.dealBreakers || [],
    negotiationGuidelines: json.negotiationGuidelines || "",
  };

  return baseline;
}

/**
 * Validate and normalize a term definition
 */
function validateTerm(term: any): TermDefinition {
  if (!term.id || !term.name || !term.baselineText) {
    throw new Error(`Term missing required fields: ${JSON.stringify(term)}`);
  }

  return {
    id: term.id,
    name: term.name,
    clause: term.clause || "General",
    baselineText: term.baselineText,
    idealText: term.idealText || term.baselineText,
    identifiers: term.identifiers || [term.name.toLowerCase()],
    priority: term.priority || "negotiable",
    termType: term.termType || "text",
    acceptableRange: term.acceptableRange,
    rationale: term.rationale || "",
    rejectionLanguage: term.rejectionLanguage,
    acceptanceLanguage: term.acceptanceLanguage,
  };
}

/**
 * Register a baseline document and make it available for scenarios
 */
export function registerBaselineDocument(baseline: BaselineDocument): void {
  registerBaseline(baseline);
}

/**
 * Load baseline from file path (server-side only)
 * In a real app, this would read from the filesystem or database
 */
export async function loadBaselineFromFile(filePath: string): Promise<BaselineDocument> {
  // This would be implemented with fs.readFile in a real server environment
  // For now, throw an error indicating this needs implementation
  throw new Error(
    `loadBaselineFromFile not implemented. Path: ${filePath}. ` +
    "Use registerBaselineDocument() to register baselines programmatically."
  );
}

/**
 * Example: How to create and register a baseline document
 *
 * This shows the structure for a software license negotiation baseline.
 * In production, this would be loaded from a database or file.
 */
export const EXAMPLE_SOFTWARE_LICENSE_BASELINE: BaselineDocument = {
  id: "baseline-software-license-001",
  name: "Software License Renewal Baseline",
  description: "Minimum acceptable terms for TechVendor in license renewal negotiation",
  scenarioId: "software-license",

  posture: "moderate",
  maxConcessionsPerRound: 2,

  terms: [
    {
      id: "price-increase",
      name: "Annual Price Increase",
      clause: "Pricing",
      baselineText: "Annual license fee of $172,500 (15% increase from current)",
      idealText: "Annual license fee of $210,000 (40% increase from current)",
      identifiers: ["price", "fee", "cost", "$", "annual", "license fee"],
      priority: "critical",
      termType: "numeric",
      acceptableRange: {
        min: 172500,
        max: 210000,
        unit: "$",
      },
      rationale:
        "We need at least 15% increase to cover rising infrastructure costs. " +
        "Below this, the account becomes unprofitable.",
      rejectionLanguage:
        "Given our increased infrastructure investments and the enhanced feature set, " +
        "we need to ensure the pricing reflects the value delivered.",
      acceptanceLanguage:
        "We appreciate your commitment to the partnership and can work with this pricing structure.",
    },
    {
      id: "term-length",
      name: "Contract Term",
      clause: "Term",
      baselineText: "Initial term of one (1) year",
      idealText: "Initial term of three (3) years",
      identifiers: ["term", "year", "years", "duration", "period"],
      priority: "important",
      termType: "duration",
      acceptableRange: {
        min: 1,
        max: 3,
        unit: "years",
      },
      rationale: "Longer terms provide revenue predictability. Minimum 1 year required.",
    },
    {
      id: "payment-terms",
      name: "Payment Terms",
      clause: "Payment",
      baselineText: "Payment due within thirty (30) days of invoice",
      idealText: "Payment due within fifteen (15) days of invoice",
      identifiers: ["payment", "invoice", "due", "days", "net"],
      priority: "negotiable",
      termType: "duration",
      acceptableRange: {
        min: 15,
        max: 45,
        unit: "days",
      },
      rationale: "Cash flow preference, but flexible up to Net 45.",
    },
    {
      id: "sla-uptime",
      name: "Uptime SLA",
      clause: "Service Levels",
      baselineText: "99.5% uptime guarantee",
      idealText: "99.0% uptime guarantee",
      identifiers: ["uptime", "availability", "sla", "%"],
      priority: "important",
      termType: "percentage",
      acceptableRange: {
        min: 99.0,
        max: 99.9,
        unit: "%",
      },
      rationale: "We can reliably deliver 99.5%. Higher commitments require premium pricing.",
    },
    {
      id: "liability-cap",
      name: "Liability Cap",
      clause: "Limitation of Liability",
      baselineText:
        "Total liability shall not exceed fees paid in the twelve (12) months preceding the claim",
      idealText:
        "Total liability shall not exceed fees paid in the three (3) months preceding the claim",
      identifiers: ["liability", "cap", "limit", "damages"],
      priority: "critical",
      termType: "text",
      rationale: "12-month cap is our floor. Cannot accept unlimited liability.",
      rejectionLanguage:
        "Our standard liability provisions reflect industry norms and allow us to " +
        "maintain competitive pricing.",
    },
    {
      id: "auto-renewal",
      name: "Auto-Renewal",
      clause: "Term",
      baselineText: "Contract shall automatically renew for successive one (1) year terms",
      idealText:
        "Contract shall automatically renew for successive one (1) year terms " +
        "unless terminated with ninety (90) days written notice",
      identifiers: ["renewal", "auto", "automatic", "renew"],
      priority: "negotiable",
      termType: "binary",
      rationale: "Auto-renewal preferred but not required.",
    },
  ],

  dealBreakers: ["price-increase", "liability-cap"],

  negotiationGuidelines: `
As TechVendor's representative, your goals are:

1. PROTECT PRICING: The 15% minimum increase is firm. We've already absorbed costs for 2 years.
   - If they push below $172,500, explain infrastructure investments
   - Offer multi-year rate locks as a concession for accepting our pricing

2. MAINTAIN LIABILITY LIMITS: The 12-month cap is non-negotiable.
   - This is standard in the industry
   - If they push, offer enhanced support or monitoring as alternatives

3. BE FLEXIBLE ON:
   - Payment terms (up to Net 45)
   - Contract duration (1-3 years)
   - Auto-renewal (can remove if they insist)

4. NEVER REVEAL:
   - That 15% is our minimum
   - That we've already approved this deal internally
   - Any internal cost structures

5. TRADING CONCESSIONS:
   - If accepting shorter payment terms, ask for longer contract
   - If accepting lower price, ask for longer term or upfront payment
   - Always get something in return for giving something
`,
};

/**
 * Initialize default baselines
 * Call this at app startup to register built-in baselines
 */
export function initializeDefaultBaselines(): void {
  // Register the example baseline
  registerBaseline(EXAMPLE_SOFTWARE_LICENSE_BASELINE);

  // Additional baselines would be registered here
  // registerBaseline(VENDOR_CONTRACT_BASELINE);
  // registerBaseline(SETTLEMENT_BASELINE);
}

/**
 * Check if a baseline exists for a scenario
 */
export function hasBaselineForScenario(scenarioId: string): boolean {
  return loadBaselineDocument(scenarioId) !== null;
}
