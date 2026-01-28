"use client";

import { Email } from "@/lib/types";
import { EmailMessage } from "./email-message";
import { Mail } from "lucide-react";

interface EmailThreadProps {
  emails: Email[];
  subject: string;
}

export function EmailThread({ emails, subject }: EmailThreadProps) {
  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
        <Mail className="w-16 h-16 mb-4 opacity-50" />
        <p className="text-lg font-medium">No emails yet</p>
        <p className="text-sm">Select a scenario to begin your negotiation</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-white border-b px-4 py-3 z-10">
        <h2 className="font-semibold text-gray-900 truncate">{subject}</h2>
        <p className="text-sm text-gray-500">
          {emails.length} message{emails.length !== 1 ? "s" : ""} in thread
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {emails.map((email, index) => (
          <EmailMessage
            key={email.id}
            email={email}
            isLatest={index === emails.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
