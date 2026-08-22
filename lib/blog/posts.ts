import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import matter from "gray-matter";

import type { Post, PostIndexEntry } from "./types";

/**
 * Reads posts off disk at build time.
 *
 * Every blog route is statically generated, so this only ever runs during
 * `next build` — the pipeline's commit is what triggers a rebuild, and there is
 * no request-time filesystem access to worry about.
 */

const POSTS_DIR = join(process.cwd(), "content", "blog", "posts");

/** Filenames are `YYYY-MM-DD-slug.md`; the slug is the routable part. */
function slugFromFilename(filename: string): string {
    return filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

function readingMinutes(body: string): number {
    // 225 wpm is the usual reading-speed assumption for prose of this kind.
    return Math.max(1, Math.round(body.trim().split(/\s+/).length / 225));
}

let cached: Post[] | null = null;

export function getAllPosts(): Post[] {
    if (cached) return cached;

    let filenames: string[];
    try {
        filenames = readdirSync(POSTS_DIR).filter((name) => name.endsWith(".md"));
    } catch {
        // An empty content directory is a valid state — the blog simply has no
        // posts yet, and the routes should still build.
        return (cached = []);
    }

    const posts = filenames.map((filename) => {
        const raw = readFileSync(join(POSTS_DIR, filename), "utf8");
        const { data, content } = matter(raw);

        return {
            ...(data as Omit<Post, "slug" | "body" | "readingMinutes">),
            slug: slugFromFilename(filename),
            body: content,
            readingMinutes: readingMinutes(content),
        } satisfies Post;
    });

    // Newest first, with the slug as a tiebreaker so ordering is stable across
    // builds when two posts share a date (the pipeline publishes three at once).
    posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

    return (cached = posts);
}

export function getPost(slug: string): Post | undefined {
    return getAllPosts().find((post) => post.slug === slug);
}

export function toIndexEntry(post: Post): PostIndexEntry {
    const { slug, title, dek, date, tags, taskIntent } = post;
    return { slug, title, dek, date, tags, taskIntent };
}

/**
 * Picks related posts by tag overlap, breaking ties by recency.
 *
 * Deliberately computed in code rather than asked of a model: a hallucinated
 * "related post" is a broken internal link, and this is the cheapest possible
 * way to make that category of bug impossible.
 */
export function pickRelated(post: Pick<Post, "slug" | "tags" | "taskIntent">, pool: Post[], limit = 3): Post[] {
    const tags = new Set(post.tags);

    return pool
        .filter((candidate) => candidate.slug !== post.slug)
        .map((candidate) => {
            const shared = candidate.tags.filter((tag) => tags.has(tag)).length;
            const union = new Set([...tags, ...candidate.tags]).size;
            return {
                candidate,
                // Jaccard similarity, nudged up when the underlying task matches.
                score: (union === 0 ? 0 : shared / union) + (candidate.taskIntent === post.taskIntent ? 0.15 : 0),
            };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || b.candidate.date.localeCompare(a.candidate.date))
        .slice(0, limit)
        .map((entry) => entry.candidate);
}

/** Previous/next by publication order, for the footer links on a post. */
export function getNeighbours(slug: string): { previous?: Post; next?: Post } {
    const posts = getAllPosts();
    const index = posts.findIndex((post) => post.slug === slug);
    if (index === -1) return {};

    // `posts` is newest-first, so the *next* post chronologically is the one before it.
    return { next: posts[index - 1], previous: posts[index + 1] };
}

export function getAllTags(): Array<{ tag: string; count: number }> {
    const counts = new Map<string, number>();
    for (const post of getAllPosts()) {
        for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
