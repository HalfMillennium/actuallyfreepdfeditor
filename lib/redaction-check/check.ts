"use client";

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

import { paintsImage, readTextLayer } from "@/lib/extract/text-layer";
import type { Rect, TextItem } from "@/lib/extract/types";
import { loadPdf } from "@/lib/pdf-document";
import { renderPage } from "@/lib/pdf-document";
import type { Rotation } from "@/lib/types";

/**
 * "Did this redaction actually work?" — for any PDF, redacted by any tool.
 *
 * Everything runs in this tab. pdf.js does the parsing and text extraction in
 * its own worker; this module renders each page once, reads pixels back, and
 * compares them with where the text layer says text is.
 *
 * What a pass means is deliberately narrow: none of these checks could pull
 * hidden text out. It says nothing about text left visible by mistake.
 */

export type CheckId =
    | "covered-text"
    | "hidden-ocr"
    | "unapplied-redaction"
    | "annotation-cover"
    | "old-revision"
    | "metadata"
    | "attachments"
    | "form-fields"
    | "bookmarks";

export const CHECK_LABELS: Record<CheckId, string> = {
    "covered-text": "Text under a box",
    "hidden-ocr": "Hidden OCR text under a blacked-out scan",
    "unapplied-redaction": "Redaction mark never applied",
    "annotation-cover": "Box added as a comment",
    "old-revision": "Still in an earlier version of the file",
    metadata: "Metadata",
    attachments: "Attachments",
    "form-fields": "Form field values",
    bookmarks: "Bookmarks",
};

export interface Finding {
    id: string;
    check: CheckId;
    severity: "fail" | "warn";
    /** Recovered or exposed text. Shown masked by default. */
    text: string;
    /** Page the finding is on, when it has one. */
    pageIndex?: number;
    /** Where on the page, in display points (page rotation applied). */
    rect?: Rect;
    /** Extra context, e.g. the metadata field name. */
    label?: string;
}

export interface PageInfo {
    width: number;
    height: number;
    rotation: Rotation;
}

export interface CheckReport {
    verdict: "pass" | "fail";
    findings: Finding[];
    pages: PageInfo[];
    /** Incremental revisions found in the file, including the current one. */
    revisions: number;
}

export class UnreadablePdfError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UnreadablePdfError";
    }
}

/**
 * Luminance standard deviation (0–255) below which a region counts as flat.
 *
 * Rendered text of any size has a deviation in the dozens: ink on paper is
 * the opposite of flat. A solid box — or a blank area where text is drawn
 * invisibly — is close to zero. Tuned against `scripts/verify-redaction-check`'s
 * fixtures, including dark photos and dark slide backgrounds.
 */
const FLAT_STDDEV = 6;

/** Fewer hidden characters than this in a row is treated as sampling noise. */
const MIN_HIDDEN_RUN = 3;

/** Pixel budget per rendered page, so a poster-sized page cannot exhaust memory. */
const MAX_PIXELS = 6_000_000;

interface Raster {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    scale: number;
}

async function rasterise(page: PDFPageProxy, rotation: Rotation, canvas: HTMLCanvasElement): Promise<Raster> {
    const base = page.getViewport({ scale: 1, rotation });
    const scale = Math.min(2, Math.sqrt(MAX_PIXELS / (base.width * base.height)));
    await renderPage({ page, canvas, scale, rotation, maxPixelRatio: 1 }).promise;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("No 2D canvas context.");
    return { data: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height, scale };
}

