import JSZip from "jszip";
import { parseStringPromise } from "xml2js";

export interface TrackChange {
  id: string;
  type: "insertion" | "deletion";
  author: string;
  date: string;
  text: string;
  context?: string; // surrounding text for context
}

export interface DocumentComment {
  id: string;
  author: string;
  date: string;
  text: string;
  anchorText?: string; // the text the comment is attached to
}

export interface Footnote {
  id: string;
  text: string;
}

export interface ParsedDocument {
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

export interface DocumentComparison {
  original: ParsedDocument;
  revised: ParsedDocument;
  summary: {
    totalInsertions: number;
    totalDeletions: number;
    totalComments: number;
    netWordChange: number;
  };
}

// Helper to extract text from Word XML nodes
function extractText(node: any): string {
  if (!node) return "";

  if (typeof node === "string") return node;

  if (Array.isArray(node)) {
    return node.map(extractText).join("");
  }

  // Handle text nodes
  if (node["w:t"]) {
    const textNodes = Array.isArray(node["w:t"]) ? node["w:t"] : [node["w:t"]];
    return textNodes
      .map((t: any) => (typeof t === "string" ? t : t._ || t))
      .join("");
  }

  // Handle run nodes
  if (node["w:r"]) {
    const runs = Array.isArray(node["w:r"]) ? node["w:r"] : [node["w:r"]];
    return runs.map(extractText).join("");
  }

  // Recurse into child nodes
  let text = "";
  for (const key of Object.keys(node)) {
    if (key !== "$" && typeof node[key] === "object") {
      text += extractText(node[key]);
    }
  }

  return text;
}

// Extract text content preserving some structure
function extractParagraphText(para: any): string {
  return extractText(para);
}

// Parse track changes from document XML
function parseTrackChanges(documentXml: any): TrackChange[] {
  const changes: TrackChange[] = [];

  function findChanges(node: any, context: string = "") {
    if (!node || typeof node !== "object") return;

    // Handle insertions
    if (node["w:ins"]) {
      const insertions = Array.isArray(node["w:ins"]) ? node["w:ins"] : [node["w:ins"]];
      for (const ins of insertions) {
        const attrs = ins.$ || {};
        changes.push({
          id: attrs["w:id"] || `ins-${changes.length}`,
          type: "insertion",
          author: attrs["w:author"] || "Unknown",
          date: attrs["w:date"] || "",
          text: extractText(ins),
          context: context.slice(-100), // last 100 chars of context
        });
      }
    }

    // Handle deletions
    if (node["w:del"]) {
      const deletions = Array.isArray(node["w:del"]) ? node["w:del"] : [node["w:del"]];
      for (const del of deletions) {
        const attrs = del.$ || {};
        // Deleted text is in w:delText
        let deletedText = "";
        if (del["w:r"]) {
          const runs = Array.isArray(del["w:r"]) ? del["w:r"] : [del["w:r"]];
          for (const run of runs) {
            if (run["w:delText"]) {
              const delTexts = Array.isArray(run["w:delText"]) ? run["w:delText"] : [run["w:delText"]];
              deletedText += delTexts.map((t: any) => (typeof t === "string" ? t : t._ || "")).join("");
            }
          }
        }
        changes.push({
          id: attrs["w:id"] || `del-${changes.length}`,
          type: "deletion",
          author: attrs["w:author"] || "Unknown",
          date: attrs["w:date"] || "",
          text: deletedText || extractText(del),
          context: context.slice(-100),
        });
      }
    }

    // Recurse
    for (const key of Object.keys(node)) {
      if (key !== "$" && typeof node[key] === "object") {
        const newContext = context + extractText(node[key]).slice(0, 50);
        findChanges(node[key], newContext);
      }
    }
  }

  findChanges(documentXml);
  return changes;
}

// Parse comments from comments.xml
async function parseComments(commentsXml: string | null): Promise<DocumentComment[]> {
  if (!commentsXml) return [];

  const comments: DocumentComment[] = [];

  try {
    const parsed = await parseStringPromise(commentsXml);
    const commentNodes = parsed?.["w:comments"]?.["w:comment"] || [];
    const commentsArray = Array.isArray(commentNodes) ? commentNodes : [commentNodes];

    for (const comment of commentsArray) {
      if (!comment) continue;
      const attrs = comment.$ || {};
      comments.push({
        id: attrs["w:id"] || `comment-${comments.length}`,
        author: attrs["w:author"] || "Unknown",
        date: attrs["w:date"] || "",
        text: extractText(comment),
      });
    }
  } catch (e) {
    console.error("Error parsing comments:", e);
  }

  return comments;
}

// Parse footnotes from footnotes.xml
async function parseFootnotes(footnotesXml: string | null): Promise<Footnote[]> {
  if (!footnotesXml) return [];

  const footnotes: Footnote[] = [];

  try {
    const parsed = await parseStringPromise(footnotesXml);
    const footnoteNodes = parsed?.["w:footnotes"]?.["w:footnote"] || [];
    const footnotesArray = Array.isArray(footnoteNodes) ? footnoteNodes : [footnoteNodes];

    for (const footnote of footnotesArray) {
      if (!footnote) continue;
      const attrs = footnote.$ || {};
      const id = attrs["w:id"];

      // Skip separator and continuation separator footnotes (id 0 and -1)
      if (id === "0" || id === "-1") continue;

      footnotes.push({
        id: id || `fn-${footnotes.length}`,
        text: extractText(footnote),
      });
    }
  } catch (e) {
    console.error("Error parsing footnotes:", e);
  }

  return footnotes;
}

// Parse document metadata from core.xml
async function parseMetadata(coreXml: string | null): Promise<ParsedDocument["metadata"]> {
  if (!coreXml) return {};

  try {
    const parsed = await parseStringPromise(coreXml);
    const props = parsed?.["cp:coreProperties"] || {};

    return {
      title: props["dc:title"]?.[0] || undefined,
      author: props["dc:creator"]?.[0] || undefined,
      lastModifiedBy: props["cp:lastModifiedBy"]?.[0] || undefined,
      created: props["dcterms:created"]?.[0]?._ || props["dcterms:created"]?.[0] || undefined,
      modified: props["dcterms:modified"]?.[0]?._ || props["dcterms:modified"]?.[0] || undefined,
    };
  } catch (e) {
    console.error("Error parsing metadata:", e);
    return {};
  }
}

// Extract full text from document
function extractFullText(documentXml: any): string {
  const paragraphs: string[] = [];

  function findParagraphs(node: any) {
    if (!node || typeof node !== "object") return;

    if (node["w:p"]) {
      const paras = Array.isArray(node["w:p"]) ? node["w:p"] : [node["w:p"]];
      for (const para of paras) {
        const text = extractParagraphText(para).trim();
        if (text) paragraphs.push(text);
      }
    }

    for (const key of Object.keys(node)) {
      if (key !== "$" && key !== "w:p" && typeof node[key] === "object") {
        findParagraphs(node[key]);
      }
    }
  }

  findParagraphs(documentXml);
  return paragraphs.join("\n\n");
}

/**
 * Parse a .docx file and extract track changes, comments, footnotes, and metadata
 */
export async function parseDocx(fileBuffer: ArrayBuffer): Promise<ParsedDocument> {
  const zip = await JSZip.loadAsync(fileBuffer);

  // Read main document
  const documentXmlStr = await zip.file("word/document.xml")?.async("string");
  if (!documentXmlStr) {
    throw new Error("Invalid .docx file: missing document.xml");
  }

  const documentXml = await parseStringPromise(documentXmlStr);

  // Read optional files
  const commentsXml = await zip.file("word/comments.xml")?.async("string") || null;
  const footnotesXml = await zip.file("word/footnotes.xml")?.async("string") || null;
  const coreXml = await zip.file("docProps/core.xml")?.async("string") || null;

  // Parse all components
  const [comments, footnotes, metadata] = await Promise.all([
    parseComments(commentsXml),
    parseFootnotes(footnotesXml),
    parseMetadata(coreXml),
  ]);

  const trackChanges = parseTrackChanges(documentXml);
  const fullText = extractFullText(documentXml);

  return {
    fullText,
    trackChanges,
    comments,
    footnotes,
    metadata,
  };
}

/**
 * Compare two parsed documents and generate a summary
 */
export function compareDocuments(
  original: ParsedDocument,
  revised: ParsedDocument
): DocumentComparison {
  const insertionWords = revised.trackChanges
    .filter((c) => c.type === "insertion")
    .reduce((sum, c) => sum + c.text.split(/\s+/).filter(Boolean).length, 0);

  const deletionWords = revised.trackChanges
    .filter((c) => c.type === "deletion")
    .reduce((sum, c) => sum + c.text.split(/\s+/).filter(Boolean).length, 0);

  return {
    original,
    revised,
    summary: {
      totalInsertions: revised.trackChanges.filter((c) => c.type === "insertion").length,
      totalDeletions: revised.trackChanges.filter((c) => c.type === "deletion").length,
      totalComments: revised.comments.length,
      netWordChange: insertionWords - deletionWords,
    },
  };
}

/**
 * Format parsed document for AI analysis
 */
export function formatDocumentForAnalysis(doc: ParsedDocument): string {
  let output = "";

  // Document info
  if (doc.metadata.title) {
    output += `DOCUMENT: ${doc.metadata.title}\n`;
  }
  if (doc.metadata.lastModifiedBy) {
    output += `Last modified by: ${doc.metadata.lastModifiedBy}\n`;
  }
  if (doc.metadata.modified) {
    output += `Modified: ${doc.metadata.modified}\n`;
  }
  output += "\n";

  // Track changes summary
  if (doc.trackChanges.length > 0) {
    output += "=== TRACK CHANGES ===\n\n";

    const insertions = doc.trackChanges.filter((c) => c.type === "insertion");
    const deletions = doc.trackChanges.filter((c) => c.type === "deletion");

    output += `Total: ${insertions.length} insertions, ${deletions.length} deletions\n\n`;

    // Group by author
    const byAuthor = new Map<string, TrackChange[]>();
    for (const change of doc.trackChanges) {
      const existing = byAuthor.get(change.author) || [];
      existing.push(change);
      byAuthor.set(change.author, existing);
    }

    for (const [author, changes] of byAuthor) {
      output += `--- Changes by ${author} ---\n`;
      for (const change of changes) {
        const prefix = change.type === "insertion" ? "[+]" : "[-]";
        output += `${prefix} "${change.text}"\n`;
      }
      output += "\n";
    }
  }

  // Comments
  if (doc.comments.length > 0) {
    output += "=== COMMENTS ===\n\n";
    for (const comment of doc.comments) {
      output += `[${comment.author}]: "${comment.text}"\n`;
    }
    output += "\n";
  }

  // Footnotes
  if (doc.footnotes.length > 0) {
    output += "=== FOOTNOTES ===\n\n";
    for (const footnote of doc.footnotes) {
      output += `[${footnote.id}]: ${footnote.text}\n`;
    }
    output += "\n";
  }

  // Full text (truncated for context)
  output += "=== DOCUMENT TEXT (excerpt) ===\n\n";
  output += doc.fullText.slice(0, 3000);
  if (doc.fullText.length > 3000) {
    output += "\n... [truncated] ...";
  }

  return output;
}

/**
 * Analyze changes for negotiation impact
 */
export function categorizeChanges(doc: ParsedDocument): {
  substantive: TrackChange[];
  procedural: TrackChange[];
  stylistic: TrackChange[];
} {
  // Keywords that suggest substantive vs procedural changes
  const substantiveKeywords = [
    "shall", "must", "warrant", "indemnif", "liabil", "damages", "terminat",
    "breach", "default", "remedy", "cure", "notice", "payment", "price",
    "fee", "cost", "rate", "$", "percent", "%", "days", "months", "years",
    "exclusive", "non-exclusive", "perpetual", "irrevocable", "assign",
    "confidential", "intellectual property", "ip", "ownership", "license"
  ];

  const proceduralKeywords = [
    "notice", "address", "deliver", "email", "written", "business day",
    "governing law", "jurisdiction", "venue", "arbitrat", "mediat",
    "waiv", "amendment", "modification", "entire agreement", "counterpart"
  ];

  const substantive: TrackChange[] = [];
  const procedural: TrackChange[] = [];
  const stylistic: TrackChange[] = [];

  for (const change of doc.trackChanges) {
    const textLower = change.text.toLowerCase();

    if (substantiveKeywords.some(kw => textLower.includes(kw))) {
      substantive.push(change);
    } else if (proceduralKeywords.some(kw => textLower.includes(kw))) {
      procedural.push(change);
    } else {
      stylistic.push(change);
    }
  }

  return { substantive, procedural, stylistic };
}
