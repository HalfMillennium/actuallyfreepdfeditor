/**
 * A small RSS reader.
 *
 * Deliberately not a full XML parser: these two feeds have a known, stable
 * shape and the alternative is a dependency for four fields. Every extractor
 * is total — a malformed item yields empty strings rather than throwing —
 * because a signal source is allowed to be broken and the run must continue.
 */

export interface RssItem {
    title: string;
    description: string;
    pubDate: string;
    source?: string;
    /** Google Trends nests related headlines inside each item; those carry the intent. */
    newsSnippets: string[];
}

function decodeEntities(value: string): string {
    return value
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&");
}

function stripTags(value: string): string {
    return decodeEntities(value)
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function tagContent(xml: string, tag: string): string {
    // The `:` class allows namespaced tags such as ht:news_item_title.
    const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
    return match ? stripTags(match[1]) : "";
}

function allTagContents(xml: string, tag: string): string[] {
    return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))].map((match) => stripTags(match[1])).filter(Boolean);
}

export function parseRss(xml: string): RssItem[] {
    return [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => {
        const item = match[1];
        return {
            title: tagContent(item, "title"),
            description: tagContent(item, "description"),
            pubDate: tagContent(item, "pubDate"),
            source: tagContent(item, "source") || undefined,
            newsSnippets: [
                ...allTagContents(item, "ht:news_item_title"),
                ...allTagContents(item, "ht:news_item_snippet"),
            ],
        };
    });
}

/**
 * Fetches and parses a feed, returning an empty array on any failure.
 *
 * Signal sources are optional by construction: the seasonal calendar and the
 * backlog carry the run on their own, so a dead feed must degrade rather than
 * throw.
 */
export async function fetchRss(url: string, timeoutMs = 10_000): Promise<RssItem[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { "user-agent": "actuallyfreepdfeditor-blog-bot/1.0 (+https://actuallyfreepdfeditor.com)" },
        });
        if (!response.ok) {
            console.log(JSON.stringify({ evt: "blog.signal", level: "warn", url, status: response.status }));
            return [];
        }
        return parseRss(await response.text());
    } catch (error) {
        console.log(JSON.stringify({ evt: "blog.signal", level: "warn", url, error: String(error) }));
        return [];
    } finally {
        clearTimeout(timer);
    }
}
