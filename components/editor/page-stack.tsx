"use client";

import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";

import { RefreshCcw01, RefreshCw01, Trash01 } from "@untitledui/icons";

import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { LINE_HEIGHT_RATIO } from "@/lib/fonts";
import { createId, sourceRectToDisplay } from "@/lib/geometry";
import { type TextLine, getSamplingCanvas, getTextLines, isLineEdited, lineBox, replacementFor, sampleColors } from "@/lib/text-edit/text-lines";
import type { Annotation, Box, DrawAnnotation, EditorPage, FigureAnnotation, Rotation, ShapeAnnotation, SourcePageSize, TextAnnotation } from "@/lib/types";
import { displaySize, totalRotation } from "@/lib/types";
import { cx } from "@/utils/cx";

import { AnnotationView } from "./annotation-view";
import { useEditor } from "./editor-context";
import { PdfPageCanvas } from "./pdf-page-canvas";
import { type FigureStyle, type TextStyle, useToolSettings } from "./tool-settings";

/** A rectangle, shape or scribble being dragged out, before it becomes an annotation. */
type Draft =
    | { kind: "rect"; pageId: string; x0: number; y0: number; x1: number; y1: number }
    | { kind: "figure"; pageId: string; x0: number; y0: number; x1: number; y1: number }
    | { kind: "draw"; pageId: string; points: Array<[number, number]> };

interface Props {
    onRequestPageFocus: (pageId: string) => void;
}

