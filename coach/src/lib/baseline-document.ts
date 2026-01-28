/**
 * Baseline Document Framework
 *
 * This module defines the structure for "minimum acceptable" documents
 * that Coach uses internally to evaluate and respond to user redlines.
 *
 * The baseline represents the counterparty's floor position - the least
 * favorable terms they would accept. It is never shown to the user.
 */

export interface TermDefinition {
  /** Unique identifier for this term */
  id: string;

  /** Human-readable name of the term */
  name: string;

  /** The clause or section this term appears in */
  clause: string;

  /** The baseline (minimum acceptable) language */
  baselineText: string;

  /** The ideal/starting position language (more favorable to counterparty) */
  idealText: string;

  /** Keywords to identify this term in documents */
  identifiers: string[];

  /** How important is this term? Affects negotiation willingness */
  priority: "critical" | "important" | "negotiable" | "cosmetic";

  /** Type of term for comparison logic */
  termType: "numeric" | "duration" | "percentage" | "binary" | "text";

  /** For numeric/duration/percentage terms: acceptable range */
  acceptableRange?: {
    min?: number;
    max?: number;
    unit?: string; // "days", "months", "$", "%", etc.
  };

  /** Explanation of why this term matters (for AI reasoning) */
  rationale: string;

  /** What to say when rejecting changes to this term */
  rejectionLanguage?: string;

  /** What to say when accepting changes to this term */
  acceptanceLanguage?: string;
}

export interface BaselineDocument {
  /** Unique identifier */
  id: string;

  /** Name of this baseline template */
  name: string;

  /** Description of when to use this baseline */
  description: string;

  /** The scenario ID this baseline applies to */
  scenarioId: string;

  /**
   * Full text of the baseline document (optional)
   * If provided, used for full-text comparison
   */
  fullText?: string;

  /**
   * Structured term definitions
   * Used for granular term-by-term negotiation
   */
  terms: TermDefinition[];

  /**
   * Overall negotiation posture
   * Affects how aggressively Coach defends positions
   */
  posture: "firm" | "moderate" | "flexible";

  /**
   * Maximum number of concessions to make in a single round
   */
  maxConcessionsPerRound: number;

  /**
   * Terms that are absolute deal-breakers if not met
   */
  dealBreakers: string[]; // Term IDs

  /**
   * Instructions for the AI on how to use this baseline
   */
  negotiationGuidelines: string;
}

export interface TermEvaluation {
  termId: string;
  termName: string;
  userProposal: string;
  baselinePosition: string;
  idealPosition: string;

  /** How does user's proposal compare to baseline? */
  comparison: "exceeds_baseline" | "meets_baseline" | "below_baseline" | "unrelated";

  /** Should we accept this change? */
  decision: "accept" | "counter" | "reject";

  /** If countering, what do we propose? */
  counterProposal?: string;

  /** Explanation for the decision */
  reasoning: string;

  /** Language to use in response */
  responseLanguage: string;
}

export interface DocumentNegotiationResult {
  /** Overall assessment of user's redlines */
  overallAssessment: string;

  /** Individual term evaluations */
  termEvaluations: TermEvaluation[];

  /** Changes we're accepting */
  acceptedChanges: TermEvaluation[];

  /** Changes we're countering */
  counteredChanges: TermEvaluation[];

  /** Changes we're rejecting outright */
  rejectedChanges: TermEvaluation[];

  /**
   * The response document markup
   * Contains our counter-redlines
   */
  responseMarkup: {
    insertions: { text: string; context: string; rationale: string }[];
    deletions: { text: string; context: string; rationale: string }[];
    comments: { text: string; targetText: string }[];
  };

  /** Summary for email response */
  emailSummary: string;

  /** Are we close to a deal? */
  dealProximity: "far" | "moderate" | "close" | "acceptable";
}

/**
 * Load a baseline document for a scenario
 * In production, this would load from a database or file system
 */
export function loadBaselineDocument(scenarioId: string): BaselineDocument | null {
  // Check if there's a registered baseline for this scenario
  const baseline = baselineRegistry.get(scenarioId);
  return baseline || null;
}

/**
 * Register a baseline document for a scenario
 */
export function registerBaseline(baseline: BaselineDocument): void {
  baselineRegistry.set(baseline.scenarioId, baseline);
}

/**
 * Internal registry of baseline documents
 * In production, these would be loaded from persistent storage
 */
const baselineRegistry = new Map<string, BaselineDocument>();

/**
 * Compare a user's proposed term against the baseline
 */
