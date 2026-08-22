import { CAPABILITIES, capabilityBriefing } from "../capabilities";
import { DraftSchema } from "../schemas";
import type { Brief, Draft } from "../schemas";
import { STYLE_CONTRACT } from "../style-contract";
import type { PostIndexEntry } from "../types";
import { AUTHOR_MODEL, type RunBudget, callStructured } from "./client";

/**
 * Stage 3 — writes one article from one brief.
 *
 * Returns structured sections rather than markdown. `lib/blog/render.ts`
 * assembles the file; the model supplies prose for named slots and nothing
 * structural.
 */

const SYSTEM = `You write for the blog of a free browser-based PDF editor. You are
writing for someone who has a document open in front of them and a task they are
stuck on. They want the answer, not an introduction to the answer.

Open with the answer. The lede must be useful on its own — someone who reads
only the first paragraph should already be able to act.

Write the honest version. Name the case where this tool is the wrong choice, and
say what the reader should use instead. That paragraph is not a concession; it
is the thing that makes the rest of the article worth trusting.

capabilitiesReferenced must contain only strings copied VERBATIM from the
can-list you were given. Do not paraphrase them, do not invent entries, and do
not list a capability the article does not actually rely on. This field is
checked by exact set membership and a mismatch discards the article.

Never imply the editor can do anything on the cannot-list, in any phrasing,
including hedged ones ("you may be able to", "some tools let you"). If the task
genuinely requires one of those things, say so plainly and name what does it.

For anything legal, tax, medical, or jurisdictional: describe the general shape,
then tell the reader to confirm with the issuing agency or a professional. Never
state a requirement as settled fact for the reader's specific situation.`;

export function authorSystemPrompt(index: PostIndexEntry[]): string {
    return [
        SYSTEM,
        "",
        capabilityBriefing(),
        "",
        "STYLE CONTRACT — followed exactly:",
        STYLE_CONTRACT,
        "",
        "POSTS THAT ALREADY EXIST — do not repeat their ground:",
        index.length === 0 ? "  (none yet)" : index.map((entry) => `  - ${entry.title} — ${entry.dek}`).join("\n"),
    ].join("\n");
}

export async function writeDraft({
    brief,
    index,
    budget,
}: {
    brief: Brief;
    index: PostIndexEntry[];
    budget: RunBudget;
}): Promise<{ draft: Draft; costUsd: number }> {
    const userMessage = [
        "Write this article.",
        "",
        `Working title: ${brief.workingTitle}`,
        `The query the reader typed: ${brief.targetQuery}`,
        `Task intent: ${brief.taskIntent}`,
        `The capability the closing paragraph hangs on: ${brief.appHook}`,
        `The limitation this article must admit: ${brief.honestLimitation}`,
        "",
        "SECTION PLAN — follow it; the headings may be reworded but the coverage must hold:",
        brief.sectionPlan.map((section, i) => `  ${i + 1}. ${section.heading} — ${section.covers}`).join("\n"),
        "",
        "The title you return should be the query phrased as a title, not the working title verbatim if you can do better.",
        "It must contain no year and no reference to any current event.",
        "",
        `Slug: ${brief.slug}`,
        "",
        `Reminder: the CTA paragraph mentions ${CAPABILITIES.url} exactly once, and the domain appears nowhere else in the article.`,
    ].join("\n");

    const result = await callStructured({
        model: AUTHOR_MODEL,
        schema: DraftSchema,
        systemStable: authorSystemPrompt(index),
        systemVolatile: undefined,
        userMessage,
        maxTokens: 8000,
        budget,
    });

    return { draft: result.value, costUsd: result.costUsd };
}
