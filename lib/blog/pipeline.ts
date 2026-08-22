import { generateBriefs } from "./agents/brief";
import { writeDraft } from "./agents/author";
import { RunBudget, RunBudgetExceeded, SchemaFailure } from "./agents/client";
import { reviewArticle } from "./agents/reviewer";
import { BACKLOG, unusedBacklog } from "./backlog";
import { commitFiles, markBacklogUsed, readPostIndex, readRepoFile } from "./commit";
import { gate } from "./gate";
import { countWords, precheckDraft } from "./precheck";
import { postFilename, renderPost, toIndexEntry } from "./render";
import { type RunLog, type RunLogDraft, logEvent, sendDigest } from "./run-log";
import type { Brief } from "./schemas";
import { isoWeek, runId as runIdFor, seasonalThemes } from "./seasonal";
import { fetchNewsSignals, formatNewsSignal } from "./sources/news";
import { fetchTrendSignals, formatTrendSignal } from "./sources/trends";
import type { PostIndexEntry } from "./types";

/**
 * Stages 1 through 5, in order.
 *
 * Two rules shape the whole thing:
 *   - A failing draft is discarded, never revised. Revision loops are how a
 *     pipeline talks itself into publishing what the reviewer already rejected.
 *   - Nothing partial reaches the repository. The run either commits all its
 *     posts and its log in one commit, or commits nothing at all.
 */

export interface PipelineOptions {
    /** Skips the commit and returns what it would have written. */
    dryRun?: boolean;
    now?: Date;
}

export interface PipelineResult {
    log: RunLog;
    pullRequestUrl?: string;
    files?: Array<{ path: string; content: string }>;
}

