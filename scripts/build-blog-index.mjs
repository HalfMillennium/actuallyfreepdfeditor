/**
 * Regenerates content/blog/index.json from the posts directory.
 *
 * The index is committed rather than derived at runtime for one reason: the
 * cron route imports it, and a static import is bundled reliably into the
 * serverless function where a `readdirSync` of the content directory is not.
 * Generating it here keeps it from ever drifting from the posts themselves.
 *
 * Writes only when the content actually changes, so a plain build does not
 * leave the working tree dirty.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import matter from "gray-matter";

const POSTS_DIR = join(process.cwd(), "content", "blog", "posts");
const INDEX_PATH = join(process.cwd(), "content", "blog", "index.json");

let filenames = [];
try {
    filenames = readdirSync(POSTS_DIR).filter((name) => name.endsWith(".md"));
} catch {
    // No posts directory yet — write an empty index so imports still resolve.
}

const entries = filenames
    .map((filename) => {
        const { data } = matter(readFileSync(join(POSTS_DIR, filename), "utf8"));
        return {
            slug: filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, ""),
            title: data.title,
            dek: data.dek,
            date: data.date,
            tags: data.tags ?? [],
            taskIntent: data.taskIntent,
        };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.slug.localeCompare(b.slug));

const next = JSON.stringify(entries, null, 2) + "\n";

let current = "";
try {
    current = readFileSync(INDEX_PATH, "utf8");
} catch {
    /* first run */
}

if (current === next) {
    console.log(`blog index unchanged (${entries.length} posts)`);
} else {
    writeFileSync(INDEX_PATH, next);
    console.log(`blog index written: ${entries.length} posts`);
}
