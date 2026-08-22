import { fetchRss } from "./rss";

/**
 * Google News keyword search — the highest-value signal, and fully deterministic.
 *
 * Unlike the trends feed, every one of these queries is chosen to surface
 * document tasks, so the hit rate is high and no lexicon filter is needed.
 * Hand-tuned over time.
 */
export const NEWS_QUERIES = [
    '"PDF form" deadline',
    "e-signature law",
    "IRS form release",
    "open enrollment forms",
    "FAFSA form",
    "Acrobat subscription price",
    "digital signature requirement",
    "DMV form online",
    "immigration form USCIS",
    "lease agreement signing",
];

export interface NewsSignal {
    title: string;
    query: string;
    source?: string;
    pubDate: string;
}

export async function fetchNewsSignals(perQuery = 5): Promise<{ fetched: number; signals: NewsSignal[] }> {
    const results = await Promise.all(
        NEWS_QUERIES.map(async (query) => ({
            query,
            items: await fetchRss(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`),
        })),
    );

    let fetched = 0;
    const signals: NewsSignal[] = [];

    for (const { query, items } of results) {
        fetched += items.length;
        for (const item of items.slice(0, perQuery)) {
            signals.push({ title: item.title, query, source: item.source, pubDate: item.pubDate });
        }
    }

    return { fetched, signals };
}

export function formatNewsSignal(signal: NewsSignal): string {
    return `"${signal.title}"${signal.source ? ` (${signal.source})` : ""} — from query: ${signal.query}`;
}
