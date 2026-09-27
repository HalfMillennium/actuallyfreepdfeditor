"use client";

import { useEffect, useMemo, useState } from "react";

import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { CloseButton } from "@/components/base/buttons/close-button";
import { Input } from "@/components/base/input/input";
import { LINE_HEIGHT_RATIO } from "@/lib/fonts";
import { createId, sourceRectToDisplay } from "@/lib/geometry";
import { type TextLine, getSamplingCanvas, getTextLines, isLineEdited, lineBox, measureText, replacementFor, sampleColors } from "@/lib/text-edit/text-lines";
import type { Annotation, Box, EditorPage, TextAnnotation } from "@/lib/types";
import { displaySize, totalRotation } from "@/lib/types";
import { cx } from "@/utils/cx";

import { useEditor } from "./editor-context";

interface DialogShellProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description: string;
    children: React.ReactNode;
}

function DialogShell({ isOpen, onClose, title, description, children }: DialogShellProps) {
    return (
        <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable>
            <Modal className="max-w-lg">
                <Dialog aria-label={title}>
                    <div className="flex items-start justify-between gap-4 px-6 pt-6">
                        <div>
                            <h2 className="text-lg font-semibold text-primary">{title}</h2>
                            <p className="mt-1 text-sm text-tertiary">{description}</p>
                        </div>
                        <CloseButton onClick={onClose} label="Close" />
                    </div>
                    {isOpen && children}
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}

/* -------------------------------------------------------------------------- */
/* Find & replace                                                             */
/* -------------------------------------------------------------------------- */

interface LineMatch {
    kind: "line";
    page: EditorPage;
    pageNumber: number;
    line: TextLine;
    count: number;
}

interface AnnotationMatch {
    kind: "annotation";
    pageNumber: number;
    annotation: TextAnnotation;
    count: number;
}

type Match = LineMatch | AnnotationMatch;

function buildPattern(query: string, matchCase: boolean, wholeWord: boolean): RegExp | null {
    if (!query) return null;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // \b only means something next to a word character; "wholeWord" on "$5"
    // should still find "$5".
    const before = wholeWord && /^\w/.test(query) ? "\\b" : "";
    const after = wholeWord && /\w$/.test(query) ? "\\b" : "";
    return new RegExp(`${before}${escaped}${after}`, matchCase ? "g" : "gi");
}

function countMatches(text: string, pattern: RegExp): number {
    return text.match(pattern)?.length ?? 0;
}

/**
 * Replaces text everywhere it appears — in the PDF's own text and in text
 * already added or edited — as one undoable step.
 *
 * Each line of the original that contains a match becomes an edit-text
 * replacement, exactly as if the user had clicked it and retyped it, so the
 * old wording is removed from the exported file rather than covered.
 */
export function FindReplaceDialog({ isOpen, onClose, onJumpToPage }: { isOpen: boolean; onClose: () => void; onJumpToPage: (pageId: string) => void }) {
    return (
        <DialogShell
            isOpen={isOpen}
            onClose={onClose}
            title="Find and replace"
            description="Searches the document's own text and anything you've added. Replaced wording is removed from the downloaded file, not hidden."
        >
            <FindReplaceBody onClose={onClose} onJumpToPage={onJumpToPage} />
        </DialogShell>
    );
}

function FindReplaceBody({ onClose, onJumpToPage }: { onClose: () => void; onJumpToPage: (pageId: string) => void }) {
    const { state, dispatch, pdf } = useEditor();
    const { doc, sourceSizes } = state;

    const [query, setQuery] = useState("");
    const [replacement, setReplacement] = useState("");
    const [matchCase, setMatchCase] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);
    const [matches, setMatches] = useState<Match[] | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isReplacing, setIsReplacing] = useState(false);
    const [done, setDone] = useState<string | null>(null);

    const pattern = useMemo(() => buildPattern(query, matchCase, wholeWord), [query, matchCase, wholeWord]);

    // A new search clears the last "replaced N" report. (Not the search effect
    // below: that also re-runs when the replacement itself changes the document.)
    useEffect(() => setDone(null), [pattern, replacement]);

    /* Search as the user types, debounced; the text layers are cached after the first pass. */
    useEffect(() => {
        if (!pattern || !doc || !pdf) {
            setMatches(null);
            return;
        }

        let cancelled = false;
        const handle = window.setTimeout(async () => {
            setIsSearching(true);
            const found: Match[] = [];

            for (const [index, page] of doc.pages.entries()) {
                const source = sourceSizes[page.sourceIndex];
                const rotation = totalRotation(source, page.rotation);
                const annotations = doc.annotations.filter((a): a is TextAnnotation => a.pageId === page.id && a.kind === "text");
                const erased: Box[] = annotations.flatMap((a) => a.erase?.rects.map((rect) => sourceRectToDisplay(rect, rotation, source.width, source.height)) ?? []);

                let lines: TextLine[] = [];
                try {
                    lines = await getTextLines(pdf, page.sourceIndex, rotation);
                } catch {
                    /* an unreadable page simply has no matches */
                }
                if (cancelled) return;

                for (const line of lines) {
                    if (isLineEdited(line, erased)) continue;
                    const count = countMatches(line.text, pattern);
                    if (count > 0) found.push({ kind: "line", page, pageNumber: index + 1, line, count });
                }
                for (const annotation of annotations) {
                    const count = countMatches(annotation.text, pattern);
                    if (count > 0) found.push({ kind: "annotation", pageNumber: index + 1, annotation, count });
                }
            }

            if (!cancelled) {
                setMatches(found);
                setIsSearching(false);
            }
        }, 200);

        return () => {
            cancelled = true;
            window.clearTimeout(handle);
            setIsSearching(false);
        };
    }, [doc, pattern, pdf, sourceSizes]);

    const total = matches?.reduce((sum, match) => sum + match.count, 0) ?? 0;
    const pages = [...new Set(matches?.map((match) => match.pageNumber) ?? [])];

    const replaceAll = async () => {
        if (!matches || !pattern || !pdf || !doc) return;
        setIsReplacing(true);

        const add: Annotation[] = [];
        const update: Array<{ id: string; patch: Partial<Annotation> }> = [];

        for (const match of matches) {
            if (match.kind === "annotation") {
                const { annotation } = match;
                // A function replacer, so a "$" in the replacement is taken literally.
                const text = annotation.text.replace(pattern, () => replacement);
                const widest = Math.max(...text.split("\n").map((line) => measureText(line, annotation.fontId, annotation.fontSize, annotation.bold, annotation.italic)));
                update.push({ id: annotation.id, patch: { text, width: Math.max(annotation.width, widest + 2) } as Partial<Annotation> });
                continue;
            }

            const { page, line } = match;
            const source = sourceSizes[page.sourceIndex];
            const rotation = totalRotation(source, page.rotation);
            let colors = { ink: "#000000", background: "#ffffff" };
            try {
                colors = sampleColors(await getSamplingCanvas(pdf, page.sourceIndex, rotation), lineBox(line));
            } catch {
                /* defaults */
            }
            add.push(
                replacementFor({
                    pageId: page.id,
                    line,
                    text: line.text.replace(pattern, () => replacement),
                    colors,
                    source,
                    displayRotation: rotation,
                }),
            );
        }

        dispatch({ type: "annotation/batch", add, update });
        setIsReplacing(false);
        setDone(`Replaced ${total} ${total === 1 ? "match" : "matches"} on ${pages.length} ${pages.length === 1 ? "page" : "pages"}. Undo reverses all of them at once.`);
        setMatches([]);
    };

    return (
        <form
            className="flex flex-col gap-4 px-6 pt-5 pb-6"
            onSubmit={(event) => {
                event.preventDefault();
                void replaceAll();
            }}
        >
            <Input label="Find" placeholder="e.g. 2025" value={query} onChange={setQuery} size="md" autoFocus />
            <Input label="Replace with" placeholder="Leave empty to delete it" value={replacement} onChange={setReplacement} size="md" />

            <div className="flex flex-wrap gap-4">
                <Checkbox label="Match case" checked={matchCase} onChange={setMatchCase} />
                <Checkbox label="Whole words" checked={wholeWord} onChange={setWholeWord} />
            </div>

            <div className="min-h-10 text-sm" aria-live="polite">
                {done ? (
                    <p className="font-medium text-success-primary">{done}</p>
                ) : isSearching ? (
                    <p className="text-tertiary">Searching…</p>
                ) : matches === null ? (
                    <p className="text-tertiary">Scanned pages have no text layer to search — use Text to type over those.</p>
                ) : total === 0 ? (
                    <p className="text-tertiary">No matches.</p>
                ) : (
                    <div className="flex flex-col gap-2">
                        <p className="font-medium text-secondary">
                            {total} {total === 1 ? "match" : "matches"} on {pages.length} {pages.length === 1 ? "page" : "pages"}
                        </p>
                        <div className="flex flex-wrap gap-1">
                            {pages.map((pageNumber) => (
                                <button
                                    key={pageNumber}
                                    type="button"
                                    onClick={() => {
                                        const page = doc?.pages[pageNumber - 1];
                                        if (page) onJumpToPage(page.id);
                                    }}
                                    className="cursor-pointer rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary tabular-nums transition hover:bg-tertiary"
                                >
                                    {pageNumber}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-3">
                <Button size="sm" color="secondary" onClick={onClose}>
                    {done ? "Done" : "Cancel"}
                </Button>
                <Button size="sm" color="primary" type="submit" isDisabled={!matches || total === 0 || isSearching} isLoading={isReplacing} showTextWhileLoading>
                    Replace all
                </Button>
            </div>
        </form>
    );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-secondary">
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                className="size-4 cursor-pointer accent-[var(--color-brand-600)]"
            />
            {label}
        </label>
    );
}

/* -------------------------------------------------------------------------- */
/* Page numbers and Bates numbering                                           */
/* -------------------------------------------------------------------------- */

type NumberFormat = "n" | "page-n" | "page-n-of-total" | "n-of-total" | "bates";
type Position = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

const FORMATS: Array<{ id: NumberFormat; label: string }> = [
    { id: "n", label: "1" },
    { id: "page-n", label: "Page 1" },
    { id: "page-n-of-total", label: "Page 1 of 9" },
    { id: "n-of-total", label: "1 / 9" },
    { id: "bates", label: "Bates" },
];

const POSITIONS: Position[] = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"];

export function formatPageNumber(format: NumberFormat, n: number, total: number, bates: { prefix: string; digits: number }): string {
    switch (format) {
        case "page-n":
            return `Page ${n}`;
        case "page-n-of-total":
            return `Page ${n} of ${total}`;
        case "n-of-total":
            return `${n} / ${total}`;
        case "bates":
            return `${bates.prefix}${String(n).padStart(bates.digits, "0")}`;
        default:
            return String(n);
    }
}

/**
 * Stamps a number on every page as ordinary text boxes, so each one can still
 * be nudged or deleted by hand afterwards — a cover page that should not carry
 * one, say. Bates numbering is the same thing with a matter prefix and
 * zero-padding, which is what legal productions expect.
 */
export function PageNumbersDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    return (
        <DialogShell
            isOpen={isOpen}
            onClose={onClose}
            title="Page numbers"
            description="Adds a number to every page, in the order they're in now. Each one is ordinary text you can move or delete afterwards."
        >
            <PageNumbersBody onClose={onClose} />
        </DialogShell>
    );
}

function PageNumbersBody({ onClose }: { onClose: () => void }) {
    const { state, dispatch } = useEditor();
    const { doc, sourceSizes } = state;

    const [format, setFormat] = useState<NumberFormat>("page-n-of-total");
    const [position, setPosition] = useState<Position>("bottom-center");
    const [start, setStart] = useState("1");
    const [fontSize, setFontSize] = useState("10");
    const [skipFirst, setSkipFirst] = useState(false);
    const [prefix, setPrefix] = useState("ABC");
    const [digits, setDigits] = useState("6");

    if (!doc) return null;

    const startNumber = Math.max(0, Number.parseInt(start, 10) || 0);
    const size = Math.min(72, Math.max(4, Number.parseFloat(fontSize) || 10));
    const bates = { prefix, digits: Math.min(12, Math.max(1, Number.parseInt(digits, 10) || 6)) };
    const stamped = doc.pages.filter((_, index) => !(skipFirst && index === 0));
    // With the first page skipped, a "1 of N" count should cover what is numbered.
    const total = startNumber + stamped.length - 1;
    const preview = formatPageNumber(format, startNumber, total, bates);

    const apply = () => {
        const margin = 30;
        const add: TextAnnotation[] = stamped.map((page, index) => {
            const { width: pageWidth, height: pageHeight } = displaySize(sourceSizes[page.sourceIndex], page.rotation);
            const text = formatPageNumber(format, startNumber + index, total, bates);
            const width = measureText(text, "helvetica", size, false, false) + 2;
            const height = size * LINE_HEIGHT_RATIO;
            const [vertical, horizontal] = position.split("-") as ["top" | "bottom", "left" | "center" | "right"];

            return {
                id: createId("ann"),
                pageId: page.id,
                kind: "text",
                x: horizontal === "left" ? margin : horizontal === "right" ? pageWidth - margin - width : (pageWidth - width) / 2,
                y: vertical === "top" ? margin - height / 2 : pageHeight - margin - height / 2,
                width,
                height,
                text,
                fontId: "helvetica",
                fontSize: size,
                bold: false,
                italic: false,
                color: "#1a1a1a",
                align: horizontal,
            };
        });

        dispatch({ type: "annotation/batch", add });
        onClose();
    };

    return (
        <div className="flex flex-col gap-5 px-6 pt-5 pb-6">
            <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium text-secondary">Format</legend>
                <div className="flex flex-wrap gap-1.5">
                    {FORMATS.map((option) => (
                        <Chip key={option.id} isActive={format === option.id} onClick={() => setFormat(option.id)}>
                            {option.label}
                        </Chip>
                    ))}
                </div>
            </fieldset>

            {format === "bates" && (
                <div className="grid grid-cols-2 gap-3">
                    <Input label="Prefix" value={prefix} onChange={setPrefix} size="sm" />
                    <Input label="Digits" type="number" value={digits} onChange={setDigits} size="sm" />
                </div>
            )}

            <fieldset>
                <legend className="mb-2 text-sm font-medium text-secondary">Position</legend>
                <div className="grid w-48 grid-cols-3 gap-1 rounded-lg bg-secondary p-1.5">
                    {POSITIONS.map((option) => (
                        <button
                            key={option}
                            type="button"
                            title={option.replace("-", " ")}
                            aria-label={option.replace("-", " ")}
                            aria-pressed={position === option}
                            onClick={() => setPosition(option)}
                            className={cx(
                                "flex h-7 cursor-pointer items-center rounded-md transition",
                                option.endsWith("left") ? "justify-start px-1.5" : option.endsWith("right") ? "justify-end px-1.5" : "justify-center",
                                position === option ? "bg-primary shadow-xs ring-1 ring-brand" : "hover:bg-primary/60",
                                option.startsWith("top") ? "row-start-1" : "row-start-3",
                            )}
                        >
                            <span className={cx("h-1 w-4 rounded-full", position === option ? "bg-brand-solid" : "bg-quaternary")} />
                        </button>
                    ))}
                    <div className="row-start-2 col-span-3 h-8" />
                </div>
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
                <Input label={format === "bates" ? "First number" : "Start at"} type="number" value={start} onChange={setStart} size="sm" />
                <Input label="Font size" type="number" value={fontSize} onChange={setFontSize} size="sm" />
            </div>

            <Checkbox label="Leave the first page unnumbered" checked={skipFirst} onChange={setSkipFirst} />

            <p className="text-sm text-tertiary">
                First number will read <span className="font-semibold text-secondary">{preview}</span>, on {stamped.length}{" "}
                {stamped.length === 1 ? "page" : "pages"}.
            </p>

            <div className="flex justify-end gap-3">
                <Button size="sm" color="secondary" onClick={onClose}>
                    Cancel
                </Button>
                <Button size="sm" color="primary" onClick={apply} isDisabled={stamped.length === 0}>
                    Add numbers
                </Button>
            </div>
        </div>
    );
}

function Chip({ isActive, onClick, children }: { isActive: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            aria-pressed={isActive}
            onClick={onClick}
            className={cx(
                "cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold transition ring-inset",
                isActive ? "bg-brand-primary text-brand-secondary ring-1 ring-brand" : "bg-secondary text-tertiary hover:text-secondary",
            )}
        >
            {children}
        </button>
    );
}
