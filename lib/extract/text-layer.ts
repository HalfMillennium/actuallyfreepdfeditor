"use client";

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { TextItem as PdfTextItem } from "pdfjs-dist/types/src/display/api";

import type { PageText, TextItem } from "./types";

/**
 * Reading a PDF's own text layer.
 *
 * This runs entirely in the browser and costs nothing per page. It is also the
 * step that decides whether OCR is needed at all — running OCR on a page that
 * already has selectable text is slower and strictly worse, because the text
 * layer is exact and OCR is a guess.
 */

/**
 * Below this many characters a page is treated as needing OCR.
 *
 * Deliberately not zero. Scans routinely carry a handful of characters from a
 * stamp, a footer added by the scanner, or an embedded form field, and treating
 * those pages as "has text" would hand the user four characters and call it a
 * result.
 */
export const SCAN_CHAR_THRESHOLD = 96;

/** Extracts positioned text from a page's native text layer. */
export async function readTextLayer(page: PDFPageProxy, pageIndex: number, rotation: number): Promise<PageText> {
    const viewport = page.getViewport({ scale: 1, rotation });
    const content = await page.getTextContent();

    const items: TextItem[] = [];

    for (const raw of content.items) {
        // `getTextContent` yields marked-content markers alongside real items;
        // only the latter carry a transform.
        if (!("str" in raw)) continue;
        const item = raw as PdfTextItem;
        if (!item.str || item.str.trim() === "") continue;

        // transform is [a, b, c, d, e, f] in PDF space. Compose with the
        // viewport to land in the same display space the overlay uses.
        const [a, b, , , e, f] = item.transform;
        const [va, vb, vc, vd, ve, vf] = viewport.transform;

        const x = va * e + vc * f + ve;
        const baselineY = vb * e + vd * f + vf;
        const fontSize = Math.hypot(a, b);

        items.push({
            text: item.str,
            x,
            // The transform gives the baseline; the item's box starts a cap
            // height above it.
            y: baselineY - fontSize,
            width: item.width,
            height: fontSize,
            fontSize,
        });
    }

    const nativeCharCount = items.reduce((sum, item) => sum + item.text.trim().length, 0);

    return {
        pageIndex,
        width: viewport.width,
        height: viewport.height,
        items,
        nativeCharCount,
        source: nativeCharCount >= SCAN_CHAR_THRESHOLD ? "text-layer" : "none",
    };
}

/** Reads every page's text layer, so the UI can say which pages need OCR before anything runs. */
export async function surveyDocument(pdf: PDFDocumentProxy, rotations: number[] = []): Promise<PageText[]> {
    const pages: PageText[] = [];

    for (let i = 0; i < pdf.numPages; i++) {
        const page = await pdf.getPage(i + 1);
        pages.push(await readTextLayer(page, i, rotations[i] ?? 0));
    }

    return pages;
}

/** Pages that carry too little native text to be worth reading without OCR. */
export function pagesNeedingOcr(pages: PageText[]): number[] {
    return pages.filter((page) => page.source === "none").map((page) => page.pageIndex);
}

/**
 * Orders text items the way a person reads them.
 *
 * pdf.js emits items in content-stream order, which is the order the file draws
 * them and frequently not the order they appear on the page. Sorting into rows
 * first, then left to right within a row, is what makes the exported text
 * usable rather than merely present.
 */
export function inReadingOrder(items: TextItem[]): TextItem[] {
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    const rows: TextItem[][] = [];

    for (const item of sorted) {
        // Same row when the vertical overlap is most of the line height; this
        // tolerates the sub-pixel baseline drift common in generated PDFs.
        const row = rows.find((candidate) => Math.abs(candidate[0].y - item.y) < Math.max(item.height, candidate[0].height) * 0.6);
        if (row) row.push(item);
        else rows.push([item]);
    }

    return rows.flatMap((row) => row.sort((a, b) => a.x - b.x));
}

/** Joins items into lines, inserting a space only where the gap warrants one. */
export function toPlainText(items: TextItem[]): string {
    const ordered = inReadingOrder(items);
    const lines: string[] = [];
    let current = "";
    let previous: TextItem | null = null;

    for (const item of ordered) {
        if (previous && Math.abs(previous.y - item.y) >= Math.max(item.height, previous.height) * 0.6) {
            lines.push(current.trimEnd());
            current = "";
            previous = null;
        }

        if (previous) {
            const gap = item.x - (previous.x + previous.width);
            // A gap wider than a third of the font size is a real space; PDFs
            // often position each word individually with no space character.
            if (gap > previous.fontSize * 0.3 && !current.endsWith(" ")) current += " ";
        }

        current += item.text;
        previous = item;
    }

    if (current.trim()) lines.push(current.trimEnd());
    return lines.join("\n");
}
