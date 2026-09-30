"use client";

/**
 * Passing a file between /check-redaction and /redact without it leaving the tab.
 *
 * Both pages are client-side routes of the same app, so a module-level slot
 * survives the navigation — no storage, no URL, no server. The slot is emptied
 * as soon as it is read, so a refresh or a later visit starts clean.
 */

export interface RedactHandoff {
    kind: "redact";
    file: File;
    /** Strings the checker recovered, offered as matches to review (never pre-ticked). */
    phrases: string[];
}

export interface CheckHandoff {
    kind: "check";
    file: File;
}

let pending: RedactHandoff | CheckHandoff | null = null;

export function handOff(value: RedactHandoff | CheckHandoff): void {
    pending = value;
}

export function takeHandoff<K extends (RedactHandoff | CheckHandoff)["kind"]>(kind: K): Extract<RedactHandoff | CheckHandoff, { kind: K }> | null {
    if (!pending || pending.kind !== kind) return null;
    const value = pending as Extract<RedactHandoff | CheckHandoff, { kind: K }>;
    pending = null;
    return value;
}
