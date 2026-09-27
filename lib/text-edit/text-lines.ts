"use client";

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { TextItem as PdfTextItem, TextStyle as PdfTextStyle } from "pdfjs-dist/types/src/display/api";

import { FONTS, LINE_HEIGHT_RATIO, baselineOffset } from "@/lib/fonts";
import { createId, displayRectToSource } from "@/lib/geometry";
import { renderPage } from "@/lib/pdf-document";
import type { Box, FontId, Rotation, SourcePageSize, TextAnnotation } from "@/lib/types";

/**
 * Finding the lines of text a page already carries, so they can be edited.
 *
 * pdf.js reports text in runs that follow the content stream, which can be a
 * whole line, a single word, or one glyph. People think in lines, so runs that
 * share a baseline and sit close together are joined. Only text that reads
 * left-to-right and upright *as displayed* is offered: a replacement box is
 * always upright, and offering to "edit" a vertical label would replace it with
 * something the user did not ask for.
 */

export interface TextLine {
    /** Stable within one scan of one page, for React keys. */
    key: string;
    text: string;
    /** Display points, rotation applied, top-left origin. */
    x: number;
    /** Baseline, in display points. */
    baseline: number;
    width: number;
    fontSize: number;
    ascent: number;
    descent: number;
    fontId: FontId;
    bold: boolean;
    italic: boolean;
}

/** Box the line's ink occupies, in display points. */
export function lineBox(line: TextLine): Box {
    return {
        x: line.x,
        y: line.baseline - line.ascent * line.fontSize,
        width: line.width,
        height: (line.ascent + line.descent) * line.fontSize,
    };
}

interface FontFacts {
    fontId: FontId;
    bold: boolean;
    italic: boolean;
}

/**
 * Picks the closest standard face for a font found in the file.
 *
 * The embedded font usually cannot be reused — it is almost always subset to
 * the glyphs the original text needed — so the replacement is set in whichever
 * standard face matches its classification.
 */
function classifyFont(page: PDFPageProxy, fontName: string, style: PdfTextStyle | undefined): FontFacts {
    let name = "";
    let isSerif = false;
    let isMono = false;
    let boldFlag = false;
    let italicFlag = false;

    try {
        // Resolved during rendering; `get` throws if it has not been, in which
        // case the family pdf.js reports with the text is the fallback.
        const font = page.commonObjs.get(fontName) as { name?: string; isSerifFont?: boolean; isMonospace?: boolean; bold?: boolean; italic?: boolean } | undefined;
        name = font?.name ?? "";
        isSerif = Boolean(font?.isSerifFont);
        isMono = Boolean(font?.isMonospace);
        boldFlag = Boolean(font?.bold);
        italicFlag = Boolean(font?.italic);
    } catch {
        /* not loaded yet */
    }

    const family = style?.fontFamily ?? "";
    const clean = name.replace(/^[A-Z]{6}\+/, "");

    let fontId: FontId = "helvetica";
    if (isMono || /courier|mono|consol|menlo/i.test(clean) || family === "monospace") fontId = "courier";
    else if (/sans|arial|helvet|verdana|segoe|calibri|roboto|inter|gothic/i.test(clean)) fontId = "helvetica";
    else if (isSerif || /times|serif|roman|georgia|garamond|cambria|minion|book|palatino|baskerville/i.test(clean) || family === "serif") fontId = "times";

    return {
        fontId,
        bold: boldFlag || /bold|black|heavy|semibold|demi/i.test(clean),
        italic: italicFlag || /italic|oblique/i.test(clean),
    };
}

