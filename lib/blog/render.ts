import { CAPABILITIES } from "./capabilities";
import type { Brief, Draft } from "./schemas";
import type { PostIndexEntry } from "./types";

/**
 * Turns a validated Draft into the markdown that gets committed.
 *
 * The model never writes frontmatter, the CTA link markup, or anything
 * structural. It supplies prose for named slots and this function assembles the
 * file. That is what makes a malformed post or a broken internal link
 * impossible rather than merely unlikely.
 */

/** Strip anything that could become markup once the body is rendered. */
function sanitise(text: string): string {
    return text
        .replace(/<[^>]*>/g, "")
        .replace(/\r\n/g, "\n")
        .trim();
}

function yamlString(value: string): string {
    // Always quote and escape: titles routinely contain colons and quotes.
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export interface RenderInput {
    draft: Draft;
    brief: Brief;
    date: string;
    runId: string;
}

export function renderPost({ draft, brief, date, runId }: RenderInput): string {
    const frontmatter = [
        "---",
        `title: ${yamlString(sanitise(draft.title))}`,
        `dek: ${yamlString(sanitise(draft.dek))}`,
        `date: ${yamlString(date)}`,
        `tags: [${draft.tags.map((tag) => yamlString(sanitise(tag))).join(", ")}]`,
        `taskIntent: ${brief.taskIntent}`,
        `signalOrigin: ${brief.signalOrigin}`,
        "generated: true",
        `runId: ${yamlString(runId)}`,
        "---",
    ].join("\n");

    const body = [
        sanitise(draft.lede),
        ...draft.sections.flatMap((section) => [`#### ${sanitise(section.heading)}`, sanitise(section.body)]),
        "#### Practical notes",
        sanitise(draft.practicalNotes),
        // The link markup is injected here rather than written by the model, so
        // the CTA can never point somewhere unintended.
        withCtaLink(sanitise(draft.ctaParagraph)),
    ].join("\n\n");

    return `${frontmatter}\n\n${body}\n`;
}

/**
 * Linkifies the first bare mention of the domain in the CTA paragraph.
 *
 * The prechecks guarantee exactly one mention and that it lives in this
 * paragraph, so a single replacement is sufficient and there is nothing to
 * disambiguate.
 */
function withCtaLink(paragraph: string): string {
    // A trailing path is captured so an article about extraction can send the
    // reader to /extract rather than to the editor, which is the wrong tool for
    // it. Without this the link text and the href could disagree.
    return paragraph.replace(/actuallyfreepdfeditor\.com(\/[\w/-]*)?/, (match, path: string | undefined) => `[${match}](${CAPABILITIES.url}${path ?? ""})`);
}

/** The post's filename. Date-prefixed so the directory sorts chronologically. */
export function postFilename(slug: string, date: string): string {
    return `${date}-${slug}.md`;
}

export function toIndexEntry(draft: Draft, brief: Brief, date: string): PostIndexEntry {
    return {
        slug: draft.slug,
        title: sanitise(draft.title),
        dek: sanitise(draft.dek),
        date,
        tags: draft.tags.map(sanitise),
        taskIntent: brief.taskIntent,
    };
}
