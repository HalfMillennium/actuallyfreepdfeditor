import { capabilityBriefing } from "../capabilities";
import { BriefBatchSchema } from "../schemas";
import type { Brief } from "../schemas";
import type { PostIndexEntry } from "../types";
import { AUTHOR_MODEL, type RunBudget, callStructured, callWithWebSearch } from "./client";

/**
 * Stage 2 — turns this week's signals into candidate briefs.
 *
 * Deliberately over-generates: three have to survive review, and some will not.
 */

const SYSTEM = `You plan articles for the blog of a free browser-based PDF editor.

THE RULE THAT MATTERS MOST: trending topics select WHAT people need help with.
They never become the subject of the article. Your title must be the evergreen
search query a person types when they hit the document task — not the news event
that put them there. A title containing a year, a proper noun from the news, or
a current event is wrong.

A trend surfaces a group of people who are, right now, about to be handed a PDF
they need to do something to. Address the document task. The trend supplies
timing and framing and nothing else. Worked examples:

  Signal: "FAFSA deadline" spiking
    WRONG: FAFSA 2027 Deadline: What to Know
    RIGHT: How to Sign and Date a Verification Form Without Printing It

  Signal: "open enrollment" spiking
    WRONG: Open Enrollment Season Is Here
    RIGHT: Why You Can't Type in That Benefits Election PDF

  Signal: hurricane, FEMA claims in the news
    WRONG: FEMA Assistance After the Storm
    RIGHT: How to Attach Photos to a Claim Form PDF

Every brief must pass the 18-Month Test: would this article still be accurate
and useful 18 months from now with no edits? Argue it explicitly in the
eighteenMonthTest field — argue it, do not assert it. If you cannot, do not
propose the brief.

Every brief must name an honestLimitation: a place where this tool, or any tool,
is not the right answer. Articles without one read as marketing and will be
rejected downstream.

Do not propose a brief whose targetQuery substantially overlaps an existing post.

Prefer a spread across signalOrigin — ideally one trend-or-news, one seasonal,
one backlog. Do not force a mapping. A forced trend-to-task bridge is worse than
a backlog article, every time.`;

export interface BriefInput {
    trendItems: string[];
    newsItems: string[];
    seasonalThemes: string[];
    backlogEntries: Array<{ id: string; query: string; intent: string }>;
    index: PostIndexEntry[];
    recentIntents: string[];
    count: number;
    budget: RunBudget;
    /** Optional SERP grounding pass; off by default. */
    webSearch?: boolean;
}

export function briefSystemPrompt(index: PostIndexEntry[]): string {
    return [
        SYSTEM,
        "",
        capabilityBriefing(),
        "",
        "POSTS THAT ALREADY EXIST — do not propose anything that substantially overlaps one:",
        index.length === 0 ? "  (none yet)" : index.map((entry) => `  - ${entry.title} [${entry.taskIntent}] — ${entry.dek}`).join("\n"),
    ].join("\n");
}

/**
 * Optional grounding pass.
 *
 * Runs as its own call rather than as a tool on the structured call: search
 * results carry citations, and citations cannot be combined with a constrained
 * output format. The notes it produces are fed into the brief call as plain
 * text.
 */
async function groundingNotes(input: BriefInput): Promise<{ notes: string; costUsd: number }> {
    const candidates = [...input.seasonalThemes, ...input.backlogEntries.slice(0, 4).map((entry) => entry.query)].slice(0, 4);

    const { text, costUsd } = await callWithWebSearch({
        model: AUTHOR_MODEL,
        systemStable:
            "You are checking whether a blog topic is worth writing. For each candidate query, search once and report in two lines: " +
            "who currently ranks, and whether the result set is dominated by vendor pages (Adobe, Smallpdf, iLovePDF) or has room for a " +
            "genuinely useful independent guide. Note any form numbers or process details that appear to have changed recently. Be terse.",
        userMessage: `Candidate queries:\n${candidates.map((query) => `- ${query}`).join("\n")}`,
        maxSearches: 2,
        budget: input.budget,
    });

    return { notes: text, costUsd };
}

export async function generateBriefs(input: BriefInput): Promise<{ briefs: Brief[]; costUsd: number }> {
    let costUsd = 0;
    let notes = "";

    if (input.webSearch) {
        try {
            const grounding = await groundingNotes(input);
            notes = grounding.notes;
            costUsd += grounding.costUsd;
        } catch (error) {
            // Grounding is a nice-to-have. A search outage must not cost the
            // week's posts.
            console.log(JSON.stringify({ evt: "blog.brief", level: "warn", message: "grounding pass failed", error: String(error) }));
        }
    }

    const userMessage = [
        `Propose exactly ${input.count} briefs.`,
        "",
        "TRENDING NOW (already filtered for document intent; may be empty):",
        input.trendItems.length ? input.trendItems.map((item) => `  - ${item}`).join("\n") : "  (nothing usable this week)",
        "",
        "NEWS HEADLINES:",
        input.newsItems.length ? input.newsItems.map((item) => `  - ${item}`).join("\n") : "  (nothing usable this week)",
        "",
        "SEASONAL THEMES FOR THIS WEEK:",
        input.seasonalThemes.map((theme) => `  - ${theme}`).join("\n"),
        "",
        "UNUSED EVERGREEN BACKLOG (draw on these freely — most weeks this is where the good briefs come from):",
        input.backlogEntries.map((entry) => `  - [${entry.id}] ${entry.query} (${entry.intent})`).join("\n"),
        "",
        "TASK INTENTS USED IN RECENT WEEKS — diversify away from these:",
        input.recentIntents.length ? input.recentIntents.join(", ") : "(no history yet)",
        notes ? `\nSEARCH NOTES ON CANDIDATE QUERIES:\n${notes}` : "",
    ].join("\n");

    const result = await callStructured({
        model: AUTHOR_MODEL,
        schema: BriefBatchSchema,
        systemStable: briefSystemPrompt(input.index),
        userMessage,
        maxTokens: 12000,
        budget: input.budget,
    });

    return { briefs: result.value.briefs, costUsd: costUsd + result.costUsd };
}
