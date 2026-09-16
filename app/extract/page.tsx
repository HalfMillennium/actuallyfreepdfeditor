import type { Metadata } from "next";

import { ExtractProvider } from "@/components/extract/extract-context";
import { ExtractShell } from "@/components/extract/extract-shell";

export const metadata: Metadata = {
    title: "Extract text, tables and personal data from a PDF — in your browser",
    description:
        "Pull text and tables out of a PDF as TXT, Markdown, CSV or JSON, run OCR on scanned pages, and redact personal data for good. Everything runs locally: the file never leaves your device.",
    alternates: { canonical: "/extract" },
};

export default function Page() {
    return (
        <ExtractProvider>
            <ExtractShell />
        </ExtractProvider>
    );
}