/** Mean and standard deviation of luminance inside a rect given in points. */
function regionStats(raster: Raster, rect: Rect): { mean: number; stddev: number; pixels: number } {
    const x0 = Math.max(0, Math.floor(rect.x * raster.scale));
    const y0 = Math.max(0, Math.floor(rect.y * raster.scale));
    const x1 = Math.min(raster.width, Math.ceil((rect.x + rect.width) * raster.scale));
    const y1 = Math.min(raster.height, Math.ceil((rect.y + rect.height) * raster.scale));

    let n = 0;
    let sum = 0;
    let sumSq = 0;
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const i = (y * raster.width + x) * 4;
            // Unpainted canvas is transparent: that is paper, i.e. white.
            const alpha = raster.data[i + 3] / 255;
            const l = (0.299 * raster.data[i] + 0.587 * raster.data[i + 1] + 0.114 * raster.data[i + 2]) * alpha + 255 * (1 - alpha);
            sum += l;
            sumSq += l * l;
            n++;
        }
    }
    if (n === 0) return { mean: 255, stddev: 255, pixels: 0 };
    const mean = sum / n;
    return { mean, stddev: Math.sqrt(Math.max(0, sumSq / n - mean * mean)), pixels: n };
}

interface CharBox {
    char: string;
    rect: Rect;
}

let measurer: CanvasRenderingContext2D | null = null;

/**
 * Splits a text item into per-character boxes.
 *
 * pdf.js gives one box per run, not per glyph. A cover over just the account
 * number in "Account: 12345678" leaves the run as a whole full of ink, so the
 * test has to be made character by character. Glyph widths are measured in the
 * run's generic family and scaled to the run's real width: not the embedded
 * font's exact metrics, but close enough that a run's edge lands on the right
 * letter, which uniform spacing does not.
 */
function charBoxes(item: TextItem): CharBox[] {
    const chars = [...item.text];
    measurer ??= document.createElement("canvas").getContext("2d");
    let widths = chars.map(() => 1);
    if (measurer) {
        measurer.font = `100px ${item.fontFamily || "sans-serif"}`;
        widths = chars.map((char) => Math.max(1, measurer!.measureText(char).width));
    }
    const total = widths.reduce((sum, w) => sum + w, 0);
    let x = item.x;
    return chars.map((char, i) => {
        const width = (widths[i] / total) * item.width;
        const box = { char, rect: { x, y: item.y, width, height: item.height } };
        x += width;
        return box;
    });
}

function union(rects: Rect[]): Rect {
    const x = Math.min(...rects.map((r) => r.x));
    const y = Math.min(...rects.map((r) => r.y));
    return {
        x,
        y,
        width: Math.max(...rects.map((r) => r.x + r.width)) - x,
        height: Math.max(...rects.map((r) => r.y + r.height)) - y,
    };
}

function centreInside(rect: Rect, box: Rect): boolean {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    return cx >= box.x && cx <= box.x + box.width && cy >= box.y && cy <= box.y + box.height;
}

/** Groups flagged characters into contiguous runs within one text item. */
function runs(boxes: CharBox[], flagged: boolean[]): Array<{ text: string; rect: Rect }> {
    const out: Array<{ text: string; rect: Rect }> = [];
    let current: CharBox[] = [];
    const flush = () => {
        const text = current.map((b) => b.char).join("").trim();
        if (text.length > 0) out.push({ text, rect: union(current.map((b) => b.rect)) });
        current = [];
    };
    boxes.forEach((box, i) => {
        if (flagged[i]) current.push(box);
        else flush();
    });
    flush();
    return out;
}

interface AnnotationLike {
    subtype?: string;
    rect?: number[];
}

/**
 * Annotation subtypes that can sit over text and hide it, and that most
 * readers let you move or switch off. Whether one actually hides anything
 * (a filled box) or not (an outline) is decided by the pixels, not by the
 * annotation's colour entries, which pdf.js does not expose.
 */
function isCover(subtype: string | undefined): boolean {
    return subtype === "Square" || subtype === "Circle" || subtype === "Polygon" || subtype === "FreeText" || subtype === "Ink" || subtype === "Stamp";
}

/**
 * Which characters of a run are visually hidden: flat pixels where the text
 * layer says there is a glyph.
 *
 * Single flat characters are what measurement error looks like, so a finding
 * needs a run of several (or the whole item, for very short ones) that is flat
 * as a whole. The run's edges are then extended by any neighbouring letter
 * whose half nearest the run is flat too, so a word is not reported with its
 * first or last letter missing because a glyph box straddled the cover's edge.
 */
