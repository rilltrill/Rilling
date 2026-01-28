import { NextRequest, NextResponse } from "next/server";
import { parseDocx, formatDocumentForAnalysis, categorizeChanges } from "@/lib/document-parser";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Check file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".docx")) {
      return NextResponse.json(
        { error: "Only .docx files are supported" },
        { status: 400 }
      );
    }

    // Read file buffer
    const buffer = await file.arrayBuffer();

    // Parse the document
    const parsedDocument = await parseDocx(buffer);

    // Categorize changes
    const categorized = categorizeChanges(parsedDocument);

    // Format for AI analysis
    const formattedForAnalysis = formatDocumentForAnalysis(parsedDocument);

    return NextResponse.json({
      success: true,
      document: {
        name: file.name,
        ...parsedDocument,
        categorizedChanges: categorized,
        formattedForAnalysis,
      },
    });
  } catch (error) {
    console.error("Document parsing error:", error);
    return NextResponse.json(
      { error: "Failed to parse document" },
      { status: 500 }
    );
  }
}
