"use client";

import { useState } from "react";

import { Download01, FlipBackward, FlipForward, Menu02, XClose, ZoomIn, ZoomOut } from "@untitledui/icons";

import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { MAX_ZOOM, MIN_ZOOM } from "@/lib/editor-state";
import { cx } from "@/utils/cx";

import { useEditor } from "./editor-context";
import { Wordmark } from "./wordmark";

interface Props {
    onToggleSidebar: () => void;
    isSidebarOpen: boolean;
    onFitWidth: () => void;
}

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export function TopBar({ onToggleSidebar, isSidebarOpen, onFitWidth }: Props) {
    const { state, dispatch, sourceBytes, closeDocument } = useEditor();
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);

    const { doc, zoom, past, future } = state;
    if (!doc) return null;

    const stepZoom = (direction: 1 | -1) => {
        const next =
            direction === 1
                ? (ZOOM_STEPS.find((step) => step > zoom + 0.001) ?? MAX_ZOOM)
                : ([...ZOOM_STEPS].reverse().find((step) => step < zoom - 0.001) ?? MIN_ZOOM);
        dispatch({ type: "zoom/set", zoom: next });
    };

    const download = async () => {
        if (!sourceBytes) return;
        setIsExporting(true);
        setExportError(null);

        try {
            // pdf-lib is only ever needed at this moment, so it stays out of the
            // initial bundle.
            const { exportPdf } = await import("@/lib/export-pdf");
            const bytes = await exportPdf({ doc, sourceBytes, sourceSizes: state.sourceSizes });
            // Copy into a fresh ArrayBuffer so the Blob gets a plain
            // ArrayBuffer rather than a possibly-shared view.
            const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = url;
            link.download = doc.fileName.replace(/\.pdf$/i, "") + "-edited.pdf";
            document.body.append(link);
            link.click();
            link.remove();

            // Give the browser a moment to start the download before the URL
            // is torn down.
            window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
        } catch (error) {
            console.error("Export failed", error);
            setExportError("Something went wrong while building the file. Your edits are still here — try again.");
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <header className="flex flex-col border-b border-secondary bg-primary">
            <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
                <ButtonUtility
                    size="sm"
                    color="tertiary"
                    icon={Menu02}
                    tooltip={isSidebarOpen ? "Hide pages" : "Show pages"}
                    onClick={onToggleSidebar}
                    className="lg:hidden"
                />

                <Wordmark className="hidden shrink-0 sm:block" />

                <div className="min-w-0 flex-1 sm:px-2">
                    <p className="truncate text-sm font-semibold text-primary" title={doc.fileName}>
                        {doc.fileName}
                    </p>
                    {/* Squeezed out on a phone: the filename needs the room more
                        than the counts do, and letting this wrap triples the
                        height of the whole bar. */}
                    <p className="truncate text-xs text-tertiary max-sm:hidden">
                        {doc.pages.length} {doc.pages.length === 1 ? "page" : "pages"} · {doc.annotations.length}{" "}
                        {doc.annotations.length === 1 ? "edit" : "edits"}
                    </p>
                </div>

                <div className="flex items-center gap-0.5">
                    <ButtonUtility
                        size="sm"
                        color="tertiary"
                        icon={FlipBackward}
                        tooltip="Undo (⌘Z)"
                        isDisabled={past.length === 0}
                        onClick={() => dispatch({ type: "history/undo" })}
                    />
                    <ButtonUtility
                        size="sm"
                        color="tertiary"
                        icon={FlipForward}
                        tooltip="Redo (⇧⌘Z)"
                        isDisabled={future.length === 0}
                        onClick={() => dispatch({ type: "history/redo" })}
                    />
                </div>

                <div className="flex items-center gap-0.5 rounded-lg bg-secondary p-0.5">
                    <ButtonUtility size="xs" color="tertiary" icon={ZoomOut} tooltip="Zoom out" isDisabled={zoom <= MIN_ZOOM} onClick={() => stepZoom(-1)} />
                    <button
                        type="button"
                        onClick={onFitWidth}
                        title="Fit the page to the window"
                        className="w-14 cursor-pointer text-center text-xs font-semibold tabular-nums text-secondary max-sm:hidden"
                    >
                        {Math.round(zoom * 100)}%
                    </button>
                    <ButtonUtility size="xs" color="tertiary" icon={ZoomIn} tooltip="Zoom in" isDisabled={zoom >= MAX_ZOOM} onClick={() => stepZoom(1)} />
                </div>

                <Button size="sm" color="primary" iconLeading={Download01} isLoading={isExporting} showTextWhileLoading onClick={download}>
                    <span className="max-sm:sr-only">Download</span>
                </Button>

                <ButtonUtility size="sm" color="tertiary" icon={XClose} tooltip="Close document and clear this session" onClick={() => void closeDocument()} />
            </div>

            {exportError && (
                <p className={cx("border-t border-error_subtle bg-error-primary px-4 py-2 text-sm text-error-primary")} role="alert">
                    {exportError}
                </p>
            )}
        </header>
    );
}