function hiddenCharacters(raster: Raster, boxes: CharBox[]): boolean[] {
    const visible = (b: CharBox) => b.char.trim() !== "";
    const flat = boxes.map((b) => visible(b) && regionStats(raster, b.rect).stddev < FLAT_STDDEV);
    const flagged = boxes.map(() => false);
    const totalVisible = boxes.filter(visible).length;

    const half = (b: CharBox, side: "left" | "right"): Rect => ({
        x: side === "left" ? b.rect.x : b.rect.x + b.rect.width / 2,
        y: b.rect.y,
        width: b.rect.width / 2,
        height: b.rect.height,
    });

    let start = -1;
    const close = (end: number) => {
        if (start === -1) return;
        const span = boxes.slice(start, end);
        const count = span.filter(visible).length;
        if ((count >= MIN_HIDDEN_RUN || count === totalVisible) && regionStats(raster, union(span.map((b) => b.rect))).stddev < FLAT_STDDEV) {
            let from = start;
            let to = end;
            while (from > 0 && visible(boxes[from - 1]) && regionStats(raster, half(boxes[from - 1], "right")).stddev < FLAT_STDDEV) from--;
            while (to < boxes.length && visible(boxes[to]) && regionStats(raster, half(boxes[to], "left")).stddev < FLAT_STDDEV) to++;
            for (let i = from; i < to; i++) flagged[i] = true;
        }
        start = -1;
    };
    boxes.forEach((b, i) => {
        // Spaces inside a covered run are part of it.
        const inRun = flat[i] || (start !== -1 && !visible(b));
        if (inRun && start === -1) start = i;
        if (!inRun) close(i);
    });
    close(boxes.length);
    return flagged;
}

let findingSeq = 0;
const nextId = () => `f${++findingSeq}`;

async function checkPage(
    pdf: PDFDocumentProxy,
    pageIndex: number,
    canvas: HTMLCanvasElement,
): Promise<{ info: PageInfo; findings: Finding[]; text: string }> {
    const page = await pdf.getPage(pageIndex + 1);
    const rotation = (((page.rotate % 360) + 360) % 360) as Rotation;
    const viewport = page.getViewport({ scale: 1, rotation });
    const findings: Finding[] = [];

    const layer = await readTextLayer(page, pageIndex, rotation);
    // Only runs that read level on screen: for those the text layer's box is
    // where the glyphs really are. A vertical label's box is the wrong shape,
    // and sampling it would call blank paper beside the text "hidden".
    const items = layer.items.filter((item) => item.horizontal !== false && item.text.trim() !== "" && item.height >= 2 && item.width > 0);
    const text = layer.items.map((item) => item.text).join(" ");

    const annotations = ((await page.getAnnotations().catch(() => [])) as AnnotationLike[])
        .filter((a) => Array.isArray(a.rect) && a.rect.length === 4)
        .map((a) => {
            const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(a.rect as number[]);
            return { subtype: a.subtype, box: { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) } };
        });
    const redactMarks = annotations.filter((a) => a.subtype === "Redact");
    const covers = annotations.filter((a) => isCover(a.subtype));

    const raster = items.length > 0 ? await rasterise(page, rotation, canvas) : null;
    const scanned = raster ? await paintsImage(page) : false;

    for (const item of items) {
        const boxes = charBoxes(item);

        // An unapplied redaction mark is a finding whatever it looks like: the
        // text under it is exactly the text somebody meant to remove.
        const marked = boxes.map((b) => redactMarks.some((mark) => centreInside(b.rect, mark.box)));
        for (const run of runs(boxes, marked)) {
            findings.push({ id: nextId(), check: "unapplied-redaction", severity: "fail", text: run.text, pageIndex, rect: run.rect, label: "Redact" });
        }

        if (!raster) continue;
        const flagged = hiddenCharacters(raster, boxes).map((hidden, i) => hidden && !marked[i]);

        for (const run of runs(boxes, flagged)) {
            // Flat *and* under a comment-type annotation: the annotation is
            // what hides it, and readers let you move or switch those off.
            const cover = covers.find((c) => centreInside(run.rect, c.box));
            findings.push({
                id: nextId(),
                check: cover ? "annotation-cover" : scanned ? "hidden-ocr" : "covered-text",
                severity: "fail",
                text: run.text,
                pageIndex,
                rect: run.rect,
                label: cover ? cover.subtype : regionStats(raster, run.rect).mean < 128 ? "dark box" : "light box",
            });
        }
    }

    page.cleanup();
    return { info: { width: viewport.width, height: viewport.height, rotation }, findings, text };
}