export function PageStack({ onRequestPageFocus }: Props) {
    const { state, dispatch, pdf } = useEditor();
    const { text: textStyle, highlight, whiteout, pen, figure: figureStyle } = useToolSettings();
    const [draft, setDraft] = useState<Draft | null>(null);
    /** Id of a text box just created by the text tool, so it opens ready to type. */
    const [autoEditId, setAutoEditId] = useState<string | null>(null);

    const { doc, sourceSizes, zoom, tool, selectedId } = state;

    /**
     * Deleting a box that replaces original text deletes the *text*, which is
     * what someone pressing Delete on a line of the document means. Putting
     * the original back is a separate, explicit action in the toolbar.
     */
    const removeAnnotation = useCallback(
        (id: string) => {
            const target = doc?.annotations.find((a) => a.id === id);
            if (target?.kind === "text" && target.erase) {
                if (target.text !== "") dispatch({ type: "annotation/update", id, patch: { text: "" } });
                return;
            }
            dispatch({ type: "annotation/delete", id });
        },
        [dispatch, doc],
    );

    /* Keyboard: delete the selection, undo/redo. */
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            const target = event.target as HTMLElement | null;
            const typing = target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable);

            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
                event.preventDefault();
                dispatch({ type: event.shiftKey ? "history/redo" : "history/undo" });
                return;
            }
            if (typing) return;
            if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
                event.preventDefault();
                removeAnnotation(selectedId);
            }
            if (event.key === "Escape") dispatch({ type: "selection/set", id: null });
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [dispatch, removeAnnotation, selectedId]);

    const pointInPage = useCallback((event: ReactPointerEvent, element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom };
    }, [zoom]);

    const finishDraft = useCallback(() => {
        if (!draft || !doc) {
            setDraft(null);
            return;
        }

        let annotation: Annotation | null = null;

        if (draft.kind === "rect") {
            const x = Math.min(draft.x0, draft.x1);
            const y = Math.min(draft.y0, draft.y1);
            const width = Math.abs(draft.x1 - draft.x0);
            const height = Math.abs(draft.y1 - draft.y0);

            // Ignore a stray click that never became a drag.
            if (width > 4 && height > 4) {
                const settings = tool === "highlight" ? highlight : whiteout;
                annotation = {
                    id: createId("ann"),
                    pageId: draft.pageId,
                    kind: tool === "highlight" ? "highlight" : "whiteout",
                    x,
                    y,
                    width,
                    height,
                    color: settings.color,
                    opacity: settings.opacity,
                } satisfies ShapeAnnotation;
            }
        }

        if (draft.kind === "figure") {
            annotation = newFigure(draft, figureStyle);
        }

        if (draft.kind === "draw" && draft.points.length > 1) {
            const xs = draft.points.map(([x]) => x);
            const ys = draft.points.map(([, y]) => y);
            // Pad the bounding box by the stroke width so a round cap at the
            // very edge is not clipped by the annotation's own box.
            const pad = pen.strokeWidth;
            const minX = Math.min(...xs) - pad;
            const minY = Math.min(...ys) - pad;
            const width = Math.max(Math.max(...xs) + pad - minX, 1);
            const height = Math.max(Math.max(...ys) + pad - minY, 1);

            annotation = {
                id: createId("ann"),
                pageId: draft.pageId,
                kind: "draw",
                x: minX,
                y: minY,
                width,
                height,
                points: draft.points.map(([x, y]) => [(x - minX) / width, (y - minY) / height] as [number, number]),
                color: pen.color,
                strokeWidth: pen.strokeWidth,
            } satisfies DrawAnnotation;
        }

        if (annotation) dispatch({ type: "annotation/add", annotation });
        setDraft(null);
    }, [dispatch, doc, draft, figureStyle, highlight, pen, tool, whiteout]);

    /** Turns a line of the PDF's own text into an editable replacement. */
    const editLine = useCallback(
        async (page: EditorPage, line: TextLine) => {
            if (!pdf) return;
            const source = sourceSizes[page.sourceIndex];
            const rotation = totalRotation(source, page.rotation);

            let colors = { ink: "#000000", background: "#ffffff" };
            try {
                colors = sampleColors(await getSamplingCanvas(pdf, page.sourceIndex, rotation), lineBox(line));
            } catch {
                /* keep the defaults: black on white is right far more often than not */
            }

            const annotation = replacementFor({ pageId: page.id, line, colors, source, displayRotation: rotation });
            dispatch({ type: "annotation/add", annotation });
            dispatch({ type: "tool/set", tool: "select" });
            dispatch({ type: "selection/set", id: annotation.id });
            setAutoEditId(annotation.id);
        },
        [dispatch, pdf, sourceSizes],
    );

    if (!doc || !pdf) return null;

    return (
        <div className="flex flex-col items-center gap-8 px-4 py-8 sm:px-8">
            {doc.pages.map((page, index) => {
                const source = sourceSizes[page.sourceIndex];
                const size = displaySize(source, page.rotation);
                const annotations = doc.annotations.filter((a) => a.pageId === page.id);
                const rotation = totalRotation(source, page.rotation);
                const covers = erasedRects(annotations, source, rotation);

                return (
                    <PageSheet
                        key={page.id}
                        page={page}
                        index={index}
                        total={doc.pages.length}
                        width={size.width * zoom}
                        height={size.height * zoom}
                        onVisible={onRequestPageFocus}
                    >
                        <PdfPageCanvas
                            pdf={pdf}
                            pageNumber={page.sourceIndex + 1}
                            scale={zoom}
                            rotation={rotation}
                            className="absolute inset-0"
                        />

                        {/* The original text an edit replaces, painted out on
                            screen. (In the exported file it is removed.) */}
                        {covers.map(({ box, color }, i) => (
                            <div
                                key={i}
                                className="pointer-events-none absolute"
                                style={{ left: box.x * zoom, top: box.y * zoom, width: box.width * zoom, height: box.height * zoom, backgroundColor: color }}
                            />
                        ))}

                        <div
                            className={cx("absolute inset-0", tool !== "select" && "cursor-crosshair")}
                            onPointerDown={(event) => {
                                if (event.button !== 0) return;
                                const element = event.currentTarget;
                                const { x, y } = pointInPage(event, element);

                                if (tool === "select") {
                                    dispatch({ type: "selection/set", id: null });
                                    return;
                                }

                                // Edit-text acts only on the line targets drawn above
                                // the page; a press on empty paper does nothing.
                                if (tool === "edit-text") return;

                                if (tool === "text") {
                                    // Suppress the compatibility mouse events:
                                    // their default focus handling would pull
                                    // focus back out of the textarea we are
                                    // about to mount, and the empty box would
                                    // then be discarded on blur.
                                    event.preventDefault();

                                    const annotation = newText(page.id, x, y, textStyle);
                                    dispatch({ type: "annotation/add", annotation });
                                    // Drop back to the select tool so the new box
                                    // is immediately draggable once typing ends.
                                    dispatch({ type: "tool/set", tool: "select" });
                                    dispatch({ type: "selection/set", id: annotation.id });
                                    setAutoEditId(annotation.id);
                                    return;
                                }

                                // Rect and freehand gestures track the pointer
                                // even if it leaves the page while dragging.
                                element.setPointerCapture(event.pointerId);
                                if (tool === "highlight" || tool === "whiteout") {
                                    setDraft({ kind: "rect", pageId: page.id, x0: x, y0: y, x1: x, y1: y });
                                    return;
                                }
                                if (tool === "shape") {
                                    setDraft({ kind: "figure", pageId: page.id, x0: x, y0: y, x1: x, y1: y });
                                    return;
                                }
                                if (tool === "draw") {
                                    setDraft({ kind: "draw", pageId: page.id, points: [[x, y]] });
                                }
                            }}
                            onPointerMove={(event) => {
                                if (!draft || draft.pageId !== page.id) return;
                                const { x, y } = pointInPage(event, event.currentTarget);

                                setDraft((current) => {
                                    if (!current) return current;
                                    if (current.kind === "rect" || current.kind === "figure") return { ...current, x1: x, y1: y };
                                    // Thin the stream a little: sub-pixel moves
                                    // add points without adding fidelity.
                                    const last = current.points[current.points.length - 1];
                                    if (Math.abs(last[0] - x) < 0.75 && Math.abs(last[1] - y) < 0.75) return current;
                                    return { ...current, points: [...current.points, [x, y]] };
                                });
                            }}
                            onPointerUp={finishDraft}
                            onPointerCancel={finishDraft}
                        >
                            {annotations.map((annotation) => (
                                <AnnotationView
                                    key={annotation.id}
                                    annotation={annotation}
                                    zoom={zoom}
                                    isSelected={selectedId === annotation.id}
                                    pageWidth={size.width}
                                    pageHeight={size.height}
                                    interactive={tool === "select"}
                                    autoEdit={autoEditId === annotation.id}
                                    onAutoEditConsumed={() => setAutoEditId(null)}
                                    onSelect={(id) => dispatch({ type: "selection/set", id })}
                                    onCheckpoint={() => dispatch({ type: "history/checkpoint" })}
                                    onChange={(id, patch, transient) => dispatch({ type: "annotation/update", id, patch, transient })}
                                    onDelete={removeAnnotation}
                                />
                            ))}

                            {draft?.pageId === page.id && (
                                <DraftPreview
                                    draft={draft}
                                    zoom={zoom}
                                    color={tool === "highlight" ? highlight.color : tool === "whiteout" ? whiteout.color : pen.color}
                                    opacity={tool === "highlight" ? highlight.opacity : whiteout.opacity}
                                    strokeWidth={pen.strokeWidth}
                                    figure={figureStyle}
                                />
                            )}
                        </div>

                        {tool === "edit-text" && (
                            <EditTextLayer
                                page={page}
                                rotation={rotation}
                                zoom={zoom}
                                erased={covers.map((cover) => cover.box)}
                                onPick={(line) => void editLine(page, line)}
                            />
                        )}
                    </PageSheet>
                );
            })}
        </div>
    );
}

