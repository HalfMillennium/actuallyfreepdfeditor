"use client";

import { memo, useEffect, useRef, useState } from "react";

import type { PDFDocumentProxy } from "pdfjs-dist";

import { renderPage } from "@/lib/pdf-document";
import type { Rotation } from "@/lib/types";
import { cx } from "@/utils/cx";

interface Props {
    pdf: PDFDocumentProxy;
    /** 1-based page number in the *source* document. */
    pageNumber: number;
    scale: number;
    rotation: Rotation;
    className?: string;
}

/**
 * Paints one PDF page into a canvas.
 *
 * pdf.js rejects a second render targeting a canvas that is still busy, and
 * zooming or rotating quickly does exactly that, so each effect cancels the
 * task it replaces and ignores the resulting cancellation.
 */
export const PdfPageCanvas = memo(function PdfPageCanvas({ pdf, pageNumber, scale, rotation, className }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [painted, setPainted] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let task: { cancel: () => void } | null = null;

        void (async () => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            try {
                const page = await pdf.getPage(pageNumber);
                if (cancelled) return;

                const renderTask = renderPage({ page, canvas, scale, rotation });
                task = renderTask;
                await renderTask.promise;
                if (!cancelled) setPainted(true);
            } catch (error) {
                // A cancelled render is the expected outcome of zooming while a
                // page is still painting, not a failure worth surfacing.
                const name = error && typeof error === "object" && "name" in error ? error.name : "";
                if (name !== "RenderingCancelledException" && !cancelled) {
                    console.error(`Could not render page ${pageNumber}`, error);
                }
            }
        })();

        return () => {
            cancelled = true;
            task?.cancel();
        };
    }, [pdf, pageNumber, scale, rotation]);

    return <canvas ref={canvasRef} className={cx("block transition-opacity duration-200", painted ? "opacity-100" : "opacity-0", className)} />;
});