/* -------------------------------------------------------------------------- */
/* Earlier revisions                                                          */
/* -------------------------------------------------------------------------- */

/** Byte offsets just past each `%%EOF` marker. The last one ends the current revision. */
export function revisionEnds(bytes: Uint8Array): number[] {
    const ends: number[] = [];
    const marker = [0x25, 0x25, 0x45, 0x4f, 0x46]; // %%EOF
    outer: for (let i = 0; i <= bytes.length - marker.length; i++) {
        for (let j = 0; j < marker.length; j++) if (bytes[i + j] !== marker[j]) continue outer;
        ends.push(i + marker.length);
    }
    return ends;
}

function normalise(text: string): string {
    return text.replace(/\s+/g, " ").trim().toLowerCase();
}

async function documentText(pdf: PDFDocumentProxy): Promise<string[]> {
    const strings: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const content = await (await pdf.getPage(i)).getTextContent();
        for (const item of content.items) if ("str" in item && item.str.trim()) strings.push(item.str);
    }
    return strings;
}

/**
 * Text present in an earlier revision of the file but absent from the current
 * one — i.e. something an incremental save "removed" while leaving the old
 * version sitting in the same file.
 */
async function checkRevisions(bytes: Uint8Array, currentText: string): Promise<{ findings: Finding[]; revisions: number }> {
    const ends = revisionEnds(bytes);
    // A file whose only %%EOF is at the end has one revision.
    const earlier = ends.slice(0, -1).filter((end) => end > 64);
    const current = normalise(currentText);
    const findings: Finding[] = [];
    const seen = new Set<string>();

    // Newest first, and not without limit: a file saved a hundred times over
    // does not need a hundred full re-parses to make the point.
    for (const end of earlier.reverse().slice(0, 8)) {
        let old: PDFDocumentProxy | null = null;
        try {
            // Linearised files carry an early %%EOF that does not end a real
            // revision; pdf.js either rejects that prefix or reads a subset of
            // the current text, and both are harmless here.
            old = (await loadPdf(bytes.slice(0, end).buffer as ArrayBuffer)).proxy;
            for (const str of await documentText(old)) {
                const key = normalise(str);
                if (key.length < 2 || seen.has(key) || current.includes(key)) continue;
                seen.add(key);
                findings.push({ id: nextId(), check: "old-revision", severity: "fail", text: str.trim() });
            }
        } catch {
            /* not a loadable revision */
        } finally {
            await old?.destroy();
        }
        if (findings.length > 200) break;
    }

    return { findings, revisions: earlier.length + 1 };
}

/* -------------------------------------------------------------------------- */
/* Metadata and other hiding places                                           */
/* -------------------------------------------------------------------------- */

const INFO_FIELDS = ["Title", "Author", "Subject", "Keywords", "Creator", "Producer"] as const;

/** XMP keys that are pure bookkeeping (dates, UUIDs) and name nobody. */
const XMP_NOISE = /date$|documentid$|instanceid$|^xmptk|^pdf:pdfversion$|^dc:format$/i;

