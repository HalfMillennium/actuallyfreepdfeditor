import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { RunLog } from "./run-log";

/** Reads the committed run logs at build time, for the ops dashboard. */
export function getAllRuns(): RunLog[] {
    const dir = join(process.cwd(), "content", "blog", "_runs");

    let filenames: string[];
    try {
        filenames = readdirSync(dir).filter((name) => name.endsWith(".json"));
    } catch {
        return [];
    }

    const runs: RunLog[] = [];
    for (const filename of filenames) {
        try {
            runs.push(JSON.parse(readFileSync(join(dir, filename), "utf8")) as RunLog);
        } catch {
            // A malformed log should not take the dashboard down with it.
        }
    }

    return runs.sort((a, b) => b.runId.localeCompare(a.runId));
}
