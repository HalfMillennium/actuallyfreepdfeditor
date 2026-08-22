import {
    LineCapStyle,
    PDFDocument,
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
    setLineWidth,
    setStrokingColor,
    stroke,
} from "pdf-lib";

import { LINE_HEIGHT_RATIO, baselineOffset, standardFontFor } from "./fonts";
import { hexToRgb01 } from "./geometry";
import type { Annotation, EditorDocument, FontId, Rotation, SourcePageSize } from "./types";
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
 * `pw` / `ph` are the page's unrotated media dimensions.
 */
function displayToUserSpace(rotation: Rotation, pw: number, ph: number): [number, number, number, number, number, number] {
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
        const name = standardFontFor(fontId, bold, italic);
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

        const { width: dw, height: dh } = displaySize(sourceSize, editorPage.rotation);

        page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...displayToUserSpace(rotation, sourceSize.width, sourceSize.height)));

        for (const annotation of annotations) {
            await drawAnnotation({ page, annotation, out, fonts, images, pageWidth: dw, pageHeight: dh });
        }

        page.pushOperators(popGraphicsState());
    }

    return out.save();
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

        case "text": {
            const font = await fonts.get(annotation.fontId, annotation.bold, annotation.italic);
            const { r, g, b } = hexToRgb01(annotation.color);
            const lineHeight = annotation.fontSize * LINE_HEIGHT_RATIO;
            const firstBaseline = baselineOffset(annotation.fontId, annotation.fontSize);
            const top = pageHeight - annotation.y;

            annotation.text.split("\n").forEach((line, index) => {
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
