/**
 * Runs the blog pipeline's deterministic precheck over hand-written posts.
 *
 *     npm run verify:posts                 # every post
 *     npm run verify:posts -- <slug> ...   # just these
 *
 * The weekly pipeline prechecks its own drafts; posts written by hand skip it,
 * so this applies the same gates (word count, banned phrases, a single CTA in
 * the closing paragraph, heading shape, no year in the title) to the markdown.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import matter from "gray-matter";

import { precheckDraft } from "../lib/blog/precheck";
import type { Draft } from "../lib/blog/schemas";

const dir = join(process.cwd(), "content/blog/posts");
const only = process.argv.slice(2);
let failures = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
    const slug = file.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
    if (only.length && !only.includes(slug)) continue;

    const { data, content: raw } = matter(readFileSync(join(dir, file), "utf8"));
    // Drafts hold plain text and the renderer adds the link; in markdown the
    // domain appears in both the link text and its URL, so read the text only.
    const content = raw.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    const parts = content.split(/^####\s+/m);
    const lede = parts[0].trim();
    const sections = parts.slice(1).map((part) => {
        const [heading, ...rest] = part.split("\n");
        return { heading: heading.trim(), body: rest.join("\n").trim() };
    });

    // The closing paragraph that names the site is the CTA; "Practical notes"
    // is its own field in a draft.
    const last = sections[sections.length - 1];
    const paragraphs = last.body.split(/\n\s*\n/);
    const ctaIndex = paragraphs.findIndex((p) => /actuallyfreepdfeditor\.com/i.test(p));
    const ctaParagraph = ctaIndex >= 0 ? paragraphs[ctaIndex] : "";
    last.body = paragraphs.filter((_, i) => i !== ctaIndex).join("\n\n");
    const notes = sections.findIndex((s) => /^practical notes$/i.test(s.heading));
    const practicalNotes = notes >= 0 ? sections.splice(notes, 1)[0].body : "";

    const draft = { slug, title: String(data.title), lede, sections, practicalNotes, ctaParagraph, capabilitiesReferenced: [] } as unknown as Draft;
    const problems = precheckDraft(draft, []);
    if (problems.length) failures++;
    console.log(`${problems.length ? "FAIL" : "PASS"}  ${slug}${problems.length ? `\n      ${problems.map((p) => p.detail).join("\n      ")}` : ""}`);
}

process.exit(failures ? 1 : 0);
