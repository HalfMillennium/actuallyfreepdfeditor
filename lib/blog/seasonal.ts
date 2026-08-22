/**
 * ISO week -> document-task themes.
 *
 * This is the source that guarantees the pipeline ships something. Trends and
 * news feeds can both be empty, dead, or full of sport; the calendar never is.
 * Gaps fall back to the nearest earlier week, so partial coverage is fine.
 *
 * Weeks are Northern-hemisphere and US-weighted, because that is where the
 * document-deadline calendar is densest. Refine once a year.
 */
export const SEASONAL: Record<number, string[]> = {
    1: ["W-2 and 1099 forms arriving", "new-year contract renewals", "gym and subscription cancellation forms"],
    3: ["tax document assembly", "charitable donation receipts", "mileage logs"],
    6: ["tax filing forms", "FAFSA priority deadlines", "1098-T tuition statements"],
    9: ["W-4 adjustments", "quarterly estimated tax vouchers"],
    12: ["tax deadline approach", "extension form 4868", "last-minute filing paperwork"],
    15: ["lease signing season", "apartment applications", "co-signer agreements"],
    18: ["summer camp forms", "graduation paperwork", "medical release forms"],
    21: ["internship offer letters", "I-9 and W-4 onboarding", "direct deposit forms"],
    24: ["summer job paperwork", "youth sports waivers", "travel consent letters"],
    27: ["passport and visa applications", "travel insurance claims"],
    30: ["back-to-school forms", "school enrollment packets", "immunisation records"],
    33: ["school permission slips", "syllabus annotation", "student housing agreements"],
    36: ["fall semester paperwork", "scholarship applications"],
    39: ["open enrollment preparation", "benefits comparison worksheets"],
    42: ["open enrollment", "benefits election forms", "HSA and FSA paperwork"],
    45: ["Medicare enrollment", "year-end contract signing", "performance review forms"],
    48: ["year-end invoices", "expense reports", "holiday return labels"],
    51: ["year-end charitable receipts", "next-year budget paperwork", "January renewal notices"],
};

/**
 * ISO-8601 week *and* week-year. Weeks start Monday; week 1 is the one
 * containing the first Thursday of the year.
 *
 * The week-year is not always the calendar year, and that distinction is
 * load-bearing here: 2019-12-30 falls in 2020-W01, so keying a run log by the
 * calendar year would file it as 2019-W01 and collide with the run from the
 * previous January. Both values come from the same Thursday.
 */
export function isoWeekParts(date: Date): { year: number; week: number } {
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    // Shift to the Thursday of this week; that day's calendar year is the ISO
    // week-year by definition.
    const dayNumber = (target.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNumber + 3);

    const year = target.getUTCFullYear();

    const firstThursday = new Date(Date.UTC(year, 0, 4));
    const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);

    return { year, week: 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000)) };
}

/** ISO week number on its own, for the seasonal-theme lookup. */
export function isoWeek(date: Date): number {
    return isoWeekParts(date).week;
}

/** `2026-W35`, the run identifier and the run-log filename. */
export function runId(date: Date): string {
    const { year, week } = isoWeekParts(date);
    return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Themes for a week, falling back to the nearest earlier defined week. */
export function seasonalThemes(week: number): string[] {
    for (let candidate = week; candidate >= 1; candidate--) {
        if (SEASONAL[candidate]) return SEASONAL[candidate];
    }
    // Before the first defined week, wrap to the last one of the previous year.
    const weeks = Object.keys(SEASONAL).map(Number);
    return SEASONAL[Math.max(...weeks)] ?? [];
}
