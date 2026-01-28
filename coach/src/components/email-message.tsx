"use client";

import { Email } from "@/lib/types";
import { formatTimestamp, cn } from "@/lib/utils";
import { User, Building2 } from "lucide-react";

interface EmailMessageProps {
  email: Email;
  isLatest?: boolean;
}

export function EmailMessage({ email, isLatest }: EmailMessageProps) {
  const isUser = email.from === "user";

  return (
    <div
      className={cn(
        "border rounded-lg p-4 transition-all",
        isUser
          ? "bg-blue-50 border-blue-200"
          : "bg-gray-50 border-gray-200",
        isLatest && "ring-2 ring-blue-400 ring-offset-2"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
            isUser ? "bg-blue-600" : "bg-gray-600"
          )}
        >
          {isUser ? (
            <User className="w-5 h-5 text-white" />
          ) : (
            <Building2 className="w-5 h-5 text-white" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-gray-900 truncate">
                {email.fromName}
              </span>
              <span className="text-gray-400">→</span>
              <span className="text-gray-600 truncate">{email.toName}</span>
            </div>
            <span className="text-xs text-gray-500 shrink-0">
              {formatTimestamp(email.timestamp)}
            </span>
          </div>

          <div className="text-sm font-medium text-gray-700 mb-3">
            Re: {email.subject}
          </div>

          <div className="text-gray-800 whitespace-pre-wrap leading-relaxed">
            {email.body}
          </div>

          {email.attachments && email.attachments.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <div className="text-xs font-medium text-gray-500 mb-2">
                Attachments
              </div>
              <div className="flex flex-wrap gap-2">
                {email.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white border rounded text-sm hover:bg-gray-50 cursor-pointer"
                  >
                    <span className="text-blue-600">{attachment.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
