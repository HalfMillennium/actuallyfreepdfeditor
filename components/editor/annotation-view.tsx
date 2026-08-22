"use client";

import { type CSSProperties, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { FONTS, LINE_HEIGHT_RATIO } from "@/lib/fonts";
import { clampBoxToPage } from "@/lib/geometry";
import type { Annotation, TextAnnotation } from "@/lib/types";
import { cx } from "@/utils/cx";

/** Corner handles, named by the corner they pin. */
const HANDLES = [
    { id: "nw", className: "-top-1.5 -left-1.5 cursor-nwse-resize" },
    { id: "ne", className: "-top-1.5 -right-1.5 cursor-nesw-resize" },
    { id: "sw", className: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
    { id: "se", className: "-right-1.5 -bottom-1.5 cursor-nwse-resize" },
] as const;

type HandleId = (typeof HANDLES)[number]["id"];

const MIN_SIZE = 12;

interface Props {
    annotation: Annotation;
    zoom: number;
    isSelected: boolean;
    pageWidth: number;
    pageHeight: number;
    interactive: boolean;
    /** Newly-created text: open straight into edit mode instead of making the user double-click. */
    autoEdit?: boolean;
    onAutoEditConsumed?: () => void;
    onSelect: (id: string) => void;
    onCheckpoint: () => void;
    onChange: (id: string, patch: Partial<Annotation>, transient: boolean) => void;
    onDelete: (id: string) => void;
}

export function AnnotationView({
    annotation,
    zoom,
    isSelected,
    pageWidth,
    pageHeight,
    interactive,
    autoEdit = false,
    onAutoEditConsumed,
    onSelect,
    onCheckpoint,
    onChange,
    onDelete,
}: Props) {
    const [isEditingText, setIsEditingText] = useState(autoEdit);
    const gesture = useRef<{ handle: HandleId | "move"; startX: number; startY: number; box: Annotation; checkpointed: boolean } | null>(null);

    const style: CSSProperties = {
        left: annotation.x * zoom,
        top: annotation.y * zoom,
        width: annotation.width * zoom,
        height: annotation.height * zoom,
    };

    const beginGesture = useCallback(
        (event: ReactPointerEvent, handle: HandleId | "move") => {
            if (!interactive) return;
            event.stopPropagation();
            event.preventDefault();

            (event.target as HTMLElement).setPointerCapture(event.pointerId);
            gesture.current = { handle, startX: event.clientX, startY: event.clientY, box: annotation, checkpointed: false };
            document.body.classList.add("afpe-dragging");

            onSelect(annotation.id);
            // The undo checkpoint waits for actual movement (see below): simply
            // clicking an annotation to select it should not spend an undo step.
        },
        [annotation, interactive, onSelect, onCheckpoint],
    );

    const handlePointerMove = useCallback(
        (event: ReactPointerEvent) => {
            const active = gesture.current;
            if (!active) return;

            // Pointer deltas arrive in CSS pixels; annotations live in points.
            const dx = (event.clientX - active.startX) / zoom;
            const dy = (event.clientY - active.startY) / zoom;
            const { box } = active;

            if (!active.checkpointed) {
                // Ignore the pixel or two of drift a plain click produces, then
                // record one checkpoint for the whole gesture.
                if (Math.abs(dx) * zoom < 2 && Math.abs(dy) * zoom < 2) return;
                active.checkpointed = true;
                onCheckpoint();
            }

            if (active.handle === "move") {
                onChange(annotation.id, clampBoxToPage({ ...box, x: box.x + dx, y: box.y + dy }, pageWidth, pageHeight), true);
                return;
            }

            const keepsAspect = annotation.kind === "signature" || annotation.kind === "image";
            let { x, y, width, height } = box;

            if (active.handle === "nw" || active.handle === "sw") {
                width = box.width - dx;
                x = box.x + dx;
            } else {
                width = box.width + dx;
            }

            if (active.handle === "nw" || active.handle === "ne") {
                height = box.height - dy;
                y = box.y + dy;
            } else {
                height = box.height + dy;
            }

            width = Math.max(MIN_SIZE, width);
            height = Math.max(MIN_SIZE, height);

            if (keepsAspect) {
                // Drive both dimensions from the larger change so the image
                // never distorts, then re-pin whichever corner is anchored.
                const ratio = box.width / box.height;
                if (Math.abs(width - box.width) > Math.abs(height - box.height)) {
                    height = width / ratio;
                } else {
                    width = height * ratio;
                }
                if (active.handle === "nw" || active.handle === "sw") x = box.x + box.width - width;
                if (active.handle === "nw" || active.handle === "ne") y = box.y + box.height - height;
            }

            const patch: Partial<Annotation> = { x, y, width, height };
            // Text is laid out from its font size, so scaling the box should
            // scale the type with it rather than just re-wrapping.
            if (annotation.kind === "text") {
                const scaled = (annotation.fontSize * height) / box.height;
                (patch as Partial<TextAnnotation>).fontSize = Math.max(4, Math.round(scaled * 10) / 10);
            }

            onChange(annotation.id, patch, true);
        },
        [annotation, onChange, onCheckpoint, pageHeight, pageWidth, zoom],
    );

    const endGesture = useCallback(
        (event: ReactPointerEvent) => {
            if (!gesture.current) return;
            gesture.current = null;
            document.body.classList.remove("afpe-dragging");
            try {
                (event.target as HTMLElement).releasePointerCapture(event.pointerId);
            } catch {
                /* the capture may already have been lost */
            }
        },
        [],
    );

    useEffect(() => {
        if (!isSelected) setIsEditingText(false);
    }, [isSelected]);

    useEffect(() => {
        if (autoEdit) onAutoEditConsumed?.();
        // Deliberately mount-only: this consumes a one-shot flag, and re-running
        // it would drop the user back into edit mode on any later re-render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /**
     * A text box the user clicked into but never typed in is invisible and
     * un-clickable, so tidy it away rather than leaving litter on the page.
     */
    const stopEditing = useCallback(() => {
        setIsEditingText(false);
        if (annotation.kind === "text" && annotation.text.trim() === "") onDelete(annotation.id);
    }, [annotation, onDelete]);

    return (
        <div
            role="button"
            tabIndex={interactive ? 0 : -1}
            aria-label={describe(annotation)}
            className={cx(
                "absolute",
                interactive ? "cursor-grab" : "pointer-events-none",
                isSelected && "afpe-selected z-10",
                isEditingText && "cursor-text",
            )}
            style={style}
            onPointerDown={(event) => {
                if (isEditingText) return;
                beginGesture(event, "move");
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
            onDoubleClick={() => annotation.kind === "text" && interactive && setIsEditingText(true)}
            onKeyDown={(event) => {
                if (!interactive) return;
                if (event.key === "Delete" || event.key === "Backspace") {
                    if (isEditingText) return;
                    event.preventDefault();
                    onDelete(annotation.id);
                    return;
                }
                if (event.key === "Enter" && annotation.kind === "text") {
                    event.preventDefault();
                    setIsEditingText(true);
                    return;
                }
                const step = event.shiftKey ? 10 : 1;
                const nudges: Record<string, [number, number]> = {
                    ArrowLeft: [-step, 0],
                    ArrowRight: [step, 0],
                    ArrowUp: [0, -step],
                    ArrowDown: [0, step],
                };
                const nudge = nudges[event.key];
                if (nudge) {
                    event.preventDefault();
                    onCheckpoint();
                    onChange(
                        annotation.id,
                        clampBoxToPage({ ...annotation, x: annotation.x + nudge[0], y: annotation.y + nudge[1] }, pageWidth, pageHeight),
                        true,
                    );
                }
            }}
        >
            <AnnotationBody annotation={annotation} zoom={zoom} isEditing={isEditingText} onChange={onChange} onStopEditing={stopEditing} />

            {isSelected && interactive && !isEditingText && (
                <>
                    {HANDLES.map((handle) => (
                        <span
                            key={handle.id}
                            className={cx("absolute size-3 rounded-full border-2 border-white bg-brand-solid shadow-sm", handle.className)}
                            onPointerDown={(event) => beginGesture(event, handle.id)}
                            onPointerMove={handlePointerMove}
                            onPointerUp={endGesture}
                            onPointerCancel={endGesture}
                        />
                    ))}
                </>
            )}
        </div>
    );
}

function describe(annotation: Annotation): string {
    switch (annotation.kind) {
        case "text":
            return `Text: ${annotation.text.slice(0, 40) || "empty"}`;
        case "signature":
            return "Signature";
        case "image":
            return "Image";
        case "highlight":
            return "Highlight";
        case "whiteout":
            return "White-out block";
        case "draw":
            return "Drawing";
    }
}

interface BodyProps {
    annotation: Annotation;
    zoom: number;
    isEditing: boolean;
    onChange: (id: string, patch: Partial<Annotation>, transient: boolean) => void;
    onStopEditing: () => void;
}

function AnnotationBody({ annotation, zoom, isEditing, onChange, onStopEditing }: BodyProps) {
    switch (annotation.kind) {
        case "highlight":
        case "whiteout":
            return <div className="size-full" style={{ backgroundColor: annotation.color, opacity: annotation.opacity }} />;

        case "signature":
        case "image":
            // eslint-disable-next-line @next/next/no-img-element -- the source is an in-memory data URL, not a served asset.
            return <img src={annotation.dataUrl} alt="" draggable={false} className="size-full object-fill select-none" />;

        case "draw":
            return (
                <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="size-full overflow-visible">
                    <polyline
                        points={annotation.points.map(([x, y]) => `${x},${y}`).join(" ")}
                        fill="none"
                        stroke={annotation.color}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        // The viewBox is a unit square stretched to the box, so
                        // an ordinary stroke width would be scaled unevenly on
                        // each axis. Pin it to CSS pixels instead.
                        vectorEffect="non-scaling-stroke"
                        style={{ strokeWidth: annotation.strokeWidth * zoom }}
                    />
                </svg>
            );

        case "text":
            return <TextBody annotation={annotation} zoom={zoom} isEditing={isEditing} onChange={onChange} onStopEditing={onStopEditing} />;
    }
}

function TextBody({
    annotation,
    zoom,
    isEditing,
    onChange,
    onStopEditing,
}: BodyProps & { annotation: TextAnnotation }) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // The preview and the exporter must agree on line height, so both read
    // LINE_HEIGHT_RATIO rather than relying on a CSS default.
    const typography: CSSProperties = {
        fontFamily: FONTS[annotation.fontId].cssStack,
        fontSize: annotation.fontSize * zoom,
        lineHeight: LINE_HEIGHT_RATIO,
        fontWeight: annotation.bold ? 700 : 400,
        fontStyle: annotation.italic ? "italic" : "normal",
        color: annotation.color,
        textAlign: annotation.align,
    };

    useLayoutEffect(() => {
        if (!isEditing) return;
        // Deferred by a frame: focusing synchronously during the same tick as
        // the click that created this box loses the race against the browser's
        // own focus handling.
        const handle = requestAnimationFrame(() => {
            const textarea = textareaRef.current;
            if (!textarea) return;
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        });
        return () => cancelAnimationFrame(handle);
    }, [isEditing]);

    if (isEditing) {
        return (
            <textarea
                ref={textareaRef}
                value={annotation.text}
                onChange={(event) => {
                    const text = event.target.value;
                    const lines = text.split("\n").length;
                    onChange(annotation.id, { text, height: lines * annotation.fontSize * LINE_HEIGHT_RATIO }, true);
                }}
                onBlur={onStopEditing}
                onKeyDown={(event) => {
                    if (event.key === "Escape") {
                        event.preventDefault();
                        onStopEditing();
                    }
                    event.stopPropagation();
                }}
                onPointerDown={(event) => event.stopPropagation()}
                spellCheck={false}
                className="size-full resize-none overflow-hidden border-0 bg-white/70 p-0 outline-none"
                style={typography}
            />
        );
    }

    return (
        <div className="size-full break-words whitespace-pre-wrap" style={typography}>
            {annotation.text || <span className="opacity-40">Double-click to edit</span>}
        </div>
    );
}