/** Reads a page's text runs and joins them into upright, left-to-right lines. */
export async function readTextLines(page: PDFPageProxy, rotation: Rotation): Promise<TextLine[]> {
    const viewport = page.getViewport({ scale: 1, rotation });
    // Fonts are only resolvable once the operator list has been built; the
    // on-screen render usually did that already, and this is cheap if so.
    await page.getOperatorList().catch(() => undefined);
    const content = await page.getTextContent();

    interface Run extends TextLine {
        fontName: string;
    }

    const runs: Run[] = [];
    const [va, vb, vc, vd, ve, vf] = viewport.transform;

    for (const raw of content.items) {
        if (!("str" in raw)) continue;
        const item = raw as PdfTextItem;
        if (!item.str || item.str.trim() === "" || !item.width) continue;

        const [a, b, c, d, e, f] = item.transform;
        // Item matrix composed with the viewport: where the run sits on screen.
        const da = va * a + vc * b;
        const db = vb * a + vd * b;
        const dc = va * c + vc * d;
        const dd = vb * c + vd * d;
        const x = va * e + vc * f + ve;
        const baseline = vb * e + vd * f + vf;

        // Upright and left-to-right on screen: x axis points right, y axis
        // points up (negative in a y-down frame), no meaningful skew.
        const size = Math.hypot(dc, dd);
        if (size < 1 || da <= 0 || dd >= 0 || Math.abs(db) > 0.05 * Math.abs(da) || Math.abs(dc) > 0.35 * size) continue;

        const style = content.styles[item.fontName];
        const facts = classifyFont(page, item.fontName, style);
        const ascent = style?.ascent && style.ascent > 0.3 && style.ascent < 1.2 ? style.ascent : FONTS[facts.fontId].ascent;
        const descent = style?.descent && Math.abs(style.descent) < 0.6 ? Math.abs(style.descent) : FONTS[facts.fontId].descent;

        runs.push({
            key: "",
            text: item.str,
            x,
            baseline,
            width: item.width,
            fontSize: size,
            ascent,
            descent,
            fontName: item.fontName,
            ...facts,
        });
    }

    runs.sort((p, q) => p.baseline - q.baseline || p.x - q.x);

    const lines: Run[] = [];
    for (const run of runs) {
        const line = lines.find((candidate) => {
            if (Math.abs(candidate.baseline - run.baseline) > 0.2 * Math.min(candidate.fontSize, run.fontSize)) return false;
            if (Math.abs(candidate.fontSize - run.fontSize) > 0.2 * candidate.fontSize) return false;
            const gap = run.x - (candidate.x + candidate.width);
            // Close enough to be the same line of prose, not a separate column.
            return gap > -0.5 * run.fontSize && gap < 1.2 * run.fontSize;
        });

        if (!line) {
            lines.push({ ...run });
            continue;
        }

        const gap = run.x - (line.x + line.width);
        const needsSpace = gap > 0.15 * run.fontSize && !line.text.endsWith(" ") && !run.text.startsWith(" ");
        line.text += (needsSpace ? " " : "") + run.text;
        line.width = Math.max(line.width, run.x + run.width - line.x);
        line.bold ||= run.bold;
    }

    return lines.map((line, index) => ({
        key: `line-${index}`,
        text: line.text.replace(/\s+/g, " ").trim(),
        x: line.x,
        baseline: line.baseline,
        width: line.width,
        fontSize: line.fontSize,
        ascent: line.ascent,
        descent: line.descent,
        fontId: line.fontId,
        bold: line.bold,
        italic: line.italic,
    }));
}

/* -------------------------------------------------------------------------- */
/* Colour sampling                                                            */
/* -------------------------------------------------------------------------- */

const SAMPLE_SCALE = 2;

/** A page rendered off-screen, for reading colours back out of. */
export async function renderForSampling(page: PDFPageProxy, rotation: Rotation): Promise<HTMLCanvasElement> {
    const canvas = document.createElement("canvas");
    await renderPage({ page, canvas, scale: SAMPLE_SCALE, rotation, maxPixelRatio: 1 }).promise;
    return canvas;
}

