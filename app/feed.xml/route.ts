import { getAllPosts } from "@/lib/blog/posts";
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl } from "@/lib/site";

/** Static: regenerated on each build, which the pipeline's commit triggers. */
export const dynamic = "force-static";

function escapeXml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function GET(): Response {
    const posts = getAllPosts();
    const updated = posts[0] ? new Date(`${posts[0].date}T12:00:00Z`).toUTCString() : new Date(0).toUTCString();

    const items = posts
        .map((post) =>
            [
                "    <item>",
                `      <title>${escapeXml(post.title)}</title>`,
                `      <link>${absoluteUrl(`/blog/${post.slug}`)}</link>`,
                `      <guid isPermaLink="true">${absoluteUrl(`/blog/${post.slug}`)}</guid>`,
                `      <description>${escapeXml(post.dek)}</description>`,
                `      <pubDate>${new Date(`${post.date}T12:00:00Z`).toUTCString()}</pubDate>`,
                ...post.tags.map((tag) => `      <category>${escapeXml(tag)}</category>`),
                "    </item>",
            ].join("\n"),
        )
        .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_NAME)} — Guides</title>
    <link>${absoluteUrl("/blog")}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en</language>
    <lastBuildDate>${updated}</lastBuildDate>
    <atom:link href="${absoluteUrl("/feed.xml")}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;

    return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
}
