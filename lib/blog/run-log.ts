import type { DraftOutcome, Review } from "./schemas";
import type { SignalOrigin } from "./types";

/**
 * The run log — layer one of the visibility story, and the important one.
 *
 * It is committed to the repository alongside the posts it produced, so git
 * history *is* the audit trail: every week's decisions sit permanently next to
 * their output and diff against the previous week.
 */

export interface RunLogDraft {
    slug: string;
    title: string;
    outcome: DraftOutcome;
    signalOrigin: SignalOrigin;
    scores?: Review["scores"];
    blockers?: Array<{ code: string; severity?: string; detail: string; quote?: string }>;
    wordCount?: number;
    costUsd: number;
}

export interface RunLog {
    runId: string;
    startedAt: string;
    durationMs: number;
    signals: {
        trendsFetched: number;
        trendsSurvivedFilter: number;
        newsFetched: number;
        seasonalThemes: string[];
        backlogAvailable: number;
        /** Set when both live feeds came back empty and the run leaned on the calendar. */
        degraded: boolean;
    };
    briefs: Array<{
        slug: string;
        workingTitle: string;
        signalOrigin: SignalOrigin;
        signalEvidence: string;
        taskIntent: string;
    }>;
    drafts: RunLogDraft[];
    published: string[];
    discarded: Array<{ slug: string; reason: string }>;
    totalCostUsd: number;
    status: "OK" | "PARTIAL" | "ABORTED" | "NO_COMMIT";
    note?: string;
}

/** The Slack/Discord digest — layer three. */
export function formatDigest(log: RunLog, pullRequestUrl?: string): string {
    const lines: string[] = [
        `Week ${log.runId} · published ${log.published.length} / ${log.drafts.length} drafts · $${log.totalCostUsd.toFixed(2)}`,
    ];

    if (log.signals.degraded) lines.push("(signal degraded — live feeds returned nothing; ran on the seasonal calendar and backlog)");

    if (log.published.length) {
        lines.push("", "PUBLISHED");
        for (const slug of log.published) {
            const draft = log.drafts.find((entry) => entry.slug === slug);
            lines.push(` • ${draft?.title ?? slug}  [${draft?.signalOrigin ?? "?"}]`);
        }
    }

    if (log.discarded.length) {
        lines.push("", "DISCARDED");
        for (const item of log.discarded) {
            const draft = log.drafts.find((entry) => entry.slug === item.slug);
            lines.push(` • ${draft?.title ?? item.slug}  ${item.reason}`);
        }
    }

    if (pullRequestUrl) lines.push("", `Review: ${pullRequestUrl}`);

    return lines.join("\n");
}

export async function sendDigest(log: RunLog, pullRequestUrl?: string): Promise<void> {
    const url = process.env.DIGEST_WEBHOOK_URL;
    if (!url) return;

    try {
        await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            // `text` is what both Slack and Discord read, so one shape serves both.
            body: JSON.stringify({ text: formatDigest(log, pullRequestUrl), content: formatDigest(log, pullRequestUrl) }),
        });
    } catch (error) {
        // A failed digest must never fail a run whose posts already committed.
        console.log(JSON.stringify({ evt: "blog.digest", level: "warn", error: String(error) }));
    }
}

/** One structured line per decision, with a stable `evt`, so Vercel log search works without a drain. */
export function logEvent(evt: string, fields: Record<string, unknown>): void {
    console.log(JSON.stringify({ evt, ...fields }));
}