function hex(r: number, g: number, b: number): string {
    return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Reads the paper colour behind a line and the colour of its ink.
 *
 * The background is the most common colour around the line's edge. The ink is
 * the average of the pixels furthest from that background — anti-aliased edge
 * pixels are a blend of the two and would otherwise wash the colour out.
 */
export function sampleColors(canvas: HTMLCanvasElement, box: Box): { ink: string; background: string } {
    const fallback = { ink: "#000000", background: "#ffffff" };
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return fallback;

    const x0 = Math.max(0, Math.floor(box.x * SAMPLE_SCALE) - 2);
    const y0 = Math.max(0, Math.floor(box.y * SAMPLE_SCALE) - 2);
    const x1 = Math.min(canvas.width, Math.ceil((box.x + box.width) * SAMPLE_SCALE) + 2);
    const y1 = Math.min(canvas.height, Math.ceil((box.y + box.height) * SAMPLE_SCALE) + 2);
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 2 || h <= 2) return fallback;

    let data: Uint8ClampedArray;
    try {
        data = context.getImageData(x0, y0, w, h).data;
    } catch {
        return fallback;
    }

    const at = (x: number, y: number) => {
        const i = (y * w + x) * 4;
        // A transparent pixel is unpainted paper.
        if (data[i + 3] < 8) return [255, 255, 255] as const;
        return [data[i], data[i + 1], data[i + 2]] as const;
    };

    // Most common (coarsely quantised) colour on the border.
    const counts = new Map<string, { n: number; r: number; g: number; b: number }>();
    const tally = (x: number, y: number) => {
        const [r, g, b] = at(x, y);
        const key = `${r >> 4},${g >> 4},${b >> 4}`;
        const entry = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
        entry.n++;
        entry.r += r;
        entry.g += g;
        entry.b += b;
        counts.set(key, entry);
    };
    for (let x = 0; x < w; x++) {
        tally(x, 0);
        tally(x, h - 1);
    }
    for (let y = 1; y < h - 1; y++) {
        tally(0, y);
        tally(w - 1, y);
    }
    const top = [...counts.values()].sort((p, q) => q.n - p.n)[0];
    if (!top) return fallback;
    const bg = [top.r / top.n, top.g / top.n, top.b / top.n];

    const pixels: Array<{ d: number; r: number; g: number; b: number }> = [];
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const [r, g, b] = at(x, y);
            const d = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
            if (d > 60) pixels.push({ d, r, g, b });
        }
    }

    const background = hex(bg[0], bg[1], bg[2]);
    if (pixels.length === 0) {
        // Nothing stands out — pick whichever of black and white contrasts.
        const light = bg[0] * 0.299 + bg[1] * 0.587 + bg[2] * 0.114 > 140;
        return { ink: light ? "#000000" : "#ffffff", background };
    }

    pixels.sort((p, q) => q.d - p.d);
    const core = pixels.slice(0, Math.max(1, Math.ceil(pixels.length * 0.3)));
    const sum = core.reduce((acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }), { r: 0, g: 0, b: 0 });
    const ink = hex(sum.r / core.length, sum.g / core.length, sum.b / core.length);

    // Snap near-black to black: anti-aliasing can leave black text reading as
    // #0f0f0f, and an edit a shade off its neighbours is exactly the tell this
    // feature exists to avoid. Kept tight, because #333 body text is common and
    // is genuinely not black.
    const snapped = core.every((p) => p.r < 20 && p.g < 20 && p.b < 20) ? "#000000" : ink;
    return { ink: snapped, background };
}

/* -------------------------------------------------------------------------- */
/* Turning a line into a replacement                                          */
/* -------------------------------------------------------------------------- */

let measureContext: CanvasRenderingContext2D | null = null;

/** Width of a line of text as the preview will set it, in points. */
export function measureText(text: string, fontId: FontId, fontSize: number, bold: boolean, italic: boolean): number {
    measureContext ??= document.createElement("canvas").getContext("2d");
    if (!measureContext) return text.length * fontSize * 0.5;
    // Measure at a large size and scale down: canvas rounds small sizes.
    measureContext.font = `${italic ? "italic " : ""}${bold ? "700" : "400"} 100px ${FONTS[fontId].cssStack}`;
    return (measureContext.measureText(text).width * fontSize) / 100;
}

