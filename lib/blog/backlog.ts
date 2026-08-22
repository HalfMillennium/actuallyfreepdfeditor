import type { TaskIntent } from "./types";

/**
 * Evergreen queries we already believe convert.
 *
 * This is the floor of the pipeline, not its fallback of last resort. Most
 * weeks the trend feed yields nothing usable and the brief agent draws from
 * here — that is correct behaviour, not a failure. A backlog article beats a
 * forced trend-to-task bridge every time.
 *
 * `used` is flipped by the commit step and written back in the same commit as
 * the post, so the repo is the only state store.
 */
export interface BacklogEntry {
    id: string;
    query: string;
    intent: TaskIntent;
    volume: "high" | "medium" | "low";
    used: boolean;
    /** Set by the commit step, so a glance at the file shows what shipped when. */
    usedInRun?: string;
}

export const BACKLOG: BacklogEntry[] = [
    { id: "bl-001", query: "how to sign a pdf without adobe", intent: "signing", volume: "high", used: false },
    { id: "bl-002", query: "how to sign a pdf on your phone", intent: "signing", volume: "high", used: false },
    { id: "bl-003", query: "how to add a signature to a pdf on a mac", intent: "signing", volume: "high", used: false },
    { id: "bl-004", query: "how to type in a pdf form", intent: "add-text", volume: "high", used: false },
    { id: "bl-005", query: "why can't i type in this pdf", intent: "troubleshooting", volume: "high", used: false },
    { id: "bl-006", query: "how to remove a page from a pdf without adobe", intent: "page-management", volume: "high", used: false },
    { id: "bl-007", query: "how to reorder pages in a pdf", intent: "page-management", volume: "high", used: false },
    { id: "bl-008", query: "how to rotate a pdf and save it", intent: "page-management", volume: "high", used: false },
    { id: "bl-009", query: "how to black out text in a pdf", intent: "redaction", volume: "high", used: false },
    { id: "bl-010", query: "what does redaction actually mean in a pdf", intent: "redaction", volume: "medium", used: false },
    { id: "bl-011", query: "how to highlight a pdf for free", intent: "annotation", volume: "medium", used: false },
    { id: "bl-012", query: "how to fill out a pdf form on a chromebook", intent: "add-text", volume: "medium", used: false },
    { id: "bl-013", query: "how to date and initial a pdf", intent: "signing", volume: "medium", used: false },
    { id: "bl-014", query: "is a drawn signature on a pdf legally binding", intent: "signing", volume: "high", used: false },
    { id: "bl-015", query: "how to sign a lease pdf", intent: "signing", volume: "high", used: false },
    { id: "bl-016", query: "how to fill out a w-9 pdf", intent: "add-text", volume: "high", used: false },
    { id: "bl-017", query: "how to sign a school permission slip online", intent: "signing", volume: "medium", used: false },
    { id: "bl-018", query: "how to edit a scanned pdf", intent: "troubleshooting", volume: "high", used: false },
    { id: "bl-019", query: "how to tell if a pdf is a scan", intent: "troubleshooting", volume: "medium", used: false },
    { id: "bl-020", query: "the things people pay acrobat for", intent: "comparison", volume: "medium", used: false },
    { id: "bl-021", query: "free alternatives to adobe acrobat", intent: "comparison", volume: "high", used: false },
    { id: "bl-022", query: "is it safe to upload a pdf to a free editor", intent: "file-handling", volume: "high", used: false },
    { id: "bl-023", query: "how to open a pdf that won't open", intent: "access-and-viewing", volume: "medium", used: false },
    { id: "bl-024", query: "how to whiteout text in a pdf", intent: "redaction", volume: "medium", used: false },
    { id: "bl-025", query: "how to add a photo of your signature to a document", intent: "signing", volume: "medium", used: false },
    { id: "bl-026", query: "how to sign a pdf without printing it", intent: "signing", volume: "high", used: false },
    { id: "bl-027", query: "how to fill in a pdf that has no form fields", intent: "add-text", volume: "high", used: false },
    { id: "bl-028", query: "how to duplicate a page in a pdf", intent: "page-management", volume: "low", used: false },
    { id: "bl-029", query: "how to delete blank pages from a scanned pdf", intent: "page-management", volume: "medium", used: false },
    { id: "bl-030", query: "how to annotate a pdf for a class", intent: "annotation", volume: "medium", used: false },
    { id: "bl-031", query: "how to mark up a contract before sending it back", intent: "annotation", volume: "medium", used: false },
    { id: "bl-032", query: "how to fix an upside down pdf page", intent: "page-management", volume: "medium", used: false },
    { id: "bl-033", query: "how to sign a pdf on an ipad", intent: "signing", volume: "high", used: false },
    { id: "bl-034", query: "how to sign a pdf on android", intent: "signing", volume: "high", used: false },
    { id: "bl-035", query: "pdf editor with no watermark", intent: "comparison", volume: "high", used: false },
    { id: "bl-036", query: "pdf editor that doesn't need an account", intent: "comparison", volume: "medium", used: false },
    { id: "bl-037", query: "how to fill out a rental application pdf", intent: "add-text", volume: "medium", used: false },
    { id: "bl-038", query: "how to sign an i-9 form", intent: "signing", volume: "medium", used: false },
    { id: "bl-039", query: "how to add text to a pdf on windows without software", intent: "add-text", volume: "high", used: false },
    { id: "bl-040", query: "how to cover up an address on a document", intent: "redaction", volume: "medium", used: false },
    { id: "bl-041", query: "how to hide a bank account number on a statement", intent: "redaction", volume: "high", used: false },
    { id: "bl-042", query: "how to fill out a medical release form pdf", intent: "add-text", volume: "medium", used: false },
    { id: "bl-043", query: "how to sign a pdf sent by email", intent: "signing", volume: "high", used: false },
    { id: "bl-044", query: "why is my pdf signature blurry", intent: "troubleshooting", volume: "low", used: false },
    { id: "bl-045", query: "how to make a signature look good on a laptop trackpad", intent: "signing", volume: "medium", used: false },
    { id: "bl-046", query: "how to fill out a pdf without changing the formatting", intent: "add-text", volume: "medium", used: false },
    { id: "bl-047", query: "what to do when a pdf is password protected", intent: "access-and-viewing", volume: "high", used: false },
    { id: "bl-048", query: "how to print only some pages of a pdf", intent: "page-management", volume: "medium", used: false },
    { id: "bl-049", query: "how to sign a contract you were emailed as a photo", intent: "signing", volume: "low", used: false },
    { id: "bl-050", query: "how to add initials to every page of a pdf", intent: "signing", volume: "medium", used: false },
    { id: "bl-051", query: "how to fill in a pdf timesheet", intent: "add-text", volume: "low", used: false },
    { id: "bl-052", query: "how to correct a mistake on a signed pdf", intent: "troubleshooting", volume: "medium", used: false },
    { id: "bl-053", query: "how to attach a photo to a claim form", intent: "file-handling", volume: "medium", used: false },
    { id: "bl-054", query: "how to fill out a pdf on a school chromebook", intent: "add-text", volume: "medium", used: false },
    { id: "bl-055", query: "how to sign a document without a printer or scanner", intent: "signing", volume: "high", used: false },
    { id: "bl-056", query: "what file size is too big to email", intent: "file-handling", volume: "medium", used: false },
    { id: "bl-057", query: "how to fill out a direct deposit form", intent: "add-text", volume: "medium", used: false },
    { id: "bl-058", query: "how to read a pdf that opens as a blank page", intent: "access-and-viewing", volume: "medium", used: false },
    { id: "bl-059", query: "how to sign a pdf twice for two people", intent: "signing", volume: "low", used: false },
    { id: "bl-060", query: "how to add a date stamp to a scanned form", intent: "add-text", volume: "low", used: false },
];

export function unusedBacklog(limit = 12): BacklogEntry[] {
    // Highest-volume first: the brief agent sees the best remaining options,
    // not whatever happens to sit at the top of the file.
    const rank = { high: 0, medium: 1, low: 2 } as const;
    return BACKLOG.filter((entry) => !entry.used)
        .sort((a, b) => rank[a.volume] - rank[b.volume])
        .slice(0, limit);
}