function envInt(name: string, fallback: number): number {
    const parsed = Number(process.env[name]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function runPipeline(options: PipelineOptions = {}): Promise<PipelineResult> {
    const startedAt = options.now ?? new Date();
    const runId = runIdFor(startedAt);
    const started = Date.now();

    const postsPerWeek = envInt("POSTS_PER_WEEK", 3);
    const maxDrafts = envInt("MAX_DRAFTS_PER_RUN", 6);
    const budget = new RunBudget(Number(process.env.MAX_RUN_COST_USD) || 2);
    const autoMerge = process.env.AUTO_MERGE === "true";

    /* -- Stage 1: signals ------------------------------------------------- */

    const week = isoWeek(startedAt);
    const themes = seasonalThemes(week);

    const [trends, news] = await Promise.all([fetchTrendSignals(), fetchNewsSignals()]);
    const backlog = unusedBacklog(12);
    const degraded = trends.fetched === 0 && news.fetched === 0;

    if (degraded) {
        // Never a reason to abort: the calendar and the backlog are the floor.
        logEvent("blog.signal", { level: "warn", runId, message: "SIGNAL_DEGRADED — both live feeds empty" });
    }

    logEvent("blog.signal", {
        runId,
        trendsFetched: trends.fetched,
        trendsSurvived: trends.signals.length,
        newsFetched: news.fetched,
        backlogAvailable: BACKLOG.filter((entry) => !entry.used).length,
    });

    /* -- Stage 2: briefs -------------------------------------------------- */

    const index: PostIndexEntry[] = await readPostIndex().catch(() => []);
    const recentIntents = index.slice(0, 12).map((entry) => entry.taskIntent);

    const log: RunLog = {
        runId,
        startedAt: startedAt.toISOString(),
        durationMs: 0,
        signals: {
            trendsFetched: trends.fetched,
            trendsSurvivedFilter: trends.signals.length,
            newsFetched: news.fetched,
            seasonalThemes: themes,
            backlogAvailable: BACKLOG.filter((entry) => !entry.used).length,
            degraded,
        },
        briefs: [],
        drafts: [],
        published: [],
        discarded: [],
        totalCostUsd: 0,
        status: "OK",
    };

    let briefs: Brief[] = [];
    try {
        const result = await generateBriefs({
            trendItems: trends.signals.map(formatTrendSignal),
            newsItems: news.signals.map(formatNewsSignal),
            seasonalThemes: themes,
            backlogEntries: backlog.map(({ id, query, intent }) => ({ id, query, intent })),
            index,
            recentIntents,
            count: maxDrafts,
            budget,
            webSearch: process.env.BLOG_WEB_SEARCH === "true",
        });
        briefs = result.briefs;
    } catch (error) {
        log.status = "ABORTED";
        log.note = `Brief stage failed: ${String(error)}`;
        log.totalCostUsd = budget.total;
        log.durationMs = Date.now() - started;
        logEvent("blog.brief", { runId, level: "error", error: String(error) });
        return { log };
    }

    log.briefs = briefs.map((brief) => ({
        slug: brief.slug,
        workingTitle: brief.workingTitle,
        signalOrigin: brief.signalOrigin,
        signalEvidence: brief.signalEvidence,
        taskIntent: brief.taskIntent,
    }));

    logEvent("blog.brief", { runId, count: briefs.length, origins: briefs.map((b) => b.signalOrigin) });

    /* -- Stage 3: write, check, review ------------------------------------ */

    const workingIndex = [...index];
    const published: Array<{ brief: Brief; markdown: string; entry: PostIndexEntry; filename: string }> = [];
    const date = startedAt.toISOString().slice(0, 10);

    for (const brief of briefs) {
        if (published.length >= postsPerWeek) {
            log.drafts.push({ slug: brief.slug, title: brief.workingTitle, outcome: "SKIPPED_QUOTA_MET", signalOrigin: brief.signalOrigin, costUsd: 0 });
            continue;
        }

        const record: RunLogDraft = { slug: brief.slug, title: brief.workingTitle, outcome: "DISCARDED_SCHEMA", signalOrigin: brief.signalOrigin, costUsd: 0 };

        try {
            const { draft, costUsd } = await writeDraft({ brief, index: workingIndex, budget });
            record.costUsd += costUsd;
            record.title = draft.title;
            record.slug = draft.slug;
            record.wordCount = countWords(draft);

            // Deterministic gates first — they are free and they are definite.
            const failures = precheckDraft(draft, workingIndex);
            if (failures.length > 0) {
                record.outcome = "DISCARDED_PRECHECK";
                record.blockers = failures.map((failure) => ({ code: failure.code, detail: failure.detail, quote: failure.quote }));
                log.drafts.push(record);
                log.discarded.push({ slug: draft.slug, reason: failures[0].code });
                logEvent("blog.draft", { runId, slug: draft.slug, outcome: record.outcome, codes: failures.map((f) => f.code) });
                continue;
            }

            const markdown = renderPost({ draft, brief, date, runId });

            // The reviewer sees the finished article and the ground truth, and
            // nothing else — not the brief, not the signal, not why this topic
            // was chosen.
            const { review, costUsd: reviewCost } = await reviewArticle({ renderedArticle: markdown, index: workingIndex, budget });
            record.costUsd += reviewCost;
            record.scores = review.scores;

            const verdict = gate(review);
            if (!verdict.passes) {
                record.outcome = "DISCARDED_REVIEW";
                record.blockers = [
                    ...review.violations
                        .filter((violation) => violation.severity === "blocker")
                        .map((violation) => ({ code: violation.code, severity: violation.severity, detail: violation.detail, quote: violation.quote })),
                    ...verdict.reasons.filter((reason) => reason.includes("scored")).map((reason) => ({ code: "SCORE_BELOW_THRESHOLD", detail: reason })),
                ];
                log.drafts.push(record);
                log.discarded.push({ slug: draft.slug, reason: record.blockers[0]?.code ?? "SCORE_BELOW_THRESHOLD" });
                logEvent("blog.review", { runId, slug: draft.slug, outcome: record.outcome, reasons: verdict.reasons });
                // Discard, do not revise. Next brief.
                continue;
            }

            const entry = toIndexEntry(draft, brief, date);
            published.push({ brief, markdown, entry, filename: postFilename(draft.slug, date) });
            workingIndex.unshift(entry);

            record.outcome = "PUBLISHED";
            log.drafts.push(record);
            log.published.push(draft.slug);
            logEvent("blog.review", { runId, slug: draft.slug, outcome: "PUBLISHED", scores: review.scores });
        } catch (error) {
            if (error instanceof RunBudgetExceeded) {
                log.status = "ABORTED";
                log.note = String(error);
                log.drafts.push(record);
                logEvent("blog.draft", { runId, level: "error", error: String(error) });
                break;
            }

            record.outcome = "DISCARDED_SCHEMA";
            record.blockers = [{ code: error instanceof SchemaFailure ? "SCHEMA_MISMATCH" : "AGENT_ERROR", detail: String(error) }];
            log.drafts.push(record);
            log.discarded.push({ slug: brief.slug, reason: record.blockers[0].code });
            logEvent("blog.draft", { runId, slug: brief.slug, level: "error", error: String(error) });
        }
    }

    log.totalCostUsd = Number(budget.total.toFixed(4));
    log.durationMs = Date.now() - started;

    if (log.status !== "ABORTED") {
        log.status = published.length === 0 ? "NO_COMMIT" : published.length < postsPerWeek ? "PARTIAL" : "OK";
    }

    /* -- Stage 4: one commit, or none ------------------------------------- */

    if (published.length === 0) {
        logEvent("blog.commit", { runId, skipped: true, reason: "nothing passed review" });
        await sendDigest(log);
        return { log };
    }

    const files = [
        ...published.map((item) => ({ path: `content/blog/posts/${item.filename}`, content: item.markdown })),
        { path: "content/blog/index.json", content: JSON.stringify(workingIndex, null, 2) + "\n" },
        { path: `content/blog/_runs/${runId}.json`, content: JSON.stringify(log, null, 2) + "\n" },
    ];

    // Backlog flags travel in the same commit, so a consumed query can never be
    // re-used by a later run even if the site fails to rebuild.
    const consumedIds = backlog
        .filter((entry) => published.some(({ brief }) => brief.signalOrigin === "backlog" && brief.targetQuery.includes(entry.query.slice(0, 20))))
        .map((entry) => entry.id);

    if (consumedIds.length > 0) {
        const source = await readRepoFile("lib/blog/backlog.ts");
        if (source) files.push({ path: "lib/blog/backlog.ts", content: markBacklogUsed(source, consumedIds, runId) });
    }

    if (options.dryRun) {
        logEvent("blog.commit", { runId, dryRun: true, files: files.map((file) => file.path) });
        return { log, files };
    }

    const titles = published.map((item) => `- ${item.entry.title}`).join("\n");
    const commit = await commitFiles({
        files,
        message: `blog: ${published.length} post${published.length === 1 ? "" : "s"} for ${runId}\n\n${titles}\n`,
        autoMerge,
        branchName: `blog/auto-${runId}`,
    });

    logEvent("blog.commit", { runId, sha: commit.commitSha, branch: commit.branch, pr: commit.pullRequestUrl });

    await sendDigest(log, commit.pullRequestUrl);

    return { log, pullRequestUrl: commit.pullRequestUrl };
}
