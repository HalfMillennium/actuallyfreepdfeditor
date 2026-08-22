import { Renderer, marked } from "marked";

/**
 * Markdown -> HTML for post bodies.
 *
 * Raw HTML is escaped rather than passed through. Post bodies are written by a
 * model, and although the pipeline strips tags before committing and PR review
 * stands in front of that, "the renderer cannot emit markup it was handed" is
 * the layer that holds even when the other two are switched off.
 */

function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Stable, readable anchor ids so headings can be linked to directly. */
export function headingId(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 60);
}

function buildRenderer(): Renderer {
    const renderer = new Renderer();

    renderer.html = ({ text }) => escapeHtml(text);

    renderer.heading = ({ text, depth }) => {
        const content = marked.parseInline(text) as string;
        const id = headingId(text);
        // Headings render one level down from their markdown depth: the post
        // title owns <h1>, so a `####` section becomes an <h2> in the document
        // outline while keeping its visual weight.
        const level = Math.min(6, Math.max(2, depth - 2));
        return `<h${level} id="${id}">${content}</h${level}>`;
    };

    renderer.link = ({ href, title, text }) => {
        const content = marked.parseInline(text) as string;
        const external = /^https?:\/\//.test(href) && !href.includes("actuallyfreepdfeditor.com");
        const attrs = [
            `href="${escapeHtml(href)}"`,
            title ? `title="${escapeHtml(title)}"` : "",
            external ? 'target="_blank" rel="noopener noreferrer"' : "",
        ]
            .filter(Boolean)
            .join(" ");
        return `<a ${attrs}>${content}</a>`;
    };

    return renderer;
}

const renderer = buildRenderer();

export function renderMarkdown(body: string): string {
    return marked.parse(body, { renderer, async: false }) as string;
}

/** Section headings, for the in-page contents list. */
export function extractHeadings(body: string): Array<{ id: string; text: string }> {
    return [...body.matchAll(/^#{4}\s+(.+)$/gm)].map((match) => ({
        id: headingId(match[1].trim()),
        text: match[1].trim(),
    }));
}
