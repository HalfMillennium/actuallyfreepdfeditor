import {
    LineCapStyle,
    closePath,
    fill,
    PDFDocument,
    type StandardFonts,
    type PDFFont,
    type PDFPage,
    concatTransformationMatrix,
    degrees,
    lineTo,
    moveTo,
    popGraphicsState,
    pushGraphicsState,
    rgb,
    setLineCap,
    setFillingColor,
    setLineWidth,
    setStrokingColor,
    stroke,
} from "pdf-lib";

import { LINE_HEIGHT_RATIO, type StandardFontName, baselineOffset, standardFontFor } from "./fonts";

// lib/fonts.ts spells the standard-14 font names out as string literals so the
// toolbar can import it without dragging pdf-lib into the initial bundle. This
// is where that shortcut is checked: `${StandardFonts}` is the union of the
// enum's string values, so the line stops compiling if the two ever drift.
type FontNamesMatchPdfLib = StandardFontName extends `${StandardFonts}` ? true : never;
const _fontNamesAreValid: FontNamesMatchPdfLib = true;
void _fontNamesAreValid;
import { hexToRgb01 } from "./geometry";
import { type UserRect, removeTextInRegions } from "./text-edit/remove-text";
import type { Annotation, EditorDocument, FigureAnnotation, FontId, Rotation, SourcePageSize } from "./types";
import { displaySize, totalRotation } from "./types";

/**
 * Maps the editor's display space onto the page's PDF user space.
 *
 * Annotations are authored against the page as the user sees it: a W×H box with
 * the origin at the *bottom* left (we flip y when reading an annotation, below)
 * regardless of how the page is rotated for display. PDF content operators, on
 * the other hand, always run in the page's own unrotated user space.
 *
 * Rather than rotating every annotation individually, we push one matrix per
 * page and then draw as if rotation did not exist. Each matrix is a pure
 * rotation (determinant 1), so text and images come out the right way round and
 * un-mirrored.
 *
 * `pw` / `ph` are the page's unrotated visible dimensions, and `origin` is the
 * lower-left corner of its visible box — usually (0, 0), but not for a page
 * whose MediaBox or CropBox starts elsewhere, which pdf.js (and therefore the
 * on-screen preview) measures from.
 */
function displayToUserSpace(rotation: Rotation, pw: number, ph: number, origin = { x: 0, y: 0 }): [number, number, number, number, number, number] {
    const m = ((): [number, number, number, number, number, number] => {
        switch (rotation) {
            case 90:
                return [0, 1, -1, 0, pw, 0];
            case 180:
                return [-1, 0, 0, -1, pw, ph];
            case 270:
                return [0, -1, 1, 0, 0, ph];
            default:
                return [1, 0, 0, 1, 0, 0];
        }
    })();
    return [m[0], m[1], m[2], m[3], m[4] + origin.x, m[5] + origin.y];
}

/** The page's visible box, as pdf.js computes it: the CropBox clipped to the MediaBox. */
function visibleBox(page: PDFPage): { x: number; y: number; width: number; height: number } {
    const media = page.getMediaBox();
    const crop = page.getCropBox();
    const x0 = Math.max(media.x, crop.x);
    const y0 = Math.max(media.y, crop.y);
    const x1 = Math.min(media.x + media.width, crop.x + crop.width);
    const y1 = Math.min(media.y + media.height, crop.y + crop.height);
    if (x1 <= x0 || y1 <= y0) return media;
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

interface ExportInput {
    doc: EditorDocument;
    /** The bytes of the file the user opened. */
    sourceBytes: ArrayBuffer;
    sourceSizes: SourcePageSize[];
}

/** Fonts are embedded lazily — a document with no Courier in it shouldn't carry Courier. */
class FontCache {
    private cache = new Map<string, Promise<PDFFont>>();

    constructor(private pdf: PDFDocument) {}

    get(fontId: FontId, bold: boolean, italic: boolean): Promise<PDFFont> {
        const name = standardFontFor(fontId, bold, italic) as StandardFonts;
        let entry = this.cache.get(name);
        if (!entry) {
            entry = this.pdf.embedFont(name);
            this.cache.set(name, entry);
        }
        return entry;
    }
}

/**
 * Flattens the editor state into a new PDF and returns its bytes.
 *
 * Annotations are burned into each page's content stream rather than added as
 * PDF annotation objects: the result is a document that looks identical
 * everywhere and cannot be un-done by a reader that ignores annotations, which
 * is what you want from "white out this paragraph" or "here is my signature".
 */
export async function exportPdf({ doc, sourceBytes, sourceSizes }: ExportInput): Promise<Uint8Array> {
    // pdf.js transfers (and thereby detaches) buffers it is handed, so always
    // hand pdf-lib its own copy.
    const source = await PDFDocument.load(sourceBytes.slice(0), { ignoreEncryption: true });
    const out = await PDFDocument.create();

    out.setProducer("actuallyfreepdfeditor");
    out.setCreator("actuallyfreepdfeditor");

    const copied = await out.copyPages(
        source,
        doc.pages.map((page) => page.sourceIndex),
    );

    const fonts = new FontCache(out);
    const images = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();

    for (const [index, editorPage] of doc.pages.entries()) {
        const page = out.addPage(copied[index]);
        const sourceSize = sourceSizes[editorPage.sourceIndex];
        const rotation = totalRotation(sourceSize, editorPage.rotation);

        page.setRotation(degrees(rotation));

        const annotations = doc.annotations.filter((a) => a.pageId === editorPage.id);
        if (annotations.length === 0) continue;

        const box = visibleBox(page);

        // Edited text first: take the original glyphs out of the page before
        // anything is drawn on top of it. This must run before pdf-lib's own
        // drawing calls, which normalise and extend the page's /Contents.
        const covers = eraseReplacedText(page, annotations, box);
        for (const cover of covers) {
            const { r, g, b } = hexToRgb01(cover.color);
            page.drawRectangle({ x: cover.rect.x0, y: cover.rect.y0, width: cover.rect.x1 - cover.rect.x0, height: cover.rect.y1 - cover.rect.y0, color: rgb(r, g, b), borderWidth: 0 });
        }

        const { width: dw, height: dh } = displaySize(sourceSize, editorPage.rotation);

        page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...displayToUserSpace(rotation, sourceSize.width, sourceSize.height, box)));

        for (const annotation of annotations) {
            await drawAnnotation({ page, annotation, out, fonts, images, pageWidth: dw, pageHeight: dh });
        }

        page.pushOperators(popGraphicsState());
    }

    return out.save();
}

