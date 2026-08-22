import { runPipeline } from "@/lib/blog/pipeline";
import { logEvent } from "@/lib/blog/run-log";

/**
 * The weekly trigger.
 *
 * Vercel sends a GET with `Authorization: Bearer $CRON_SECRET`. Verifying it is
 * not optional — without the check this is a public endpoint that spends API
 * credits for anyone who finds it.
 */

export const dynamic = "force-dynamic";
/** The run takes five to seven minutes; the default function ceiling is far below that. */
export const maxDuration = 800;

function authorised(request: Request): boolean {
    const secret = process.env.CRON_SECRET;
    // Fail closed. A missing secret means the endpoint refuses everything
    // rather than accepting everything.
    if (!secret) return false;

    const header = request.headers.get("authorization");
    return header === `Bearer ${secret}`;
}

export async function GET(request: Request): Promise<Response> {
    if (!authorised(request)) {
        logEvent("blog.cron", { level: "warn", message: "unauthorised request rejected" });
        return new Response("Unauthorized", { status: 401 });
    }

    const dryRun = new URL(request.url).searchParams.get("dryRun") === "true";

    try {
        const { log, pullRequestUrl } = await runPipeline({ dryRun });

        logEvent("blog.cron", {
            runId: log.runId,
            status: log.status,
            published: log.published.length,
            discarded: log.discarded.length,
            costUsd: log.totalCostUsd,
            durationMs: log.durationMs,
        });

        return Response.json({
            runId: log.runId,
            status: log.status,
            published: log.published,
            discarded: log.discarded,
            costUsd: log.totalCostUsd,
            durationMs: log.durationMs,
            pullRequestUrl,
        });
    } catch (error) {
        logEvent("blog.cron", { level: "error", error: String(error) });
        return Response.json({ status: "ERROR", error: String(error) }, { status: 500 });
    }
}
