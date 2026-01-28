"use client";

import { ParsedDocumentData, TrackChange, DocumentComment, Footnote } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  FileText,
  Plus,
  Minus,
  MessageSquare,
  BookOpen,
  User,
  Calendar,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

interface DocumentViewerProps {
  document: ParsedDocumentData;
  title?: string;
}

function TrackChangeItem({ change }: { change: TrackChange }) {
  const isInsertion = change.type === "insertion";

  return (
    <div
      className={cn(
        "p-3 rounded-lg border",
        isInsertion
          ? "bg-green-50 border-green-200"
          : "bg-red-50 border-red-200"
      )}
    >
      <div className="flex items-start gap-2">
        <div
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
            isInsertion ? "bg-green-200" : "bg-red-200"
          )}
        >
          {isInsertion ? (
            <Plus className="w-4 h-4 text-green-700" />
          ) : (
            <Minus className="w-4 h-4 text-red-700" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <User className="w-3 h-3" />
            <span>{change.author}</span>
            {change.date && (
              <>
                <Calendar className="w-3 h-3 ml-2" />
                <span>{new Date(change.date).toLocaleDateString()}</span>
              </>
            )}
          </div>
          <div
            className={cn(
              "text-sm",
              isInsertion ? "text-green-800" : "text-red-800 line-through"
            )}
          >
            &ldquo;{change.text}&rdquo;
          </div>
          {change.context && (
            <div className="text-xs text-gray-400 mt-1 truncate">
              Context: ...{change.context}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CommentItem({ comment }: { comment: DocumentComment }) {
  return (
    <div className="p-3 rounded-lg border bg-yellow-50 border-yellow-200">
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-yellow-200 flex items-center justify-center shrink-0">
          <MessageSquare className="w-4 h-4 text-yellow-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <User className="w-3 h-3" />
            <span>{comment.author}</span>
            {comment.date && (
              <>
                <Calendar className="w-3 h-3 ml-2" />
                <span>{new Date(comment.date).toLocaleDateString()}</span>
              </>
            )}
          </div>
          <div className="text-sm text-yellow-800">{comment.text}</div>
          {comment.anchorText && (
            <div className="text-xs text-gray-400 mt-1 truncate">
              On: &ldquo;{comment.anchorText}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FootnoteItem({ footnote }: { footnote: Footnote }) {
  return (
    <div className="p-3 rounded-lg border bg-blue-50 border-blue-200">
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-blue-200 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-blue-700">{footnote.id}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-blue-800">{footnote.text}</div>
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (count === 0) return null;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-500" />
          <span className="font-medium text-gray-700">{title}</span>
          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
            {count}
          </span>
        </div>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {isOpen && <div className="p-3 space-y-2">{children}</div>}
    </div>
  );
}

export function DocumentViewer({ document, title }: DocumentViewerProps) {
  const insertions = document.trackChanges.filter((c) => c.type === "insertion");
  const deletions = document.trackChanges.filter((c) => c.type === "deletion");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b bg-white shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900 truncate">
            {title || document.metadata.title || "Document"}
          </h3>
        </div>
        {document.metadata.lastModifiedBy && (
          <p className="text-xs text-gray-500 mt-1">
            Last modified by: {document.metadata.lastModifiedBy}
          </p>
        )}
      </div>

      {/* Summary Stats */}
      <div className="p-4 border-b bg-gray-50 shrink-0">
        <div className="grid grid-cols-4 gap-3 text-center">
          <div className="bg-white rounded-lg p-2 border">
            <div className="text-lg font-bold text-green-600">
              {insertions.length}
            </div>
            <div className="text-xs text-gray-500">Insertions</div>
          </div>
          <div className="bg-white rounded-lg p-2 border">
            <div className="text-lg font-bold text-red-600">
              {deletions.length}
            </div>
            <div className="text-xs text-gray-500">Deletions</div>
          </div>
          <div className="bg-white rounded-lg p-2 border">
            <div className="text-lg font-bold text-yellow-600">
              {document.comments.length}
            </div>
            <div className="text-xs text-gray-500">Comments</div>
          </div>
          <div className="bg-white rounded-lg p-2 border">
            <div className="text-lg font-bold text-blue-600">
              {document.footnotes.length}
            </div>
            <div className="text-xs text-gray-500">Footnotes</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <CollapsibleSection
          title="Insertions"
          count={insertions.length}
          icon={Plus}
          defaultOpen={insertions.length <= 10}
        >
          {insertions.map((change, index) => (
            <TrackChangeItem key={`ins-${index}`} change={change} />
          ))}
        </CollapsibleSection>

        <CollapsibleSection
          title="Deletions"
          count={deletions.length}
          icon={Minus}
          defaultOpen={deletions.length <= 10}
        >
          {deletions.map((change, index) => (
            <TrackChangeItem key={`del-${index}`} change={change} />
          ))}
        </CollapsibleSection>

        <CollapsibleSection
          title="Comments"
          count={document.comments.length}
          icon={MessageSquare}
        >
          {document.comments.map((comment, index) => (
            <CommentItem key={`comment-${index}`} comment={comment} />
          ))}
        </CollapsibleSection>

        <CollapsibleSection
          title="Footnotes"
          count={document.footnotes.length}
          icon={BookOpen}
          defaultOpen={false}
        >
          {document.footnotes.map((footnote, index) => (
            <FootnoteItem key={`fn-${index}`} footnote={footnote} />
          ))}
        </CollapsibleSection>

        {document.trackChanges.length === 0 &&
          document.comments.length === 0 &&
          document.footnotes.length === 0 && (
            <div className="text-center text-gray-400 py-8">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No track changes, comments, or footnotes found</p>
            </div>
          )}
      </div>
    </div>
  );
}
