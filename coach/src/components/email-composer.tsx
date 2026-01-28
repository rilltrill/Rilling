"use client";

import { useState, useRef } from "react";
import { Send, Loader2, Paperclip, X, FileText, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ParsedDocumentData } from "@/lib/types";

interface AttachedFile {
  file: File;
  name: string;
  parsed?: ParsedDocumentData;
  parsing?: boolean;
  error?: string;
}

interface EmailComposerProps {
  recipientName: string;
  subject: string;
  onSend: (body: string, attachments?: AttachedFile[]) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export function EmailComposer({
  recipientName,
  subject,
  onSend,
  disabled,
  placeholder = "Write your response...",
}: EmailComposerProps) {
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      // Only accept .docx files
      if (!file.name.toLowerCase().endsWith(".docx")) {
        setAttachments((prev) => [
          ...prev,
          {
            file,
            name: file.name,
            error: "Only .docx files are supported",
          },
        ]);
        continue;
      }

      // Add file with parsing state
      const newAttachment: AttachedFile = {
        file,
        name: file.name,
        parsing: true,
      };
      setAttachments((prev) => [...prev, newAttachment]);

      // Parse the document
      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/parse-document", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("Failed to parse document");
        }

        const data = await response.json();

        setAttachments((prev) =>
          prev.map((a) =>
            a.file === file
              ? {
                  ...a,
                  parsing: false,
                  parsed: data.document,
                }
              : a
          )
        );
      } catch (error) {
        setAttachments((prev) =>
          prev.map((a) =>
            a.file === file
              ? {
                  ...a,
                  parsing: false,
                  error: "Failed to parse document",
                }
              : a
          )
        );
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!body.trim() || isSending || disabled) return;

    setIsSending(true);
    try {
      await onSend(body.trim(), attachments.length > 0 ? attachments : undefined);
      setBody("");
      setAttachments([]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSend();
    }
  };

  return (
    <div className="border-t bg-white p-4">
      <div className="border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
        <div className="px-4 py-2 bg-gray-50 border-b text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">To:</span>
            <span className="font-medium">{recipientName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Subject:</span>
            <span>Re: {subject}</span>
          </div>
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isSending}
          className={cn(
            "w-full min-h-[200px] p-4 resize-none focus:outline-none",
            "placeholder:text-gray-400",
            disabled && "bg-gray-50 cursor-not-allowed"
          )}
        />

        {/* Attachments Display */}
        {attachments.length > 0 && (
          <div className="px-4 py-2 border-t bg-gray-50">
            <div className="text-xs font-medium text-gray-500 mb-2">
              Attachments
            </div>
            <div className="flex flex-wrap gap-2">
              {attachments.map((attachment, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                    attachment.error
                      ? "bg-red-50 border border-red-200"
                      : attachment.parsing
                      ? "bg-yellow-50 border border-yellow-200"
                      : attachment.parsed
                      ? "bg-green-50 border border-green-200"
                      : "bg-white border border-gray-200"
                  )}
                >
                  {attachment.parsing ? (
                    <Loader2 className="w-4 h-4 text-yellow-600 animate-spin" />
                  ) : attachment.error ? (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  ) : (
                    <FileText className="w-4 h-4 text-blue-600" />
                  )}
                  <span className="max-w-[150px] truncate">
                    {attachment.name}
                  </span>
                  {attachment.parsed && (
                    <span className="text-xs text-green-600">
                      ({attachment.parsed.trackChanges.length} changes)
                    </span>
                  )}
                  {attachment.error && (
                    <span className="text-xs text-red-500">
                      {attachment.error}
                    </span>
                  )}
                  <button
                    onClick={() => removeAttachment(index)}
                    className="p-0.5 hover:bg-gray-200 rounded"
                  >
                    <X className="w-3 h-3 text-gray-500" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".docx"
              multiple
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isSending}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors",
                disabled || isSending
                  ? "text-gray-400 cursor-not-allowed"
                  : "text-gray-600 hover:bg-gray-200"
              )}
            >
              <Paperclip className="w-4 h-4" />
              Attach Document
            </button>
            <span className="text-xs text-gray-500">
              Cmd+Enter to send
            </span>
          </div>

          <button
            onClick={handleSend}
            disabled={!body.trim() || isSending || disabled}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-colors",
              body.trim() && !isSending && !disabled
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-gray-300 cursor-not-allowed"
            )}
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