export interface ReplacementInput {
    pageId: string;
    line: TextLine;
    text?: string;
    colors: { ink: string; background: string };
    /** The page's unrotated size and the rotation it is displayed at. */
    source: SourcePageSize;
    displayRotation: Rotation;
}

/**
 * Builds the text annotation that replaces an existing line.
 *
 * The box is placed so the preview's baseline (and therefore the exported one,
 * which is computed from the same metrics) lands on the original baseline.
 */
export function replacementFor({ pageId, line, text, colors, source, displayRotation }: ReplacementInput): TextAnnotation {
    const fontSize = Math.round(line.fontSize * 10) / 10;
    const content = text ?? line.text;
    const ink = lineBox(line);

    // Pad the erase region a touch beyond the ink so the glyph-centre test in
    // the exporter is comfortably inside it, but not so far that it reaches a
    // neighbouring line.
    const padX = 0.1 * line.fontSize;
    const erase = displayRectToSource(
        { x: ink.x - padX, y: ink.y - 0.05 * line.fontSize, width: ink.width + 2 * padX, height: ink.height + 0.1 * line.fontSize },
        displayRotation,
        source.width,
        source.height,
    );

    const measured = measureText(content, line.fontId, fontSize, line.bold, line.italic);

    return {
        id: createId("ann"),
        pageId,
        kind: "text",
        x: line.x,
        y: line.baseline - baselineOffset(line.fontId, fontSize),
        width: Math.max(line.width, measured) + 2,
        height: fontSize * LINE_HEIGHT_RATIO,
        text: content,
        fontId: line.fontId,
        fontSize,
        bold: line.bold,
        italic: line.italic,
        color: colors.ink,
        align: "left",
        erase: { rects: [erase], background: colors.background },
    };
}

/* -------------------------------------------------------------------------- */
/* Per-page cache                                                             */
/* -------------------------------------------------------------------------- */

const lineCache = new WeakMap<PDFDocumentProxy, Map<string, Promise<TextLine[]>>>();

/** Lines for a source page at a display rotation, read once per document. */
export function getTextLines(pdf: PDFDocumentProxy, sourceIndex: number, rotation: Rotation): Promise<TextLine[]> {
    let perDoc = lineCache.get(pdf);
    if (!perDoc) {
        perDoc = new Map();
        lineCache.set(pdf, perDoc);
    }
    const key = `${sourceIndex}:${rotation}`;
    let entry = perDoc.get(key);
    if (!entry) {
        entry = pdf.getPage(sourceIndex + 1).then((page) => readTextLines(page, rotation));
        entry.catch(() => perDoc!.delete(key));
        perDoc.set(key, entry);
    }
    return entry;
}

/** Whether an existing edit already covers most of `line`. */
export function isLineEdited(line: TextLine, erased: Box[]): boolean {
    const box = lineBox(line);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    return erased.some((rect) => cx >= rect.x && cx <= rect.x + rect.width && cy >= rect.y && cy <= rect.y + rect.height);
}

const canvasCache = new WeakMap<PDFDocumentProxy, Map<string, Promise<HTMLCanvasElement>>>();

/**
 * An off-screen render of a page for colour sampling. The last few are kept,
 * since edits tend to cluster on one page; each is a few megabytes, so no more.
 */
export function getSamplingCanvas(pdf: PDFDocumentProxy, sourceIndex: number, rotation: Rotation): Promise<HTMLCanvasElement> {
    let perDoc = canvasCache.get(pdf);
    if (!perDoc) {
        perDoc = new Map();
        canvasCache.set(pdf, perDoc);
    }
    const key = `${sourceIndex}:${rotation}`;
    let entry = perDoc.get(key);
    if (entry) {
        // Re-insert to mark as most recently used.
        perDoc.delete(key);
        perDoc.set(key, entry);
        return entry;
    }
    entry = pdf.getPage(sourceIndex + 1).then((page) => renderForSampling(page, rotation));
    entry.catch(() => perDoc!.delete(key));
    perDoc.set(key, entry);
    while (perDoc.size > 3) perDoc.delete(perDoc.keys().next().value!);
    return entry;
}
