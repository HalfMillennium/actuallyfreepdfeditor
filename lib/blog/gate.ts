import type { Review } from "./schemas";

/**
 * The publish decision.
 *
 * Computed here, in code, from the reviewer's scores — never read off a verdict
 * field the model wrote. That separation is what keeps the gate from drifting:
 * the reviewer's job is to observe and cite, and this function's job is to
 * decide, and neither can quietly take over the other.
 */

export interface GateResult {
    passes: boolean;
    reasons: string[];
}

/**
 * `factualSafety` must be a clean 5.
 *
 * Deliberately absolute rather than >= 4. Tax and legal adjacency is where an
 * unattended blog does real damage, and a 4 means the reviewer saw something.
 */
export const THRESHOLDS = {
    taskUtility: 4,
    appRelevance: 4,
    factualSafety: 5,
    evergreen: 4,
    originality: 3,
    styleCompliance: 3,
} as const;

export function gate(review: Review): GateResult {
    const reasons: string[] = [];

    for (const blocker of review.violations.filter((violation) => violation.severity === "blocker")) {
        reasons.push(`${blocker.code}: ${blocker.detail}`);
    }

    for (const [dimension, minimum] of Object.entries(THRESHOLDS) as Array<[keyof typeof THRESHOLDS, number]>) {
        const score = review.scores[dimension];
        if (score < minimum) reasons.push(`${dimension} scored ${score}, needs ${minimum}`);
    }

    return { passes: reasons.length === 0, reasons };
}
