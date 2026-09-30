import type { Metadata } from "next";

import { REDACT_DESCRIPTION, REDACT_FAQ, REDACT_TITLE } from "@/lib/redaction-copy";
import { faqSchema, jsonLd, webApplicationSchema } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";

import { ExtractProvider } from "@/components/extract/extract-context";
import { ExtractShell } from "@/components/extract/extract-shell";

export const metadata: Metadata = {
    title: REDACT_TITLE,
    description: REDACT_DESCRIPTION,
    // Absolute, the way the blog routes do it: a relative canonical is resolved
    // by crawlers but gives Search Console one more thing to disagree about.
    alternates: { canonical: absoluteUrl("/redact") },
    openGraph: { title: REDACT_TITLE, description: REDACT_DESCRIPTION, url: absoluteUrl("/redact") },
};

/**
 * The redaction workspace. It also extracts text and tables and runs OCR —
 * the same engine — which is why it used to live at /extract (now a permanent
 * redirect here, see next.config.mjs).
 */
export default function Page() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: jsonLd(webApplicationSchema({ name: "Redact a PDF", path: "/redact", description: REDACT_DESCRIPTION })),
                }}
            />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema(REDACT_FAQ)) }} />
            <ExtractProvider>
                <ExtractShell />
            </ExtractProvider>
        </>
    );
}
