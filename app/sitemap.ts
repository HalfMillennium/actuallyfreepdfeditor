import type { MetadataRoute } from "next";

import { getAllPosts } from "@/lib/blog/posts";
import { absoluteUrl } from "@/lib/site";

/**
 * Deliberately minimal: `<loc>` and a date-only `<lastmod>`, nothing else.
 *
 * `changefreq` and `priority` are gone because Google ignores both and has said
 * so for years — they were pure parsing surface with no upside.
 *
 * `lastModified` is passed as a plain `YYYY-MM-DD` string rather than a Date.
 * A Date serialises to `2026-08-26T12:00:00.000Z`, and while fractional seconds
 * are legal W3C Datetime, the date-only form is the one every validator agrees
 * on. The post frontmatter is date-only anyway, so the timestamp was invented
 * precision.
 */
export default function sitemap(): MetadataRoute.Sitemap {
    const posts = getAllPosts();
    const newest = posts[0]?.date;

    return [
        { url: absoluteUrl("/") },
        { url: absoluteUrl("/extract") },
        { url: absoluteUrl("/blog"), ...(newest ? { lastModified: newest } : {}) },
        ...posts.map((post) => ({
            url: absoluteUrl(`/blog/${post.slug}`),
            lastModified: post.date,
        })),
    ];
}