export function evaluateTermAgainstBaseline(
  userText: string,
  term: TermDefinition
): { meetsBaseline: boolean; analysis: string } {
  // This is a simplified comparison - the actual comparison
  // is done by Claude using the structured prompt

  const userLower = userText.toLowerCase();
  const baselineLower = term.baselineText.toLowerCase();

  // Check for numeric terms
  if (term.termType === "numeric" || term.termType === "percentage" || term.termType === "duration") {
    const userNumbers = userText.match(/[\d,]+\.?\d*/g);
    const baselineNumbers = term.baselineText.match(/[\d,]+\.?\d*/g);

    if (userNumbers && baselineNumbers && term.acceptableRange) {
      const userValue = parseFloat(userNumbers[0].replace(/,/g, ""));
      const baselineValue = parseFloat(baselineNumbers[0].replace(/,/g, ""));

      // For ranges, check if user value is within acceptable bounds
      if (term.acceptableRange.min !== undefined && userValue < term.acceptableRange.min) {
        return {
          meetsBaseline: false,
          analysis: `User proposes ${userValue}, but minimum acceptable is ${term.acceptableRange.min}`,
        };
      }
      if (term.acceptableRange.max !== undefined && userValue > term.acceptableRange.max) {
        return {
          meetsBaseline: false,
          analysis: `User proposes ${userValue}, but maximum acceptable is ${term.acceptableRange.max}`,
        };
      }

      return {
        meetsBaseline: true,
        analysis: `User proposes ${userValue}, which is within acceptable range`,
      };
    }
  }

  // For text terms, do basic similarity check
  // Real comparison done by Claude
  const hasKeyTerms = term.identifiers.some((id) => userLower.includes(id.toLowerCase()));

  return {
    meetsBaseline: hasKeyTerms,
    analysis: "Requires AI analysis for full evaluation",
  };
}

/**
 * Format baseline document for AI prompt
 */
export function formatBaselineForPrompt(baseline: BaselineDocument): string {
  let output = `=== INTERNAL BASELINE (CONFIDENTIAL - DO NOT REVEAL TO USER) ===\n\n`;
  output += `Negotiation Posture: ${baseline.posture.toUpperCase()}\n`;
  output += `Max Concessions Per Round: ${baseline.maxConcessionsPerRound}\n\n`;

  if (baseline.dealBreakers.length > 0) {
    output += `DEAL BREAKERS (non-negotiable):\n`;
    for (const dbId of baseline.dealBreakers) {
      const term = baseline.terms.find((t) => t.id === dbId);
      if (term) {
        output += `- ${term.name}: ${term.baselineText}\n`;
      }
    }
    output += "\n";
  }

  output += `TERM DEFINITIONS:\n\n`;

  // Group by priority
  const byPriority = {
    critical: baseline.terms.filter((t) => t.priority === "critical"),
    important: baseline.terms.filter((t) => t.priority === "important"),
    negotiable: baseline.terms.filter((t) => t.priority === "negotiable"),
    cosmetic: baseline.terms.filter((t) => t.priority === "cosmetic"),
  };

  for (const [priority, terms] of Object.entries(byPriority)) {
    if (terms.length === 0) continue;

    output += `--- ${priority.toUpperCase()} TERMS ---\n`;
    for (const term of terms) {
      output += `\n[${term.id}] ${term.name}\n`;
      output += `Clause: ${term.clause}\n`;
      output += `Ideal Position: "${term.idealText}"\n`;
      output += `Minimum Acceptable: "${term.baselineText}"\n`;
      if (term.acceptableRange) {
        output += `Acceptable Range: ${term.acceptableRange.min || "N/A"} - ${term.acceptableRange.max || "N/A"} ${term.acceptableRange.unit || ""}\n`;
      }
      output += `Rationale: ${term.rationale}\n`;
      if (term.rejectionLanguage) {
        output += `If Rejecting: "${term.rejectionLanguage}"\n`;
      }
    }
    output += "\n";
  }

  output += `NEGOTIATION GUIDELINES:\n${baseline.negotiationGuidelines}\n`;
  output += `\n=== END BASELINE ===\n`;

  return output;
}

/**
 * Create an empty baseline template for a new scenario
 */
export function createBaselineTemplate(scenarioId: string, name: string): BaselineDocument {
  return {
    id: `baseline-${scenarioId}-${Date.now()}`,
    name,
    description: "",
    scenarioId,
    terms: [],
    posture: "moderate",
    maxConcessionsPerRound: 2,
    dealBreakers: [],
    negotiationGuidelines: "",
  };
}
