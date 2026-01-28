export interface Email {
  id: string;
  from: "user" | "counterparty";
  fromName: string;
  toName: string;
  subject: string;
  body: string;
  timestamp: Date;
  attachments?: Attachment[];
}

export interface Attachment {
  id: string;
  name: string;
  type: "contract" | "document" | "markup";
  content: string;
  parsedDocument?: ParsedDocumentData;
}

// Document parsing types (matching document-parser.ts)
export interface TrackChange {
  id: string;
  type: "insertion" | "deletion";
  author: string;
  date: string;
  text: string;
  context?: string;
}

export interface DocumentComment {
  id: string;
  author: string;
  date: string;
  text: string;
  anchorText?: string;
}

export interface Footnote {
  id: string;
  text: string;
}

export interface ParsedDocumentData {
  fullText: string;
  trackChanges: TrackChange[];
  comments: DocumentComment[];
  footnotes: Footnote[];
  metadata: {
    title?: string;
    author?: string;
    lastModifiedBy?: string;
    created?: string;
    modified?: string;
  };
}

export interface DocumentAnalysis {
  substantiveChanges: {
    change: TrackChange;
    impact: "favorable" | "unfavorable" | "neutral";
    explanation: string;
  }[];
  commentResponses: {
    comment: DocumentComment;
    suggestedResponse: string;
  }[];
  overallAssessment: string;
  riskAreas: string[];
  negotiationAdvice: string[];
  scores?: {
    substantiveQuality: number;
    strategicThinking: number;
    draftingQuality: number;
    commentEffectiveness: number;
    overall: number;
  };
}

export interface NegotiationScore {
  overall: number; // 0-100
  categories: {
    persuasiveness: number;
    clarity: number;
    professionalism: number;
    leverage: number;
    strategy: number;
  };
  trend: "improving" | "declining" | "stable";
}

export interface AnalysisPoint {
  type: "strength" | "weakness" | "suggestion" | "insight";
  title: string;
  description: string;
  emailId?: string;
}

export interface NegotiationAnalysis {
  score: NegotiationScore;
  points: AnalysisPoint[];
  summary: string;
  userPosition: string;
  counterpartyPosition: string;
  nextSteps: string[];
}

export interface NegotiationScenario {
  id: string;
  title: string;
  description: string;
  userRole: string;
  counterpartyRole: string;
  context: string;
  objectives: string[];
  initialEmail?: Email;
  difficulty: "beginner" | "intermediate" | "advanced";
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationState {
  scenario: NegotiationScenario | null;
  emails: Email[];
  analysis: NegotiationAnalysis | null;
  isLoading: boolean;
}
