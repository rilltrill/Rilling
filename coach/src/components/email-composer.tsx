"use client";

import { useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmailComposerProps {
  recipientName: string;
  subject: string;
  onSend: (body: string) => Promise<void>;
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

  const handleSend = async () => {
    if (!body.trim() || isSending || disabled) return;

    setIsSending(true);
    try {
      await onSend(body.trim());
      setBody("");
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

        <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Press Cmd+Enter to send
          </span>

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