export async function metadataFindings(pdf: PDFDocumentProxy): Promise<Finding[]> {
    const findings: Finding[] = [];
    const { info, metadata } = (await pdf.getMetadata().catch(() => ({ info: {}, metadata: null }))) as {
        info: Record<string, unknown>;
        metadata: { getAll(): Record<string, unknown> } | null;
    };

    for (const field of INFO_FIELDS) {
        const value = info?.[field];
        if (typeof value === "string" && value.trim()) findings.push({ id: nextId(), check: "metadata", severity: "warn", label: field, text: value.trim() });
    }

    const xmp = metadata?.getAll() ?? {};
    for (const [key, value] of Object.entries(xmp)) {
        if (XMP_NOISE.test(key)) continue;
        const text = Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : "";
        if (text.trim()) findings.push({ id: nextId(), check: "metadata", severity: "warn", label: `XMP ${key}`, text: text.trim() });
    }

    return findings;
}

async function otherFindings(pdf: PDFDocumentProxy): Promise<Finding[]> {
    const findings: Finding[] = [];

    const attachments = (await pdf.getAttachments().catch(() => null)) as Record<string, { filename?: string }> | null;
    for (const [name, attachment] of Object.entries(attachments ?? {})) {
        findings.push({ id: nextId(), check: "attachments", severity: "warn", text: attachment?.filename || name });
    }

    const fields = (await pdf.getFieldObjects().catch(() => null)) as Record<string, Array<{ value?: unknown }>> | null;
    for (const [name, widgets] of Object.entries(fields ?? {})) {
        const value = widgets.map((w) => w.value).find((v) => typeof v === "string" && v.trim() && v !== "Off");
        if (typeof value === "string") findings.push({ id: nextId(), check: "form-fields", severity: "warn", label: name, text: value.trim() });
    }

    const outline = (await pdf.getOutline().catch(() => null)) as Array<{ title: string; items: unknown[] }> | null;
    const walk = (nodes: Array<{ title: string; items: unknown[] }> | null) => {
        for (const node of nodes ?? []) {
            if (node.title?.trim()) findings.push({ id: nextId(), check: "bookmarks", severity: "warn", text: node.title.trim() });
            walk(node.items as Array<{ title: string; items: unknown[] }>);
        }
    };
    walk(outline);

    return findings;
}

/* -------------------------------------------------------------------------- */

export interface CheckProgress {
    phase: "pages" | "revisions" | "metadata";
    done: number;
    total: number;
}

export async function checkRedaction(bytes: ArrayBuffer, onProgress?: (progress: CheckProgress) => void): Promise<CheckReport> {
    const raw = new Uint8Array(bytes.slice(0));

    let pdf: PDFDocumentProxy;
    try {
        pdf = (await loadPdf(bytes.slice(0))).proxy;
    } catch (error) {
        const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
        throw new UnreadablePdfError(
            name === "PasswordProtectedError"
                ? "This PDF is password protected, so we can't read it. Remove the password and try again."
                : "We couldn't read this file. It may be damaged, or not a PDF.",
        );
    }

    const findings: Finding[] = [];
    const pages: PageInfo[] = [];
    const canvas = document.createElement("canvas");
    let allText = "";

    try {
        for (let i = 0; i < pdf.numPages; i++) {
            onProgress?.({ phase: "pages", done: i, total: pdf.numPages });
            const result = await checkPage(pdf, i, canvas);
            pages.push(result.info);
            findings.push(...result.findings);
            allText += `${result.text}\n`;
            // Give the tab a frame between pages so a long file does not freeze it.
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        onProgress?.({ phase: "revisions", done: 0, total: 1 });
        const revisions = await checkRevisions(raw, allText);
        findings.push(...revisions.findings);

        onProgress?.({ phase: "metadata", done: 0, total: 1 });
        findings.push(...(await metadataFindings(pdf)), ...(await otherFindings(pdf)));

        // Release the canvas's backing store now rather than at GC.
        canvas.width = 0;
        canvas.height = 0;

        return {
            verdict: findings.some((f) => f.severity === "fail") ? "fail" : "pass",
            findings,
            pages,
            revisions: revisions.revisions,
        };
    } finally {
        await pdf.destroy();
    }
}

/** "John Smith" → "J••• S••••". People screen-share; the default is not to reprint the secret. */
export function mask(text: string): string {
    return text.replace(/\S+/g, (word) => word[0] + "•".repeat(Math.max(0, [...word].length - 1)));
}