function newText(pageId: string, x: number, y: number, style: TextStyle): TextAnnotation {
    return {
        id: createId("ann"),
        pageId,
        kind: "text",
        // Drop the caret roughly where the click was, rather than hanging the
        // box off the click point.
        x: Math.max(0, x - 4),
        y: Math.max(0, y - (style.fontSize * LINE_HEIGHT_RATIO) / 2),
        width: 240,
        height: style.fontSize * LINE_HEIGHT_RATIO,
        text: "",
        fontId: style.fontId,
        fontSize: style.fontSize,
        bold: style.bold,
        italic: style.italic,
        color: style.color,
        align: style.align,
    };
}

/** Where each replaced line sits on screen, and the paper colour to paint it out with. */
function erasedRects(annotations: Annotation[], source: SourcePageSize, rotation: Rotation): Array<{ box: Box; color: string }> {
    const out: Array<{ box: Box; color: string }> = [];
    for (const annotation of annotations) {
        if (annotation.kind !== "text" || !annotation.erase) continue;
        for (const rect of annotation.erase.rects) {
            out.push({ box: sourceRectToDisplay(rect, rotation, source.width, source.height), color: annotation.erase.background });
        }
    }
    return out;
}

/**
 * The page's existing lines of text, as click targets.
 *
 * Shown only while the edit-text tool is active. Lines that already have a
 * replacement are left out — clicking the replacement edits it instead.
 */
