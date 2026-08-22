"use client";

import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";

import type { Rotation, SourcePageSize } from "./types";

type PdfJs = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfJs> | null = null;

/**
 * Loads pdf.js on demand, in the browser only.
 *
 * A static import would drag the whole library into the server render of the
 * page (pdf.js warns about exactly this) and into the initial bundle, even
 * though nothing can happen until a user picks a file.
 *
 * `scripts/copy-pdf-worker.mjs` puts the matching worker in `public/` before
 * dev and build, and the version in the filename keeps a stale copy from being
 * picked up after a dependency bump.
 */
function getPdfjs(): Promise<PdfJs> {
    pdfjsPromise ??= import("pdfjs-dist").then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.${pdfjs.version}.min.mjs`;
        return pdfjs;
    });
    return pdfjsPromise;
}

export interface LoadedPdf {
    proxy: PDFDocumentProxy;
    sizes: SourcePageSize[];
}

export class PasswordProtectedError extends Error {
    constructor() {
        super("This PDF is password protected. Remove the password and try again.");
        this.name = "PasswordProtectedError";
    }
}

/**
 * Opens a PDF for viewing.
 *
 * pdf.js takes ownership of (and detaches) the buffer it is given, so callers
 * keep the pristine bytes and we hand the worker a copy — the originals are
 * needed again at export time.
 */
export async function loadPdf(bytes: ArrayBuffer): Promise<LoadedPdf> {
    const pdfjs = await getPdfjs();

    let proxy: PDFDocumentProxy;
    try {
        proxy = await pdfjs.getDocument({ data: bytes.slice(0), isEvalSupported: false }).promise;
    } catch (error) {
        if (error && typeof error === "object" && "name" in error && error.name === "PasswordException") {
            throw new PasswordProtectedError();
        }
        throw error;
    }

    const sizes: SourcePageSize[] = [];
    for (let i = 1; i <= proxy.numPages; i++) {
        const page = await proxy.getPage(i);
        // `rotation: 0` asks for the page's intrinsic box, before /Rotate.
        const viewport = page.getViewport({ scale: 1, rotation: 0 });
        sizes.push({
            width: viewport.width,
            height: viewport.height,
            rotation: (((page.rotate % 360) + 360) % 360) as Rotation,
        });
    }

    return { proxy, sizes };
}

export interface RenderOptions {
    page: PDFPageProxy;
    canvas: HTMLCanvasElement;
    /** CSS pixels per PDF point. */
    scale: number;
    /** Total rotation to display the page at. */
    rotation: Rotation;
    /** Cap on `devicePixelRatio`, to keep very large pages from exhausting memory. */
    maxPixelRatio?: number;
}

/**
 * Paints a page into a canvas at the given scale, and sizes the canvas for the
 * display's pixel density so text stays crisp.
 *
 * Returns the in-flight `RenderTask` so callers can cancel it — pdf.js throws
 * if two renders target the same canvas at once, and zooming or flipping pages
 * quickly will do exactly that.
 */
export function renderPage({ page, canvas, scale, rotation, maxPixelRatio = 2 }: RenderOptions): RenderTask {
    const viewport = page.getViewport({ scale, rotation });
    const ratio = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, maxPixelRatio);

    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not get a 2D canvas context.");

    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    return page.render({ canvasContext: context, viewport });
}
