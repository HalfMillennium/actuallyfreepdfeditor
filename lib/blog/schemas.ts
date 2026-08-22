import { z } from "zod";

import { SIGNAL_ORIGINS, TASK_INTENTS } from "./types";

/**
 * Every model output in the pipeline is schema-constrained.
 *
 * Structured output is what lets the code-side gates (section counts, word
 * counts, exactly-one-CTA) run *before* a reviewer call is spent, and it means
 * no part of the pipeline is ever regex-ing free-form markdown for shape.
 */

const slug = z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be lowercase words separated by single hyphens")
    .max(80);

export const BriefSchema = z.object({
    slug,
    workingTitle: z.string().max(70),
    /** The literal string a person types into a search box. */
    targetQuery: z.string().max(120),
    taskIntent: z.enum(TASK_INTENTS),
    signalOrigin: z.enum(SIGNAL_ORIGINS),
    /** The exact trend title or headline this came from; "evergreen backlog" when there is none. */
    signalEvidence: z.string().max(300),
    whyNow: z.string().max(200),
    /** Must argue, not assert, that the article survives 18 months unedited. */
    eighteenMonthTest: z.string().min(40).max(400),
    /** Which capability the closing paragraph will hang on. */
    appHook: z.string().max(200),
    sectionPlan: z
        .array(
            z.object({
                heading: z.string().max(45),
                covers: z.string().max(300),
            }),
        )
        .min(4)
        .max(6),
    /** The place this article will admit the tool, or any tool, is not the answer. */
    honestLimitation: z.string().min(20).max(400),
});

export type Brief = z.infer<typeof BriefSchema>;

export const BriefBatchSchema = z.object({
    briefs: z.array(BriefSchema).min(1).max(8),
});

export const DraftSchema = z.object({
    slug,
    title: z.string().max(70),
    dek: z.string().min(80).max(220),
    tags: z.array(z.string().max(24)).min(2).max(4),
    /** Answers the question immediately; no scene-setting. */
    lede: z.string().min(80),
    sections: z
        .array(
            z.object({
                heading: z.string().max(45),
                body: z.string().min(80),
            }),
        )
        .min(4)
        .max(6),
    /** Caveats and edge cases — the paragraph that makes the rest credible. */
    practicalNotes: z.string().min(80),
    ctaParagraph: z.string().min(60),
    /** Must be a subset of CAPABILITIES.can; checked by set difference. */
    capabilitiesReferenced: z.array(z.string()).max(8),
});

export type Draft = z.infer<typeof DraftSchema>;

export const VIOLATION_CODES = [
    "CAPABILITY_CLAIM",
    "OFF_TOPIC",
    "NO_STANDALONE_UTILITY",
    "DUPLICATE",
    "FACTUAL_RISK",
    "NEWSJACK",
    "CTA_ABUSE",
    "STYLE_VIOLATION",
    "THIN",
] as const;

export const ReviewSchema = z.object({
    scores: z.object({
        taskUtility: z.number().int().min(1).max(5),
        appRelevance: z.number().int().min(1).max(5),
        factualSafety: z.number().int().min(1).max(5),
        originality: z.number().int().min(1).max(5),
        styleCompliance: z.number().int().min(1).max(5),
        evergreen: z.number().int().min(1).max(5),
    }),
    violations: z.array(
        z.object({
            code: z.enum(VIOLATION_CODES),
            severity: z.enum(["blocker", "warning"]),
            detail: z.string().max(400),
            /** The offending span, verbatim, so the run log is auditable. */
            quote: z.string().max(300),
        }),
    ),
    oneLineVerdict: z.string().max(200),
});

export type Review = z.infer<typeof ReviewSchema>;

/** Codes the code-side prechecks can raise, before a reviewer is ever called. */
export const PRECHECK_CODES = [
    "PRECHECK_WORD_COUNT",
    "PRECHECK_CAPABILITY_SET",
    "PRECHECK_CTA_COUNT",
    "PRECHECK_CTA_PLACEMENT",
    "PRECHECK_BANNED_PHRASE",
    "PRECHECK_SLUG_COLLISION",
    "PRECHECK_TITLE_YEAR",
    "PRECHECK_HEADING_SHAPE",
] as const;

export type PrecheckCode = (typeof PRECHECK_CODES)[number];

export type DraftOutcome = "PUBLISHED" | "DISCARDED_PRECHECK" | "DISCARDED_REVIEW" | "DISCARDED_SCHEMA" | "SKIPPED_QUOTA_MET";
