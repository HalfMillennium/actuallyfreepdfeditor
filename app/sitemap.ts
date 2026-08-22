import type { MetadataRoute } from "next";

import { getAllPosts } from "@/lib/blog/posts";
import { absoluteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
    const posts = getAllPosts();
    const newest = posts[0]?.date;

    return [
        { url: absoluteUrl("/"), changeFrequency: "monthly", priority: 1 },
        {
            url: absoluteUrl("/blog"),
            lastModified: newest ? new Date(`${newest}T12:00:00Z`) : undefined,
            changeFrequency: "weekly",
            priority: 0.8,
        },
        ...posts.map((post) => ({
            url: absoluteUrl(`/blog/${post.slug}`),
            lastModified: new Date(`${post.date}T12:00:00Z`),
            changeFrequency: "yearly" as const,
            priority: 0.6,
        })),
    ];
}
