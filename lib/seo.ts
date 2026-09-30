import { jsonLd } from "@/lib/blog/structured-data";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";

/**
 * Structured data for the tool pages.
 *
 * `WebApplication` says what the page *is* (a free, browser-only utility);
 * `FAQPage` mirrors the FAQ block rendered on the same page, word for word —
 * Google treats FAQ markup that does not match visible content as spam, so the
 * page and the schema are built from one array.
 */

export interface FaqEntry {
    question: string;
    answer: string;
}

export function webApplicationSchema({ name, path, description }: { name: string; path: string; description: string }) {
    return {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name,
        url: absoluteUrl(path),
        description,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Any (browser)",
        browserRequirements: "Requires JavaScript. Runs entirely in the browser; files are not uploaded.",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    };
}

export function faqSchema(entries: FaqEntry[]) {
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: entries.map((entry) => ({
            "@type": "Question",
            name: entry.question,
            acceptedAnswer: { "@type": "Answer", text: entry.answer },
        })),
    };
}

export { jsonLd };
