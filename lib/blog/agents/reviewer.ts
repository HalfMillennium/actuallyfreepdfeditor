import { capabilityBriefing } from "../capabilities";
import { ReviewSchema } from "../schemas";
import type { Review } from "../schemas";
import { STYLE_CONTRACT } from "../style-contract";
import type { PostIndexEntry } from "../types";
import { REVIEWER_MODEL, type RunBudget, callStructured } from "./client";

/**
 * Stage 3b — judges a finished article.
 *
 * Independence is the entire point, so it is enforced by what this function's
 * signature can express rather than by an instruction. It takes the rendered
 * markdown and the same ground truth the author had. It cannot be passed the
 * brief, the signal that produced it, the author's rationale, or any earlier
 * review, because there is no parameter for them.
 *
 * The reviewer scores and cites. It never returns a verdict — `gate()` in
 * `lib/blog/gate.ts` decides. A model asked for a final approve/reject drifts
 * toward approval; a model asked only to score and quote does not.
 */

const SYSTEM = `You are reviewing a draft article for a blog about working with PDFs.
Judge the article exactly as it stands, as a reader would and as a search engine
would. You have no information about how it was written or why this topic was
chosen, and you should not speculate.

Score each dimension 1-5:

  taskUtility     Can a reader finish a real document task after reading this?
                  5 = they can act immediately. 1 = it is commentary.
  appRelevance    Is this genuinely adjacent to editing, signing or handling a
                  PDF? 5 = squarely on. 1 = the connection is a stretch.
  factualSafety   Are all claims accurate and appropriately hedged? Any legal,
                  tax, medical or jurisdictional claim stated as settled fact
                  for the reader's situation caps this at 3. Any claim about
                  the editor that contradicts the capability manifest caps it
                  at 1.
  originality     Does this say something the first page of results does not
                  already say? 5 = a genuine angle. 1 = generic filler.
  styleCompliance Does it follow the style contract?
  evergreen       Would this still be accurate and useful in 18 months with no
                  edits? A year, a current event, a "recently announced", or a
                  price that will move all cap this at 2.

Then list violations. Use "blocker" only for something that must stop
publication; use "warning" for everything else. Quote the offending span
verbatim in the quote field — a violation without a quote is not actionable and
will be treated as noise.

Violation codes:
  CAPABILITY_CLAIM      attributes a feature the editor does not have
  OFF_TOPIC             the task is not PDF or document adjacent
  NO_STANDALONE_UTILITY commentary rather than something a reader can act on
  DUPLICATE             heavy overlap with an existing post
  FACTUAL_RISK          legal, tax or medical claim stated as fact
  NEWSJACK              depends on a current event to make sense
  CTA_ABUSE             more than one mention, wrong placement, or a sales tone
  STYLE_VIOLATION       breaks the style contract
  THIN                  padded; says nothing a reader can use

Be strict. It costs nothing to reject an article; publishing a bad one costs the
blog's credibility, and there is always next week.`;

export function reviewerSystemPrompt(index: PostIndexEntry[]): string {
    return [
        SYSTEM,
        "",
        capabilityBriefing(),
        "",
        "THE STYLE CONTRACT THE ARTICLE IS BEING HELD TO:",
        STYLE_CONTRACT,
        "",
        "POSTS THAT ALREADY EXIST — flag DUPLICATE if this substantially repeats one:",
        index.length === 0 ? "  (none yet)" : index.map((entry) => `  - ${entry.title} — ${entry.dek}`).join("\n"),
    ].join("\n");
}

/**
 * @param renderedArticle The finished markdown — the only thing about this
 *   specific draft the reviewer is allowed to see.
 */
export async function reviewArticle({
    renderedArticle,
    index,
    budget,
}: {
    renderedArticle: string;
    index: PostIndexEntry[];
    budget: RunBudget;
}): Promise<{ review: Review; costUsd: number }> {
    const result = await callStructured({
        model: REVIEWER_MODEL,
        schema: ReviewSchema,
        systemStable: reviewerSystemPrompt(index),
        userMessage: `Review this article.\n\n---\n${renderedArticle}\n---`,
        maxTokens: 4000,
        budget,
    });

    return { review: result.value, costUsd: result.costUsd };
}
