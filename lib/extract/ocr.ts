"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

import { renderPage } from "@/lib/pdf-document";
import type { Rotation } from "@/lib/types";

import type { PageText, TextItem } from "./types";

/**
 * Optical character recognition, in the browser, on the user's own CPU.
 *
 * The reason this is worth the awkwardness: OCR is the classic feature whose
 * cost scales with success. A hosted OCR API bills per page, so the month a
 * few people push a thousand scans through it is the month the product stops
 * being free. Running it client-side moves that cost to a device that is
 * already sitting idle, and it keeps the document where it started.
 *
 * What the user pays instead is time — a few seconds a page, more on a weak
 * phone — so the workspace runs OCR only on pages whose text layer is missing,
 * never on pages it could simply read.
 *
 * On the privacy claim: the document never leaves the device. The recognition
 * model does get fetched once, from a CDN, and the UI says so. Conflating the
 * two would be the kind of overstatement this product is supposed to avoid.
 */

export interface OcrProgress {
    pageIndex: number;
    /** 0-1 within the current page. */
    ratio: number;
    status: string;
}

type Worker = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;

let workerPromise: Promise<Worker> | null = null;

/**
 * One worker, created on first use and kept.
 *
 * Standing one up costs the model download and a wasm instantiation, so paying
 * that per page would dominate the run on a multi-page scan.
 */
async function getWorker(onProgress?: (status: string, ratio: number) => void): Promise<Worker> {
    workerPromise ??= (async () => {
        const { createWorker, OEM } = await import("tesseract.js");

        // LSTM_ONLY is pinned rather than left to the default so the engine's
        // core-selection can only reach the -lstm wasm builds. That is what
        // makes it safe for scripts/copy-ocr-assets.mjs to ship three variants
        // instead of six.
        return createWorker("eng", OEM.LSTM_ONLY, {
            // Worker and wasm are served from our own origin, so the code path
            // does not depend on a third-party CDN staying up.
            // scripts/copy-ocr-assets.mjs puts them in public/ocr/.
            workerPath: "/ocr/worker.min.js",
            corePath: "/ocr/",
            // The language model is the one thing still fetched remotely. It is
            // ~10 MB, cached by the browser after the first run, and it travels
            // in one direction: the model comes down, the document does not go
            // up. The workspace says exactly this before the first OCR run.
            langPath: "https://tessdata.projectnaptha.com/4.0.0",
            logger: (message: { status: string; progress: number }) => onProgress?.(message.status, message.progress),
        });
    })();

    return workerPromise;
}

/** Releases the worker and its wasm heap. Worth doing when the workspace is closed. */
export async function disposeOcr(): Promise<void> {
    if (!workerPromise) return;
    const worker = await workerPromise;
    workerPromise = null;
    await worker.terminate();
}

export interface OcrPageInput {
    pdf: PDFDocumentProxy;
    pageIndex: number;
    rotation?: Rotation;
    /** Render scale. Tesseract wants roughly 300dpi; 2 gets close for a letter page. */
    scale?: number;
    onProgress?: (progress: OcrProgress) => void;
}

export async function ocrPage({ pdf, pageIndex, rotation = 0, scale = 2, onProgress }: OcrPageInput): Promise<PageText> {
    const page = await pdf.getPage(pageIndex + 1);

    const canvas = document.createElement("canvas");
    const task = renderPage({ page, canvas, scale, rotation, maxPixelRatio: 1 });
    await task.promise;

    const worker = await getWorker((status, ratio) => onProgress?.({ pageIndex, ratio, status }));

    // `blocks` is null unless asked for, and word boxes live inside it — there
    // is no top-level `words` array on this version.
    const { data } = await worker.recognize(canvas, {}, { blocks: true });

    const words = (data.blocks ?? []).flatMap((block) =>
        block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words)),
    );

    // Tesseract reports in rendered pixels; everything else here is display
    // points, so divide the render scale back out.
    const items: TextItem[] = words
        .filter((word) => word.text.trim() !== "")
        .map((word) => ({
            text: word.text,
            x: word.bbox.x0 / scale,
            y: word.bbox.y0 / scale,
            width: (word.bbox.x1 - word.bbox.x0) / scale,
            height: (word.bbox.y1 - word.bbox.y0) / scale,
            fontSize: (word.bbox.y1 - word.bbox.y0) / scale,
        }));

    const viewport = page.getViewport({ scale: 1, rotation });

    return {
        pageIndex,
        width: viewport.width,
        height: viewport.height,
        items,
        nativeCharCount: 0,
        source: "ocr",
        ocrConfidence: data.confidence,
    };
}

