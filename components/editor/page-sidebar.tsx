"use client";

import { useEffect, useRef, useState } from "react";

import { ArrowDown, ArrowUp, Copy01, RefreshCw01, Trash01 } from "@untitledui/icons";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { renderPage } from "@/lib/pdf-document";
import type { EditorPage, SourcePageSize } from "@/lib/types";
import { displaySize, totalRotation } from "@/lib/types";
import { cx } from "@/utils/cx";

import { useEditor } from "./editor-context";

interface Props {
    activePageId: string | null;
    onJumpToPage: (pageId: string) => void;
}

export function PageSidebar({ activePageId, onJumpToPage }: Props) {
    const { state, dispatch, pdf } = useEditor();
    const { doc, sourceSizes } = state;

    if (!doc || !pdf) return null;

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-4 py-3">
                <h2 className="text-xs font-semibold tracking-wide text-quaternary uppercase">Pages</h2>
                <span className="text-xs text-quaternary tabular-nums">{doc.pages.length}</span>
            </div>

            <ol className="flex-1 space-y-3 overflow-y-auto px-3 pb-6">
                {doc.pages.map((page, index) => (
                    <li key={page.id}>
                        <PageThumbnail
                            pdf={pdf}
                            page={page}
                            source={sourceSizes[page.sourceIndex]}
                            index={index}
                            total={doc.pages.length}
                            isActive={activePageId === page.id}
                            annotationCount={doc.annotations.filter((a) => a.pageId === page.id).length}
                            onJump={() => onJumpToPage(page.id)}
                            onRotate={() => dispatch({ type: "page/rotate", pageId: page.id, delta: 90 })}
                            onDuplicate={() => dispatch({ type: "page/duplicate", pageId: page.id })}
                            onDelete={() => dispatch({ type: "page/delete", pageId: page.id })}
                            onMove={(direction) => dispatch({ type: "page/move", pageId: page.id, toIndex: index + direction })}
                        />
                    </li>
                ))}
            </ol>
        </div>
    );
}

interface ThumbnailProps {
    pdf: PDFDocumentProxy;
    page: EditorPage;
    source: SourcePageSize;
    index: number;
    total: number;
    isActive: boolean;
    annotationCount: number;
    onJump: () => void;
    onRotate: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onMove: (direction: 1 | -1) => void;
}

const THUMB_WIDTH = 132;

function PageThumbnail({
    pdf,
    page,
    source,
    index,
    total,
    isActive,
    annotationCount,
    onJump,
    onRotate,
    onDuplicate,
    onDelete,
    onMove,
}: ThumbnailProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [ready, setReady] = useState(false);

    const size = displaySize(source, page.rotation);
    const scale = THUMB_WIDTH / size.width;
    const rotation = totalRotation(source, page.rotation);

    useEffect(() => {
        let cancelled = false;
        let task: { cancel: () => void } | null = null;

        void (async () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            try {
                const pdfPage = await pdf.getPage(page.sourceIndex + 1);
                if (cancelled) return;
                const renderTask = renderPage({ page: pdfPage, canvas, scale, rotation, maxPixelRatio: 1.5 });
                task = renderTask;
                await renderTask.promise;
                if (!cancelled) setReady(true);
            } catch {
                // Cancelled renders are routine here — rotating a page replaces
                // this effect while the previous paint is still in flight.
            }
        })();

        return () => {
            cancelled = true;
            task?.cancel();
        };
    }, [pdf, page.sourceIndex, scale, rotation]);

    return (
        <div className="group/thumb">
            <button
                type="button"
                onClick={onJump}
                className={cx(
                    "relative block w-full cursor-pointer overflow-hidden rounded-lg bg-white p-0 ring-1 transition",
                    isActive ? "ring-2 ring-brand" : "ring-secondary hover:ring-brand_alt",
                )}
                style={{ height: size.height * scale }}
                aria-current={isActive ? "true" : undefined}
                aria-label={`Go to page ${index + 1}`}
            >
                <canvas ref={canvasRef} className={cx("size-full transition-opacity", ready ? "opacity-100" : "opacity-0")} />

                {annotationCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 rounded-full bg-brand-solid px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                        {annotationCount}
                    </span>
                )}
            </button>

            <div className="mt-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-quaternary tabular-nums">{index + 1}</span>

                <div className="flex items-center gap-px opacity-0 transition-opacity group-hover/thumb:opacity-100 focus-within:opacity-100">
                    <ButtonUtility size="xs" color="tertiary" icon={ArrowUp} tooltip="Move up" isDisabled={index === 0} onClick={() => onMove(-1)} />
                    <ButtonUtility size="xs" color="tertiary" icon={ArrowDown} tooltip="Move down" isDisabled={index === total - 1} onClick={() => onMove(1)} />
                    <ButtonUtility size="xs" color="tertiary" icon={RefreshCw01} tooltip="Rotate" onClick={onRotate} />
                    <ButtonUtility size="xs" color="tertiary" icon={Copy01} tooltip="Duplicate" onClick={onDuplicate} />
                    <ButtonUtility size="xs" color="tertiary" icon={Trash01} tooltip="Delete" isDisabled={total <= 1} onClick={onDelete} />
                </div>
            </div>
        </div>
    );
}
