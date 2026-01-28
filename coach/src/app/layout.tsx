import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coach - Negotiation Training",
  description: "AI-powered negotiation practice with real-time feedback and scoring",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