/**
 * Removes the original text that edit-text boxes replace, and returns the
 * regions that still need painting over.
 *
 * A region needs a cover only when removal could not vouch for it (see
 * `lib/text-edit/remove-text.ts`); where the glyphs are genuinely gone, a cover
 * would only risk a visible patch on a tinted or textured page.
 */
function eraseReplacedText(page: PDFPage, annotations: Annotation[], box: { x: number; y: number; width: number; height: number }): Array<{ rect: UserRect; color: string }> {
    const regions: Array<{ rect: UserRect; color: string }> = [];
    for (const annotation of annotations) {
        if (annotation.kind !== "text" || !annotation.erase) continue;
        for (const rect of annotation.erase.rects) {
            // Source points are top-left based; user space is bottom-left and
            // starts at the visible box's corner.
            const x0 = box.x + rect.x;
            const y1 = box.y + box.height - rect.y;
            regions.push({ rect: { x0, y0: y1 - rect.height, x1: x0 + rect.width, y1 }, color: annotation.erase.background });
        }
    }
    if (regions.length === 0) return [];

    let results;
    try {
        results = removeTextInRegions(
            page,
            regions.map((region) => region.rect),
        );
    } catch (error) {
        console.warn("Could not remove the original text; covering it instead.", error);
        return regions;
    }
    return regions.filter((_, i) => results[i].uncertain || results[i].removed === 0);
}

/**
 * Drops characters the standard fonts cannot encode.
 *
 * The replacement faces are the PDF standard 14, which speak WinAnsi only.
 * Text lifted from a PDF often carries ligatures (ﬁ), non-breaking spaces or
 * symbols outside that set; compatibility-decomposing first turns most of them
 * into plain letters, and anything left that still cannot be encoded is
 * replaced with "?" rather than failing the whole export.
 */
function encodable(font: PDFFont, text: string): string {
    const normalised = text.normalize("NFKC").replace(/[\u00a0\u2007\u202f]/g, " ");
    try {
        font.encodeText(normalised);
        return normalised;
    } catch {
        return [...normalised]
            .map((char) => {
                try {
                    font.encodeText(char);
                    return char;
                } catch {
                    return "?";
                }
            })
            .join("");
    }
}

interface DrawInput {
    page: PDFPage;
    annotation: Annotation;
    out: PDFDocument;
    fonts: FontCache;
    images: Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>;
    pageWidth: number;
    pageHeight: number;
}