function EditTextLayer({
    page,
    rotation,
    zoom,
    erased,
    onPick,
}: {
    page: EditorPage;
    rotation: Rotation;
    zoom: number;
    erased: Box[];
    onPick: (line: TextLine) => void;
}) {
    const { pdf } = useEditor();
    const [lines, setLines] = useState<TextLine[] | null>(null);

    useEffect(() => {
        if (!pdf) return;
        let cancelled = false;
        setLines(null);
        getTextLines(pdf, page.sourceIndex, rotation)
            .then((result) => !cancelled && setLines(result))
            .catch(() => !cancelled && setLines([]));
        return () => {
            cancelled = true;
        };
    }, [pdf, page.sourceIndex, rotation]);

    if (!lines) return null;

    const editable = lines.filter((line) => !isLineEdited(line, erased));

    if (lines.length === 0) {
        return (
            <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                <p className="rounded-md bg-primary/95 px-3 py-1.5 text-xs font-medium text-tertiary shadow-sm ring-1 ring-secondary">
                    No editable text on this page — it may be a scan. Use Text to type over it.
                </p>
            </div>
        );
    }

    return (
        <div className="pointer-events-none absolute inset-0">
            {editable.map((line) => {
                const box = lineBox(line);
                const pad = 2;
                return (
                    <button
                        key={line.key}
                        type="button"
                        title={`Edit “${line.text.length > 60 ? `${line.text.slice(0, 60)}…` : line.text}”`}
                        aria-label={`Edit text: ${line.text}`}
                        // `click`, not `pointerdown`: on a phone a swipe that
                        // starts on a line is a scroll, and only a tap should
                        // open the line for editing.
                        onClick={(event) => {
                            event.stopPropagation();
                            onPick(line);
                        }}
                        className="pointer-events-auto absolute cursor-text rounded-[2px] bg-brand-solid/0 ring-1 ring-brand/30 transition hover:bg-brand-solid/10 hover:ring-2 hover:ring-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                        style={{
                            left: (box.x - pad) * zoom,
                            top: (box.y - pad) * zoom,
                            width: (box.width + 2 * pad) * zoom,
                            height: (box.height + 2 * pad) * zoom,
                        }}
                    />
                );
            })}
        </div>
    );
}

/** A shape from a drag gesture, or null if the drag was too small to mean one. */
function newFigure(draft: Extract<Draft, { kind: "figure" }>, style: FigureStyle): FigureAnnotation | null {
    const dx = draft.x1 - draft.x0;
    const dy = draft.y1 - draft.y0;
    const isLine = style.figure === "line" || style.figure === "arrow";

    if (isLine ? Math.hypot(dx, dy) < 6 : Math.abs(dx) < 4 || Math.abs(dy) < 4) return null;

    const x = Math.min(draft.x0, draft.x1);
    const y = Math.min(draft.y0, draft.y1);
    // A perfectly horizontal or vertical line has a zero-size box; give it one
    // point of thickness so the fractional endpoints stay well-defined.
    const width = Math.max(Math.abs(dx), 1);
    const height = Math.max(Math.abs(dy), 1);
    const fx = (value: number) => (Math.abs(dx) < 1 ? 0.5 : (value - x) / width);
    const fy = (value: number) => (Math.abs(dy) < 1 ? 0.5 : (value - y) / height);

    return {
        id: createId("ann"),
        pageId: draft.pageId,
        kind: "figure",
        figure: style.figure,
        x,
        y,
        width,
        height,
        stroke: style.stroke,
        fill: isLine ? null : style.fill,
        strokeWidth: style.strokeWidth,
        start: [fx(draft.x0), fy(draft.y0)],
        end: [fx(draft.x1), fy(draft.y1)],
    };
}

