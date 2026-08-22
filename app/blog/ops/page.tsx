import type { Metadata } from "next";
import Link from "next/link";

import { getAllRuns } from "@/lib/blog/runs";
import { cx } from "@/utils/cx";

/**
 * Layer two of the visibility story: what shipped, what was blocked, and why.
 *
 * Token-gated and noindex. This is the page you actually look at on a Monday —
 * the run logs are the source of truth, this just renders them.
 */

export const metadata: Metadata = {
    title: "Blog pipeline runs",
    robots: { index: false, follow: false, nocache: true },
};

/** Rendered at request time so the token can be checked against the query string. */
export const dynamic = "force-dynamic";

const OUTCOME_STYLES: Record<string, string> = {
    PUBLISHED: "bg-success-primary text-success-primary ring-success_subtle",
    DISCARDED_PRECHECK: "bg-warning-primary text-warning-primary ring-warning_subtle",
    DISCARDED_REVIEW: "bg-error-primary text-error-primary ring-error_subtle",
    DISCARDED_SCHEMA: "bg-error-primary text-error-primary ring-error_subtle",
    SKIPPED_QUOTA_MET: "bg-secondary text-tertiary ring-secondary",
};

export default async function OpsPage({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
    const { k } = await searchParams;
    const expected = process.env.OPS_TOKEN;

    // Fail closed, exactly as the cron route does.
    if (!expected || k !== expected) {
        return (
            <main className="flex min-h-dvh items-center justify-center bg-secondary px-6">
                <p className="text-sm text-tertiary">Not found.</p>
            </main>
        );
    }

    const runs = getAllRuns();
    const totalPublished = runs.reduce((sum, run) => sum + run.published.length, 0);
    const totalCost = runs.reduce((sum, run) => sum + run.totalCostUsd, 0);

    return (
        <main className="mx-auto min-h-dvh w-full max-w-5xl bg-primary px-4 py-10 sm:px-6">
            <header className="flex flex-wrap items-baseline justify-between gap-3">
                <h1 className="text-display-xs font-semibold text-primary">Pipeline runs</h1>
                <Link href="/blog" className="text-sm font-semibold text-brand-secondary">
                    View the blog
                </Link>
            </header>

            <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                    { label: "Runs", value: String(runs.length) },
                    { label: "Posts published", value: String(totalPublished) },
                    { label: "Total spend", value: `$${totalCost.toFixed(2)}` },
                    { label: "Avg / run", value: runs.length ? `$${(totalCost / runs.length).toFixed(2)}` : "—" },
                ].map((stat) => (
                    <div key={stat.label} className="rounded-xl bg-secondary px-4 py-3">
                        <dt className="text-xs font-medium text-quaternary">{stat.label}</dt>
                        <dd className="mt-0.5 text-xl font-semibold tabular-nums text-primary">{stat.value}</dd>
                    </div>
                ))}
            </dl>

            {runs.length === 0 && <p className="mt-10 rounded-xl bg-secondary px-5 py-8 text-center text-sm text-tertiary">No runs recorded yet.</p>}

            <div className="mt-10 flex flex-col gap-8">
                {runs.map((run) => (
                    <section key={run.runId} className="rounded-xl ring-1 ring-secondary">
                        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary px-4 py-3">
                            <div className="flex items-baseline gap-3">
                                <h2 className="font-semibold text-primary">{run.runId}</h2>
                                <span
                                    className={cx(
                                        "rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
                                        run.status === "OK" ? OUTCOME_STYLES.PUBLISHED : OUTCOME_STYLES.DISCARDED_PRECHECK,
                                    )}
                                >
                                    {run.status}
                                </span>
                                {run.signals.degraded && <span className="text-xs text-warning-primary">signal degraded</span>}
                            </div>
                            <div className="flex gap-4 text-xs text-tertiary tabular-nums">
                                <span>${run.totalCostUsd.toFixed(3)}</span>
                                <span>{Math.round(run.durationMs / 1000)}s</span>
                                <span>
                                    trends {run.signals.trendsSurvivedFilter}/{run.signals.trendsFetched}
                                </span>
                                <span>news {run.signals.newsFetched}</span>
                            </div>
                        </header>

                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-quaternary">
                                    <th className="px-4 py-2 font-medium">Title</th>
                                    <th className="px-4 py-2 font-medium">Origin</th>
                                    <th className="px-4 py-2 font-medium">Outcome</th>
                                    <th className="px-4 py-2 font-medium">Why</th>
                                </tr>
                            </thead>
                            <tbody>
                                {run.drafts.map((draft) => (
                                    <tr key={draft.slug} className="border-t border-secondary align-top">
                                        <td className="px-4 py-2.5">
                                            {draft.outcome === "PUBLISHED" ? (
                                                <Link href={`/blog/${draft.slug}`} className="font-medium text-brand-secondary">
                                                    {draft.title}
                                                </Link>
                                            ) : (
                                                <span className="text-secondary">{draft.title}</span>
                                            )}
                                            {draft.wordCount ? <span className="ml-2 text-xs text-quaternary">{draft.wordCount}w</span> : null}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-tertiary">{draft.signalOrigin}</td>
                                        <td className="px-4 py-2.5">
                                            <span
                                                className={cx(
                                                    "rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
                                                    OUTCOME_STYLES[draft.outcome] ?? OUTCOME_STYLES.SKIPPED_QUOTA_MET,
                                                )}
                                            >
                                                {draft.outcome.replace("DISCARDED_", "")}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-tertiary">
                                            {draft.blockers?.length ? (
                                                <ul className="flex flex-col gap-1">
                                                    {draft.blockers.map((blocker, i) => (
                                                        <li key={i}>
                                                            <span className="font-mono text-[11px] text-error-primary">{blocker.code}</span> {blocker.detail}
                                                            {blocker.quote && <em className="block text-quaternary">&ldquo;{blocker.quote}&rdquo;</em>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : draft.scores ? (
                                                <span className="font-mono text-[11px]">
                                                    u{draft.scores.taskUtility} r{draft.scores.appRelevance} f{draft.scores.factualSafety} o
                                                    {draft.scores.originality} s{draft.scores.styleCompliance} e{draft.scores.evergreen}
                                                </span>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                ))}
            </div>
        </main>
    );
}