async function drawAnnotation({ page, annotation, out, fonts, images, pageHeight }: DrawInput): Promise<void> {
    // The overlay measures y downward from the top of the page; PDF measures it
    // upward from the bottom. One subtraction, done once, here.
    const bottom = pageHeight - annotation.y - annotation.height;

    switch (annotation.kind) {
        case "highlight":
        case "whiteout": {
            const { r, g, b } = hexToRgb01(annotation.color);
            page.drawRectangle({
                x: annotation.x,
                y: bottom,
                width: annotation.width,
                height: annotation.height,
                color: rgb(r, g, b),
                opacity: annotation.opacity,
                borderWidth: 0,
            });
            return;
        }

        case "signature":
        case "image": {
            let image = images.get(annotation.dataUrl);
            if (!image) {
                image = annotation.dataUrl.startsWith("data:image/jpeg") ? await out.embedJpg(annotation.dataUrl) : await out.embedPng(annotation.dataUrl);
                images.set(annotation.dataUrl, image);
            }
            page.drawImage(image, {
                x: annotation.x,
                y: bottom,
                width: annotation.width,
                height: annotation.height,
            });
            return;
        }

        case "draw": {
            if (annotation.points.length < 2) return;
            const { r, g, b } = hexToRgb01(annotation.color);
            const toX = (fx: number) => annotation.x + fx * annotation.width;
            const toY = (fy: number) => bottom + (1 - fy) * annotation.height;

            const operators = [
                pushGraphicsState(),
                setStrokingColor(rgb(r, g, b)),
                setLineWidth(annotation.strokeWidth),
                setLineCap(LineCapStyle.Round),
                moveTo(toX(annotation.points[0][0]), toY(annotation.points[0][1])),
                ...annotation.points.slice(1).map(([fx, fy]) => lineTo(toX(fx), toY(fy))),
                stroke(),
                popGraphicsState(),
            ];
            page.pushOperators(...operators);
            return;
        }

        case "figure":
            drawFigure(page, annotation, bottom);
            return;

        case "text": {
            const font = await fonts.get(annotation.fontId, annotation.bold, annotation.italic);
            const { r, g, b } = hexToRgb01(annotation.color);
            const lineHeight = annotation.fontSize * LINE_HEIGHT_RATIO;
            const firstBaseline = baselineOffset(annotation.fontId, annotation.fontSize);
            const top = pageHeight - annotation.y;

            annotation.text.split("\n").forEach((raw, index) => {
                const line = encodable(font, raw);
                if (line.length === 0) return;

                let x = annotation.x;
                if (annotation.align !== "left") {
                    const lineWidth = font.widthOfTextAtSize(line, annotation.fontSize);
                    const slack = annotation.width - lineWidth;
                    x += annotation.align === "center" ? slack / 2 : slack;
                }

                page.drawText(line, {
                    x,
                    y: top - firstBaseline - index * lineHeight,
                    size: annotation.fontSize,
                    font,
                    color: rgb(r, g, b),
                });
            });
            return;
        }
    }
}

/**
 * Rectangles, ellipses, lines and arrows — mirroring `FigureBody` in the
 * overlay, including the half-stroke inset on closed shapes, so what is drawn
 * on screen is what lands in the file.
 */
function drawFigure(page: PDFPage, figure: FigureAnnotation, bottom: number): void {
    const ink = hexToRgb01(figure.stroke);
    const sw = figure.strokeWidth;

    if (figure.figure === "rectangle" || figure.figure === "ellipse") {
        const fillColor = figure.fill ? hexToRgb01(figure.fill) : null;
        const common = {
            borderColor: rgb(ink.r, ink.g, ink.b),
            borderWidth: sw,
            color: fillColor ? rgb(fillColor.r, fillColor.g, fillColor.b) : undefined,
        };
        if (figure.figure === "rectangle") {
            page.drawRectangle({ x: figure.x + sw / 2, y: bottom + sw / 2, width: Math.max(0, figure.width - sw), height: Math.max(0, figure.height - sw), ...common });
        } else {
            page.drawEllipse({
                x: figure.x + figure.width / 2,
                y: bottom + figure.height / 2,
                xScale: Math.max(0, figure.width / 2 - sw / 2),
                yScale: Math.max(0, figure.height / 2 - sw / 2),
                ...common,
            });
        }
        return;
    }

    // In the overlay y grows downward; flip each endpoint into PDF's frame.
    const x1 = figure.x + figure.start[0] * figure.width;
    const y1 = bottom + (1 - figure.start[1]) * figure.height;
    const x2 = figure.x + figure.end[0] * figure.width;
    const y2 = bottom + (1 - figure.end[1]) * figure.height;

    const color = rgb(ink.r, ink.g, ink.b);
    let shaftEnd: [number, number] = [x2, y2];
    const operators = [pushGraphicsState(), setStrokingColor(color), setFillingColor(color), setLineWidth(sw)];

    if (figure.figure === "arrow") {
        const length = Math.hypot(x2 - x1, y2 - y1) || 1;
        const size = Math.min(Math.max(sw * 4, 8), length * 0.6);
        const ux = (x2 - x1) / length;
        const uy = (y2 - y1) / length;
        const bx = x2 - ux * size;
        const by = y2 - uy * size;
        const half = size * 0.45;
        shaftEnd = [x2 - ux * size * 0.8, y2 - uy * size * 0.8];
        operators.push(
            setLineCap(LineCapStyle.Butt),
            moveTo(x1, y1),
            lineTo(...shaftEnd),
            stroke(),
            moveTo(x2, y2),
            lineTo(bx - uy * half, by + ux * half),
            lineTo(bx + uy * half, by - ux * half),
            closePath(),
            fill(),
        );
    } else {
        operators.push(setLineCap(LineCapStyle.Round), moveTo(x1, y1), lineTo(...shaftEnd), stroke());
    }

    operators.push(popGraphicsState());
    page.pushOperators(...operators);
}
