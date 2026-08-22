import type { Draft } from "../schemas";

/**
 * Known-bad drafts, one per deterministic gate.
 *
 * These exist so the prechecks cannot silently stop working. Every entry is a
 * failure the pipeline has to catch without spending a reviewer call, and
 * `scripts/verify-blog-gates.mjs` asserts each one is caught for the stated
 * reason.
 */

function baseDraft(overrides: Partial<Draft> = {}): Draft {
    const filler =
        "Open the file and look at the top of the page. The toolbar sits above the document and every tool you need is in it. " +
        "Pick the one you want, click the spot on the page you care about, and the change is applied immediately. " +
        "You can move anything you place afterwards by dragging it, and resize it by pulling a corner handle. ";

    return {
        slug: "how-to-do-a-document-task",
        title: "How to Do a Document Task",
        dek: "A short summary of the article that is comfortably longer than eighty characters so that it satisfies the schema minimum.",
        tags: ["signing", "forms"],
        lede: filler.repeat(2),
        sections: [
            { heading: "Open the file", body: filler.repeat(2) },
            { heading: "Place the text", body: filler.repeat(2) },
            { heading: "Check the result", body: filler.repeat(2) },
            { heading: "Send it back", body: filler.repeat(2) },
        ],
        practicalNotes: filler.repeat(2),
        ctaParagraph:
            "actuallyfreepdfeditor.com runs in the browser and can add text anywhere on the page, then hand back a finished file. " +
            "It is one step in the task rather than a separate destination.",
        capabilitiesReferenced: ["add text anywhere on a page, with control over font, size, weight, slant, colour and alignment"],
        ...overrides,
    };
}

export interface Fixture {
    name: string;
    draft: Draft;
    expectCode: string;
}

export const BAD_DRAFTS: Fixture[] = [
    {
        name: "claims a capability the editor does not have",
        expectCode: "PRECHECK_CAPABILITY_SET",
        draft: baseDraft({
            slug: "convert-a-pdf-to-word",
            capabilitiesReferenced: ["convert a PDF to Word", "OCR scanned documents"],
        }),
    },
    {
        name: "pins the title to a year",
        expectCode: "PRECHECK_TITLE_YEAR",
        draft: baseDraft({ slug: "fafsa-deadline-guide", title: "The 2027 FAFSA Deadline Guide" }),
    },
    {
        name: "mentions the domain more than once",
        expectCode: "PRECHECK_CTA_COUNT",
        draft: baseDraft({
            lede: "Head to actuallyfreepdfeditor.com first. " + "You will need the file open before anything else can happen. ".repeat(12),
        }),
    },
    {
        name: "uses a banned phrase",
        expectCode: "PRECHECK_BANNED_PHRASE",
        draft: baseDraft({
            practicalNotes: "In today's digital landscape, the humble PDF remains everywhere. " + "That is the situation you are working in. ".repeat(12),
        }),
    },
    {
        name: "is padded well past the word ceiling",
        expectCode: "PRECHECK_WORD_COUNT",
        draft: baseDraft({
            sections: Array.from({ length: 6 }, (_, i) => ({
                heading: `Section number ${i + 1}`,
                body: "This paragraph exists only to take up room and says nothing a reader could act upon at all. ".repeat(40),
            })),
        }),
    },
    {
        name: "uses a question as a heading",
        expectCode: "PRECHECK_HEADING_SHAPE",
        draft: baseDraft({
            sections: [
                { heading: "Why does this happen?", body: "Because the form was flattened when it was scanned. ".repeat(14) },
                { heading: "Open the file", body: "Start by opening the document in the editor you prefer. ".repeat(14) },
                { heading: "Place the text", body: "Click where the answer belongs and start typing there. ".repeat(14) },
                { heading: "Send it back", body: "Download the finished file and reply to whoever sent it. ".repeat(14) },
            ],
        }),
    },
    {
        name: "collides with an existing slug",
        expectCode: "PRECHECK_SLUG_COLLISION",
        draft: baseDraft({ slug: "how-to-sign-a-pdf-on-your-phone-without-an-app" }),
    },
];

/** A draft that should sail through every precheck, so the gates are not merely rejecting everything. */
export const GOOD_DRAFT: Draft = baseDraft();
