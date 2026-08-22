import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";

import { PROCEDURAL_INTENTS } from "./taxonomy";
import type { Post } from "./types";

/**
 * JSON-LD builders.
 *
 * `HowTo` is emitted only for procedural task intents. A HowTo block on a
 * comparison or troubleshooting article is structured-data spam — it claims a
 * step sequence the page does not have, and Google is entitled to treat that as
 * a misrepresentation of the content.
 */

export function articleSchema(post: Post) {
    return {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: post.title,
        description: post.dek,
        datePublished: post.date,
        dateModified: post.date,
        author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
        publisher: {
            "@type": "Organization",
            name: SITE_NAME,
            url: SITE_URL,
            logo: { "@type": "ImageObject", url: absoluteUrl("/brand/app-icon-512.png") },
        },
        mainEntityOfPage: { "@type": "WebPage", "@id": absoluteUrl(`/blog/${post.slug}`) },
        keywords: post.tags.join(", "),
        isAccessibleForFree: true,
    };
}

/** Section headings become the steps. Returns null when the article isn't procedural. */
export function howToSchema(post: Post) {
    if (!PROCEDURAL_INTENTS.includes(post.taskIntent)) return null;

    const steps = [...post.body.matchAll(/^#{4}\s+(.+)$/gm)].map((match) => match[1].trim());
    if (steps.length < 2) return null;

    return {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: post.title,
        description: post.dek,
        step: steps.map((name, index) => ({
            "@type": "HowToStep",
            position: index + 1,
            name,
            url: `${absoluteUrl(`/blog/${post.slug}`)}#${name
                .toLowerCase()
                .replace(/[^\w\s-]/g, "")
                .trim()
                .replace(/\s+/g, "-")
                .slice(0, 60)}`,
        })),
    };
}

export function breadcrumbSchema(trail: Array<{ name: string; path: string }>) {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: trail.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            item: absoluteUrl(item.path),
        })),
    };
}

/** Serialises safely for embedding in a <script> tag. */
export function jsonLd(data: unknown): string {
    return JSON.stringify(data).replace(/</g, "\\u003c");
}
