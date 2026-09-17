import type { Metadata } from "next";

import { absoluteUrl } from "@/lib/site";

import { ExtractProvider } from "@/components/extract/extract-context";
import { ExtractShell } from "@/components/extract/extract-shell";

export const metadata: Metadata = {
    title: "Extract text, tables and personal data from a PDF — in your browser",
    description:
        "Pull text and tables out of a PDF as TXT, Markdown, CSV or JSON, run OCR on scanned pages, and redact personal data for good. Everything runs locally: the file never leaves your device.",
    // Absolute, the way the blog routes do it: a relative canonical is resolved
    // by crawlers but gives Search Console one more thing to disagree about.
    alternates: { canonical: absoluteUrl("/extract") },
};

export default function Page() {
    return (
        <ExtractProvider>
            <ExtractShell />
        </ExtractProvider>
    );
}
