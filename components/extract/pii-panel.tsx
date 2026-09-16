"use client";

import { useMemo, useState } from "react";

import { AlertCircle, CheckCircle, EyeOff, Shield01 } from "@untitledui/icons";

import { Button } from "@/components/base/buttons/button";
import { downloadBytes } from "@/lib/extract/export";
import { PII_KINDS, summarisePii } from "@/lib/extract/pii";
import type { Rect } from "@/lib/extract/types";
import { loadPdf } from "@/lib/pdf-document";
import type { Rotation } from "@/lib/types";
import { cx } from "@/utils/cx";

import { useExtract } from "./extract-context";

const SEVERITY_CLASS: Record<string, string> = {
    high: "text-error-primary",
    medium: "text-warning-primary",
    low: "text-tertiary",
};

/** Shows enough to recognise a match without reprinting the secret in full. */
function preview(text: string): string {
    const trimmed = text.trim();
    if (trimmed.length <= 8) return trimmed;
    return `${trimmed.slice(0, 4)}…${trimmed.slice(-3)}`;
}

export function PiiPanel() {
    const { active, regions, togglePii, setPiiSelection, displayRotation } = useExtract();
    const [includeRegions, setIncludeRegions] = useState(false);
    const [state, setState] = useState<"idle" | "working" | "done" | "failed">("idle");
    const [note, setNote] = useState<string | null>(null);

    const summary = useMemo(() => (active ? summarisePii(active.pii) : []), [active]);
    const selected = useMemo(() => (active ? active.pii.filter((match) => match.selected) : []), [active]);

    if (!active) return null;

    const totalRedactions = selected.length + (includeRegions ? regions.length : 0);

    const redact = async () => {
        setState("working");
        setNote(null);

        try {
            const rects = new Map<number, Rect[]>();
            const rotations = new Map<number, Rotation>();

            const push = (pageIndex: number, rect: Rect) => {
                const list = rects.get(pageIndex) ?? [];
                list.push(rect);
                rects.set(pageIndex, list);
                rotations.set(pageIndex, displayRotation(active, pageIndex));
            };

            for (const match of selected) push(match.pageIndex, match.rect);
            if (includeRegions) for (const region of regions) push(region.pageIndex, region);

            // pdf-lib is only needed at this moment, so it stays out of the
            // workspace's initial bundle.
            const { redactToPdf, verifyRemoved } = await import("@/lib/extract/redact");

            const bytes = await redactToPdf({ sourceBytes: active.bytes, pdf: active.pdf, redactions: rects, rotations });

            // Prove it before handing it over: re-parse the file we are about to
            // give the user and check the selected strings are actually gone.
            const { clean, survivors } = await verifyRemoved(
                bytes,
                selected.map((match) => match.text),
                async (buffer) => (await loadPdf(buffer)).proxy,
            );

            if (!clean) {
                setState("failed");
                setNote(`${survivors.length} of the selected items are still readable in the output. Nothing was downloaded.`);
                return;
            }

            downloadBytes(bytes, `${active.fileName.replace(/\.pdf$/i, "")}-redacted.pdf`);
            setState("done");
            setNote(
                `${totalRedactions} ${totalRedactions === 1 ? "item" : "items"} removed and verified gone. The redacted pages were rebuilt as images, so the text underneath no longer exists.`,
            );
        } catch (cause) {
            console.error("Redaction failed", cause);
            setState("failed");
            setNote("Something went wrong building the redacted file. Your original is untouched.");
        }
    };

    return (
        <section className="border-t border-secondary p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Shield01 className="size-4 text-fg-brand-primary" />
                Personal data
            </h2>

            {active.pii.length === 0 ? (
                <p className="mt-2 text-xs text-tertiary">
                    Nothing matched the patterns we look for. That is not a guarantee the document is clean — read it yourself, and draw a box over anything
                    else you want gone.
                </p>
            ) : (
                <>
                    <p className="mt-2 text-xs text-tertiary">
                        {active.pii.length} possible {active.pii.length === 1 ? "match" : "matches"}. Nothing is removed until you tick it.
                    </p>

                    <ul className="mt-3 flex flex-col gap-1">
                        {summary.map(({ kind, count }) => {
                            const matches = active.pii.filter((match) => match.kind === kind.id);
                            const allOn = matches.every((match) => match.selected);
                            return (
                                <li key={kind.id}>
                                    <label
                                        data-pii-kind={kind.id}
                                        className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs transition hover:bg-secondary"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={allOn}
                                            onChange={(event) => setPiiSelection(active.id, kind.id, event.target.checked)}
                                            className="accent-[var(--color-bg-brand-solid)]"
                                        />
                                        <span className={cx("flex-1 font-medium", SEVERITY_CLASS[kind.severity])}>{kind.label}</span>
                                        <span className="tabular-nums text-tertiary">{count}</span>
                                    </label>
                                </li>
                            );
                        })}
                    </ul>

                    <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-semibold text-brand-secondary">Review one by one</summary>
                        <ul className="mt-2 flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                            {active.pii.map((match) => (
                                <li key={match.id}>
                                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs transition hover:bg-secondary">
                                        <input
                                            type="checkbox"
                                            checked={match.selected}
                                            onChange={() => togglePii(active.id, match.id)}
                                            className="accent-[var(--color-bg-brand-solid)]"
                                        />
                                        <span className="flex-1 truncate font-mono text-secondary">{preview(match.text)}</span>
                                        <span className="text-tertiary">
                                            p{match.pageIndex + 1} · {PII_KINDS.find((kind) => kind.id === match.kind)?.label ?? match.kind}
                                        </span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    </details>
                </>
            )}

            {regions.length > 0 && (
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-secondary">
                    <input
                        type="checkbox"
                        checked={includeRegions}
                        onChange={(event) => setIncludeRegions(event.target.checked)}
                        className="mt-0.5 accent-[var(--color-bg-brand-solid)]"
                    />
                    <span>
                        Also black out my {regions.length} drawn {regions.length === 1 ? "selection" : "selections"}.
                    </span>
                </label>
            )}

            <Button
                size="sm"
                color="primary"
                iconLeading={EyeOff}
                className="mt-3 w-full"
                isDisabled={totalRedactions === 0}
                isLoading={state === "working"}
                showTextWhileLoading
                onClick={() => void redact()}
            >
                Redact {totalRedactions > 0 ? totalRedactions : ""} and download
            </Button>

            {note && (
                <p
                    role="status"
                    className={cx("mt-2 flex items-start gap-1.5 text-xs", state === "failed" ? "text-error-primary" : "text-success-primary")}
                >
                    {state === "failed" ? <AlertCircle className="mt-px size-3.5 shrink-0" /> : <CheckCircle className="mt-px size-3.5 shrink-0" />}
                    {note}
                </p>
            )}

            <p className="mt-3 text-xs text-tertiary">
                Redacted pages are flattened to images, which makes the file larger and no longer selectable. That is the trade: text you can still select is
                text that was never really removed.
            </p>
        </section>
    );
}