interface SheetProps {
    page: EditorPage;
    index: number;
    total: number;
    width: number;
    height: number;
    children: React.ReactNode;
    onVisible: (pageId: string) => void;
}

function PageSheet({ page, index, total, width, height, children, onVisible }: SheetProps) {
    const { dispatch } = useEditor();
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting && entry.intersectionRatio > 0.5) onVisible(page.id);
                }
            },
            { threshold: [0.5] },
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, [onVisible, page.id]);

    return (
        <div ref={ref} data-page-id={page.id} className="group/page relative">
            <div className="pdf-sheet relative overflow-hidden rounded-sm" style={{ width, height }}>
                {children}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-quaternary">
                    Page {index + 1} of {total}
                </span>

                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/page:opacity-100 focus-within:opacity-100">
                    <ButtonUtility
                        size="xs"
                        color="tertiary"
                        icon={RefreshCcw01}
                        tooltip="Rotate left"
                        onClick={() => dispatch({ type: "page/rotate", pageId: page.id, delta: -90 })}
                    />
                    <ButtonUtility
                        size="xs"
                        color="tertiary"
                        icon={RefreshCw01}
                        tooltip="Rotate right"
                        onClick={() => dispatch({ type: "page/rotate", pageId: page.id, delta: 90 })}
                    />
                    <ButtonUtility
                        size="xs"
                        color="tertiary"
                        icon={Trash01}
                        tooltip={total > 1 ? "Delete page" : "A document needs at least one page"}
                        isDisabled={total <= 1}
                        onClick={() => dispatch({ type: "page/delete", pageId: page.id })}
                    />
                </div>
            </div>
        </div>
    );
}

function DraftPreview({
    draft,
    zoom,
    color,
    opacity,
    strokeWidth,
    figure,
}: {
    draft: Draft;
    zoom: number;
    color: string;
    opacity: number;
    strokeWidth: number;
    figure: FigureStyle;
}) {
    if (draft.kind === "figure") {
        const preview = newFigure(draft, figure);
        if (!preview) return null;
        return (
            <div
                className="pointer-events-none absolute"
                style={{ left: preview.x * zoom, top: preview.y * zoom, width: preview.width * zoom, height: preview.height * zoom }}
            >
                <AnnotationView
                    annotation={{ ...preview, x: 0, y: 0 }}
                    zoom={zoom}
                    isSelected={false}
                    pageWidth={Infinity}
                    pageHeight={Infinity}
                    interactive={false}
                    onSelect={noop}
                    onCheckpoint={noop}
                    onChange={noop}
                    onDelete={noop}
                />
            </div>
        );
    }

    if (draft.kind === "rect") {
        return (
            <div
                className="pointer-events-none absolute ring-1 ring-brand-solid"
                style={{
                    left: Math.min(draft.x0, draft.x1) * zoom,
                    top: Math.min(draft.y0, draft.y1) * zoom,
                    width: Math.abs(draft.x1 - draft.x0) * zoom,
                    height: Math.abs(draft.y1 - draft.y0) * zoom,
                    backgroundColor: color,
                    opacity,
                }}
            />
        );
    }

    return (
        <svg className="pointer-events-none absolute inset-0 size-full overflow-visible">
            <polyline
                points={draft.points.map(([x, y]) => `${x * zoom},${y * zoom}`).join(" ")}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth * zoom}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function noop() {}
