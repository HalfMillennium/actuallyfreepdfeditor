import { CAPABILITIES } from "./capabilities";
import type { Draft, PrecheckCode } from "./schemas";
import { BANNED_PATTERNS, BANNED_PHRASES } from "./style-contract";
import type { PostIndexEntry } from "./types";

/**
 * Deterministic gates that run before the reviewer is ever called.
 *
 * Every one of these is cheap, objective, and a definite reject. Spending a
 * reviewer call to discover that an article is 1,400 words or mentions the
 * domain four times is a waste of money and of the reviewer's attention.
 */

export interface PrecheckFailure {
    code: PrecheckCode;
    detail: string;
    quote?: string;
}

const MIN_WORDS = 500;
const MAX_WORDS = 900;

/** Everything the reader sees, in one string, for the whole-body checks. */
function fullText(draft: Draft): string {
    return [draft.lede, ...draft.sections.flatMap((s) => [s.heading, s.body]), draft.practicalNotes, draft.ctaParagraph].join("\n\n");
}

export function countWords(draft: Draft): number {
    return fullText(draft).trim().split(/\s+/).filter(Boolean).length;
}

export function precheckDraft(draft: Draft, index: PostIndexEntry[]): PrecheckFailure[] {
    const failures: PrecheckFailure[] = [];
    const body = fullText(draft);

    const words = countWords(draft);
    if (words < MIN_WORDS || words > MAX_WORDS) {
        failures.push({ code: "PRECHECK_WORD_COUNT", detail: `${words} words; the contract is ${MIN_WORDS}-${MAX_WORDS}.` });
    }

    // Set difference against the manifest. This is the layer that stops the
    // article promising OCR — the author cannot claim a capability that is not
    // literally in the can-list.
    const allowed = new Set<string>(CAPABILITIES.can);
    const invented = draft.capabilitiesReferenced.filter((item) => !allowed.has(item));
    if (invented.length > 0) {
        failures.push({
            code: "PRECHECK_CAPABILITY_SET",
            detail: `References capabilities that are not in the manifest: ${invented.join("; ")}.`,
            quote: invented[0],
        });
    }

    const mentions = [...body.matchAll(/actuallyfreepdfeditor\.com/gi)];
    if (mentions.length !== 1) {
        failures.push({ code: "PRECHECK_CTA_COUNT", detail: `The domain appears ${mentions.length} times; it must appear exactly once.` });
    } else if (!/actuallyfreepdfeditor\.com/i.test(draft.ctaParagraph)) {
        failures.push({ code: "PRECHECK_CTA_PLACEMENT", detail: "The single domain mention is outside the CTA paragraph." });
    }

    const lower = body.toLowerCase();
    for (const phrase of BANNED_PHRASES) {
        if (lower.includes(phrase)) {
            failures.push({ code: "PRECHECK_BANNED_PHRASE", detail: `Contains the banned phrase "${phrase}".`, quote: phrase });
        }
    }
    for (const { label, pattern } of BANNED_PATTERNS) {
        const match = pattern.exec(body);
        if (match) {
            failures.push({ code: "PRECHECK_BANNED_PHRASE", detail: `Contains a banned pattern: ${label}.`, quote: match[0].slice(0, 80) });
        }
    }

    if (index.some((entry) => entry.slug === draft.slug)) {
        failures.push({ code: "PRECHECK_SLUG_COLLISION", detail: `A post with the slug "${draft.slug}" already exists.` });
    }

    // A year in the title is the clearest single signal that an article is
    // pinned to a moment rather than to a task.
    const year = /\b(19|20)\d{2}\b/.exec(draft.title);
    if (year) {
        failures.push({ code: "PRECHECK_TITLE_YEAR", detail: "The title contains a year, which fails the 18-Month Test by construction.", quote: year[0] });
    }

    const badHeading = draft.sections.find((section) => {
        const wordCount = section.heading.trim().split(/\s+/).length;
        return wordCount < 2 || wordCount > 5 || section.heading.trim().endsWith("?");
    });
    if (badHeading) {
        failures.push({
            code: "PRECHECK_HEADING_SHAPE",
            detail: "Headings must be two to five words and must not be questions.",
            quote: badHeading.heading,
        });
    }

    return failures;
}
