"use client";

import { type PointerEvent as ReactPointerEvent, useCallback, useMemo, useRef, useState } from "react";

import { Crop01, Trash01 } from "@untitledui/icons";

import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { PdfPageCanvas } from "@/components/editor/pdf-page-canvas";
import type { Rect } from "@/lib/extract/types";
import { cx } from "@/utils/cx";

import { useExtract } from "./extract-context";

/** A drag under this many points is a click, not a selection. */
const MIN_DRAG = 6;

function normalise(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
    return {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(a.x - b.x),
        height: Math.abs(a.y - b.y),
    };
}

interface PageProps {
    pageIndex: number;
    scale: number;
}

function Page({ pageIndex, scale }: PageProps) {
    const { active, regions, addRegion, removeRegion, togglePii, displayRotation } = useExtract();
    const surfaceRef = useRef<HTMLDivElement>(null);
    const originRef = useRef<{ x: number; y: number } | null>(null);
    const [draft, setDraft] = useState<Rect | null>(null);

    const page = active?.document.pages[pageIndex];

    const pageRegions = useMemo(() => regions.filter((region) => region.pageIndex === pageIndex), [regions, pageIndex]);
    const pagePii = useMemo(() => (active ? active.pii.filter((match) => match.pageIndex === pageIndex) : []), [active, pageIndex]);

    // Pointer position in display points, which is the space every rect in the
    // app is already stored in — no second coordinate system to convert through.
    const pointAt = useCallback(
        (event: ReactPointerEvent) => {
            const surface = surfaceRef.current;
            if (!surface) return { x: 0, y: 0 };
            const box = surface.getBoundingClientRect();
            return { x: (event.clientX - box.left) / scale, y: (event.clientY - box.top) / scale };
        },
        [scale],
    );

    if (!active || !page) return null;

    const onPointerDown = (event: ReactPointerEvent) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        originRef.current = pointAt(event);
        setDraft(null);
    };

    const onPointerMove = (event: ReactPointerEvent) => {
        const origin = originRef.current;
        if (!origin) return;
        setDraft(normalise(origin, pointAt(event)));
    };

    const onPointerUp = (event: ReactPointerEvent) => {
        const origin = originRef.current;
        originRef.current = null;
        if (!origin) return;

        const rect = normalise(origin, pointAt(event));
        setDraft(null);
        // A stray click should not litter the document with zero-size regions.
        if (rect.width < MIN_DRAG || rect.height < MIN_DRAG) return;

        addRegion({ ...rect, pageIndex, label: `Page ${pageIndex + 1} selection` });
    };

    const styleFor = (rect: Rect) => ({
        left: rect.x * scale,
        top: rect.y * scale,
        width: rect.width * scale,
        height: rect.height * scale,
    });

    return (
        <div className="flex flex-col items-center gap-2">
            <div
                ref={surfaceRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => {
                    originRef.current = null;
                    setDraft(null);
                }}
                data-extract-page={pageIndex}
                className="relative cursor-crosshair touch-none overflow-hidden rounded-lg bg-primary shadow-lg ring-1 ring-secondary select-none"
                style={{ width: page.width * scale, height: page.height * scale }}
            >
                <PdfPageCanvas pdf={active.pdf} pageNumber={pageIndex + 1} scale={scale} rotation={displayRotation(active, pageIndex)} />

                {/* Suspected personal data. Highlighted, never acted on: a tick
                    is the only thing that puts a match on the redaction list. */}
                {pagePii.map((match) => (
                    <button
                        key={match.id}
                        type="button"
                        title={`${match.text} — click to ${match.selected ? "keep" : "redact"}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => togglePii(active.id, match.id)}
                        className={cx(
                            "absolute cursor-pointer rounded-xs transition",
                            match.selected
                                ? "bg-black ring-2 ring-[var(--color-bg-error-solid)]"
                                : "bg-warning-solid/25 ring-1 ring-[var(--color-bg-warning-solid)] hover:bg-warning-solid/40",
                        )}
                        style={styleFor(match.rect)}
                    />
                ))}

                {/* Committed regions. */}
                {pageRegions.map((region, index) => (
                    <div key={region.id} className="absolute border-2 border-brand-solid bg-brand-solid/10" style={styleFor(region)}>
                        <span className="absolute -top-px -left-px bg-brand-solid px-1 text-xs font-semibold text-white">{index + 1}</span>
                        <button
                            type="button"
                            aria-label="Remove this selection"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => removeRegion(region.id)}
                            className="absolute -top-px -right-px cursor-pointer bg-brand-solid p-0.5 text-white"
                        >
                            <Trash01 className="size-3" />
                        </button>
                    </div>
                ))}

                {draft && <div className="pointer-events-none absolute border-2 border-brand-solid border-dashed bg-brand-solid/10" style={styleFor(draft)} />}
            </div>

            <p className="text-xs text-tertiary">
                Page {pageIndex + 1}
                {page.source === "ocr" && ` · read by OCR${page.ocrConfidence ? ` at ${Math.round(page.ocrConfidence)}% confidence` : ""}`}
                {page.source === "none" && " · no text found yet"}
            </p>
        </div>
    );
}

export function PageView({ scale }: { scale: number }) {
    const { active, regions, clearRegions } = useExtract();
    if (!active) return null;

    return (
        <div className="flex min-h-full flex-col items-center gap-6 bg-secondary px-4 py-6">
            {regions.length > 0 && (
                <div className="flex items-center gap-3 rounded-lg bg-primary px-3 py-2 text-sm shadow-xs ring-1 ring-secondary">
                    <Crop01 className="size-4 text-fg-brand-primary" />
                    <span className="font-medium text-secondary">
                        {regions.length} {regions.length === 1 ? "selection" : "selections"} — exports will cover just these.
                    </span>
                    <ButtonUtility size="xs" color="tertiary" icon={Trash01} tooltip="Clear all selections" onClick={clearRegions} />
                </div>
            )}

            {active.document.pages.map((page) => (
                <Page key={page.pageIndex} pageIndex={page.pageIndex} scale={scale} />
            ))}
        </div>
    );
}
