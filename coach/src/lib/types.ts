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
