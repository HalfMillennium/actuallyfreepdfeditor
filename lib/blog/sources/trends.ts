import { type RssItem, fetchRss } from "./rss";

/**
 * Google Trends — the lottery ticket.
 *
 * Ninety-odd percent of this feed is sport and celebrity news, which is fine:
 * it is not the engine, and the lexicon filter below is what makes the rest
 * cheap enough to keep asking. The bare trend title ("Chiefs vs Bills") carries
 * no document intent; the nested news snippets are where "applications open" or
 * "rebate form" actually appears, which is why they are searched too.
 */

/** The retired /trends/trendingsearches/daily/rss path no longer serves; this is the current one. */
const GEOS = ["US", "GB", "CA", "AU"] as const;

export const DOC_INTENT_LEXICON = [
    "form",
    "application",
    "apply",
    "deadline",
    "filing",
    "file by",
    "enroll",
    "enrolment",
    "enrollment",
    "rebate",
    "claim",
    "refund",
    "tax",
    "waiver",
    "permit",
    "license",
    "licence",
    "renewal",
    "contract",
    "lease",
    "sign",
    "signature",
    "notarize",
    "notarise",
    "submit",
    "paperwork",
    "document",
    "transcript",
    "visa",
    "passport",
    "affidavit",
    "disclosure",
    "consent",
    "pdf",
    "scan",
    "upload",
];

export interface TrendSignal {
    title: string;
    geo: string;
    matched: string;
    evidence: string;
}

function hasDocumentIntent(text: string): string | null {
    const lower = text.toLowerCase();
    return DOC_INTENT_LEXICON.find((term) => lower.includes(term)) ?? null;
}

export async function fetchTrendSignals(limit = 20): Promise<{ fetched: number; signals: TrendSignal[] }> {
    const results = await Promise.all(
        GEOS.map(async (geo) => ({ geo, items: await fetchRss(`https://trends.google.com/trending/rss?geo=${geo}`) })),
    );

    const signals: TrendSignal[] = [];
    let fetched = 0;

    for (const { geo, items } of results) {
        fetched += items.length;

        for (const item of items) {
            const haystack = [item.title, ...item.newsSnippets].join(" ");
            const matched = hasDocumentIntent(haystack);
            if (!matched) continue;

            signals.push({
                title: item.title,
                geo,
                matched,
                // Carry the snippet that triggered the match: the brief agent
                // needs the reason, not just the trend name.
                evidence: (item.newsSnippets.find((snippet) => snippet.toLowerCase().includes(matched)) ?? item.title).slice(0, 240),
            });
        }
    }

    return { fetched, signals: signals.slice(0, limit) };
}

export function formatTrendSignal(signal: TrendSignal): string {
    return `[${signal.geo}] "${signal.title}" — matched "${signal.matched}" — ${signal.evidence}`;
}

export type { RssItem };
