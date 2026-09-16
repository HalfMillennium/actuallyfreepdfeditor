import { createId } from "@/lib/geometry";

import { inReadingOrder } from "./text-layer";
import type { PageText, PiiKind, PiiMatch, Rect, TextItem } from "./types";

/**
 * Finding things worth hiding before a document is shared.
 *
 * Deterministic patterns, run locally. No model, no upload, and — the important
 * part — nothing is ever redacted automatically. The workspace presents matches
 * for review and the user chooses. A false positive that silently blacked out a
 * reference number would be a worse failure than a miss, because the user would
 * not know it had happened.
 */

export const PII_KINDS: PiiKind[] = [
    { id: "email", label: "Email address", severity: "medium" },
    { id: "phone", label: "Phone number", severity: "medium" },
    { id: "ssn", label: "US Social Security number", severity: "high" },
    { id: "card", label: "Payment card number", severity: "high" },
    { id: "iban", label: "IBAN", severity: "high" },
    { id: "ukNino", label: "UK National Insurance number", severity: "high" },
    { id: "postcode", label: "UK postcode", severity: "low" },
    { id: "ip", label: "IP address", severity: "low" },
    { id: "dob", label: "Date of birth", severity: "medium" },
];

interface Detector {
    kind: string;
    pattern: RegExp;
    /** Extra test for patterns loose enough to need one. */
    validate?: (value: string) => boolean;
}

/** Luhn check. Without it, any 16-digit run — an invoice number, an order id — reads as a card. */
function luhn(value: string): boolean {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) return false;

    let sum = 0;
    let double = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let digit = Number(digits[i]);
        if (double) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
        double = !double;
    }
    return sum % 10 === 0;
}

const DETECTORS: Detector[] = [
    { kind: "email", pattern: /\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/gi },
    {
        kind: "phone",
        pattern: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}(?:[\s.-]?\d{3,4})?/g,
        // Require enough digits to be a phone number rather than a year or a total.
        validate: (value) => value.replace(/\D/g, "").length >= 9 && value.replace(/\D/g, "").length <= 15,
    },
    { kind: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
    { kind: "card", pattern: /\b(?:\d[ -]?){13,19}\b/g, validate: luhn },
    { kind: "iban", pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g },
    { kind: "ukNino", pattern: /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi },
    { kind: "postcode", pattern: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi },
    { kind: "ip", pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, validate: (v) => v.split(".").every((o) => Number(o) <= 255) },
    {
        kind: "dob",
        pattern: /\b(?:0?[1-9]|[12]\d|3[01])[/.-](?:0?[1-9]|1[0-2])[/.-](?:19|20)\d{2}\b/g,
    },
];

/**
 * Rebuilds each visual line, then searches it.
 *
 * Matching per text item would miss most real matters: PDFs split a single
 * email address across several items whenever the kerning changes, so
 * `alice@` and `example.com` arrive separately and neither matches alone.
 */
interface LineSpan {
    text: string;
    items: Array<{ item: TextItem; start: number; end: number }>;
}

function buildLines(items: TextItem[]): LineSpan[] {
    const ordered = inReadingOrder(items);
    const lines: LineSpan[] = [];
    let current: LineSpan | null = null;
    let previous: TextItem | null = null;

    for (const item of ordered) {
        const newLine = !previous || Math.abs(previous.y - item.y) >= Math.max(item.height, previous.height) * 0.6;

        if (newLine) {
            current = { text: "", items: [] };
            lines.push(current);
        } else if (current && previous) {
            const gap = item.x - (previous.x + previous.width);
            if (gap > previous.fontSize * 0.3 && !current.text.endsWith(" ")) current.text += " ";
        }

        if (current) {
            const start = current.text.length;
            current.text += item.text;
            current.items.push({ item, start, end: current.text.length });
        }
        previous = item;
    }

    return lines;
}

/** Union of the boxes of every item the match touches. */
function rectFor(line: LineSpan, start: number, end: number): Rect | null {
    const touched = line.items.filter((entry) => entry.end > start && entry.start < end).map((entry) => entry.item);
    if (touched.length === 0) return null;

    const x = Math.min(...touched.map((i) => i.x));
    const y = Math.min(...touched.map((i) => i.y));
    const right = Math.max(...touched.map((i) => i.x + i.width));
    const bottom = Math.max(...touched.map((i) => i.y + i.height));

    return { x, y, width: right - x, height: bottom - y };
}

export function findPii(pages: PageText[]): PiiMatch[] {
    const matches: PiiMatch[] = [];

    for (const page of pages) {
        for (const line of buildLines(page.items)) {
            for (const detector of DETECTORS) {
                detector.pattern.lastIndex = 0;

                for (const match of line.text.matchAll(detector.pattern)) {
                    const value = match[0].trim();
                    if (value.length < 4) continue;
                    if (detector.validate && !detector.validate(value)) continue;

                    const rect = rectFor(line, match.index ?? 0, (match.index ?? 0) + match[0].length);
                    if (!rect) continue;

                    // A card number also matches the loose phone pattern; keep
                    // the more specific finding rather than showing both.
                    const overlapping = matches.find(
                        (existing) =>
                            existing.pageIndex === page.pageIndex &&
                            Math.abs(existing.rect.x - rect.x) < 2 &&
                            Math.abs(existing.rect.y - rect.y) < 2,
                    );
                    if (overlapping) {
                        if (severityRank(detector.kind) > severityRank(overlapping.kind)) {
                            overlapping.kind = detector.kind;
                            overlapping.text = value;
                        }
                        continue;
                    }

                    matches.push({
                        id: createId("pii"),
                        kind: detector.kind,
                        text: value,
                        pageIndex: page.pageIndex,
                        rect,
                        selected: false,
                    });
                }
            }
        }
    }

    return matches;
}

function severityRank(kind: string): number {
    const severity = PII_KINDS.find((entry) => entry.id === kind)?.severity;
    return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

export function summarisePii(matches: PiiMatch[]): Array<{ kind: PiiKind; count: number }> {
    return PII_KINDS.map((kind) => ({ kind, count: matches.filter((m) => m.kind === kind.id).length })).filter((entry) => entry.count > 0);
}
