"use client";

import { PDFDocument } from "pdf-lib";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { renderPage } from "@/lib/pdf-document";
import type { Rotation } from "@/lib/types";

import type { Rect } from "./types";

/**
 * Redaction that actually removes content.
 *
 * The editor's white-out tool draws an opaque block over the page and leaves
 * the text underneath intact — fine for tidying a screenshot, useless where the
 * hidden thing must genuinely be gone. This does the other thing.
 *
 * The method is flattening: render the page to a canvas, paint the redactions
 * onto those pixels, and rebuild the page from the image. The original text
 * operators are not covered up, they are not included at all — the rebuilt page
 * has no text object to recover, because it has no text objects.
 *
 * Costs, stated plainly because the workspace states them to the user too:
 * redacted pages stop being selectable or searchable, and they get larger. Only
 * pages carrying a redaction are flattened; the rest are copied untouched, so a
 * 40-page contract with one redacted page keeps 39 pages of real text.
 */

export interface RedactionInput {
    /** The bytes the user opened. */
    sourceBytes: ArrayBuffer;
    pdf: PDFDocumentProxy;
    /** Rects per page index, in display points. */
    redactions: Map<number, Rect[]>;
    /** Total display rotation per page index. */
    rotations?: Map<number, Rotation>;
    /** Render scale for flattened pages. 2 keeps small print readable. */
    scale?: number;
    /** JPEG quality for flattened pages. */
    quality?: number;
    onProgress?: (done: number, total: number) => void;
}

export async function redactToPdf({
    sourceBytes,
    pdf,
    redactions,
    rotations,
    scale = 2,
    quality = 0.92,
    onProgress,
}: RedactionInput): Promise<Uint8Array> {
    // pdf.js detaches buffers it is handed, so pdf-lib gets its own copy.
    const source = await PDFDocument.load(sourceBytes.slice(0), { ignoreEncryption: true });
    const out = await PDFDocument.create();

    const pageCount = source.getPageCount();
    const copied = await out.copyPages(source, Array.from({ length: pageCount }, (_, i) => i));

    for (let index = 0; index < pageCount; index++) {
        const rects = redactions.get(index);

        if (!rects || rects.length === 0) {
            // Untouched pages keep their real text. Flattening the whole
            // document to redact one line would be a poor trade.
            out.addPage(copied[index]);
            onProgress?.(index + 1, pageCount);
            continue;
        }

        const rotation = rotations?.get(index) ?? 0;
        const page = await pdf.getPage(index + 1);

        const canvas = document.createElement("canvas");
        const task = renderPage({ page, canvas, scale, rotation, maxPixelRatio: 1 });
        await task.promise;

        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not get a 2D canvas context for redaction.");

        // The canvas is scaled by `renderPage`; painting in the same transform
        // means the rects land exactly where the user drew them.
        context.fillStyle = "#000000";
        for (const rect of rects) context.fillRect(rect.x, rect.y, rect.width, rect.height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const image = await out.embedJpg(dataUrl);

        // Match the original page box so downstream page numbering and print
        // size are unchanged.
        const original = copied[index];
        const { width, height } = original.getSize();
        const flattened = out.addPage([width, height]);

        // The bitmap already has the rotation baked in, so the rebuilt page
        // must declare none.
        const landscape = rotation === 90 || rotation === 270;
        flattened.drawImage(image, {
            x: 0,
            y: 0,
            width: landscape ? height : width,
            height: landscape ? width : height,
        });

        if (landscape) flattened.setSize(height, width);

        onProgress?.(index + 1, pageCount);
    }

    // Metadata travels with a document and routinely names the author, the
    // software and the original filename. A page that says nothing can still
    // say plenty in its properties.
    out.setTitle("");
    out.setAuthor("");
    out.setSubject("");
    out.setKeywords([]);
    out.setProducer("actuallyfreepdfeditor");
    out.setCreator("actuallyfreepdfeditor");

    return out.save();
}

/**
 * Re-reads an exported file and reports whether any of `phrases` survives.
 *
 * Used by the workspace to verify its own output before handing it over, and by
 * `scripts/verify-redaction.mjs` in a real browser. A redaction tool that
 * cannot demonstrate the text is gone is asking for trust it has not earned.
 */
export async function verifyRemoved(
    bytes: Uint8Array,
    phrases: string[],
    loadPdf: (buffer: ArrayBuffer) => Promise<PDFDocumentProxy>,
): Promise<{ clean: boolean; survivors: string[] }> {
    const copy = bytes.slice(0);
    const doc = await loadPdf(copy.buffer as ArrayBuffer);

    let haystack = "";
    for (let i = 1; i <= doc.numPages; i++) {
        const content = await (await doc.getPage(i)).getTextContent();
        haystack += content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    }

    const normalised = haystack.replace(/\s+/g, " ").toLowerCase();
    const survivors = phrases.filter((phrase) => normalised.includes(phrase.replace(/\s+/g, " ").toLowerCase()));

    return { clean: survivors.length === 0, survivors };
}
