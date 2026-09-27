import {
    PDFArray,
    PDFContentStream,
    PDFDict,
    PDFName,
    PDFNumber,
    type PDFPage,
    PDFRawStream,
    PDFRef,
    decodePDFRawStream,
} from "pdf-lib";

import { type Operand, type Operation, formatNumber, hexString, parseContentStream, splice } from "./content-stream";
import { type FontMetrics, type Lookup, loadFontMetrics } from "./font-metrics";

/**
 * Removing original text from a page, glyph by glyph.
 *
 * This is what makes "edit text" an edit rather than a cover-up: the glyphs the
 * user replaced are taken out of the page's content stream, so the old wording
 * cannot be selected, searched or copied out of the exported file.
 *
 * The page's text operators are replayed with a small interpreter that tracks
 * the text and graphics state (ISO 32000-1 §9.4) closely enough to know where
 * each glyph lands. A glyph whose centre falls inside an erase region is dropped
 * and replaced with a positioning adjustment of exactly its advance, so every
 * glyph *after* it on the same line stays precisely where it was.
 *
 * Anything the interpreter cannot vouch for — a font whose widths are unknown,
 * a form XObject overlapping the region, text drawn invisibly over a scan —
 * marks that region `uncertain`, and the exporter paints a cover over it as
 * well. The failure mode is therefore "covered as before", never "the rest of
 * the line shifted".
 */

/** An axis-aligned rectangle in the page's PDF user space. */
export interface UserRect {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

export interface RegionResult {
    /** Glyphs taken out of the content stream. */
    removed: number;
    /** True when something in this region could not be removed with confidence. */
    uncertain: boolean;
}

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `m1 × m2` in PDF's row-vector convention: apply m1, then m2. */
function multiply(m1: Matrix, m2: Matrix): Matrix {
    const [a1, b1, c1, d1, e1, f1] = m1;
    const [a2, b2, c2, d2, e2, f2] = m2;
    return [a1 * a2 + b1 * c2, a1 * b2 + b1 * d2, c1 * a2 + d1 * c2, c1 * b2 + d1 * d2, e1 * a2 + f1 * c2 + e2, e1 * b2 + f1 * d2 + f2];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

interface GraphicsState {
    ctm: Matrix;
    charSpacing: number;
    wordSpacing: number;
    /** Horizontal scaling as a fraction (Tz 100 → 1). */
    hScale: number;
    leading: number;
    font: string | null;
    fontSize: number;
    rise: number;
    renderMode: number;
}

function inside(rect: UserRect, x: number, y: number): boolean {
    return x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
}

function intersects(a: UserRect, b: UserRect): boolean {
    return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

function numberOperands(operands: Operand[]): number[] | null {
    const values: number[] = [];
    for (const operand of operands) {
        if (operand.type !== "number") return null;
        values.push(operand.value);
    }
    return values;
}

/** Reads, decodes and concatenates a page's content streams. */
function readPageContent(page: PDFPage): Uint8Array | null {
    const contents = page.node.get(PDFName.of("Contents"));
    const resolved = contents instanceof PDFRef ? page.doc.context.lookup(contents) : contents;
    const refs = resolved instanceof PDFArray ? resolved.asArray() : resolved ? [contents] : [];

    const parts: Uint8Array[] = [];
    for (const ref of refs) {
        const stream = ref instanceof PDFRef ? page.doc.context.lookup(ref) : ref;
        if (stream instanceof PDFRawStream) parts.push(decodePDFRawStream(stream).decode());
        else if (stream instanceof PDFContentStream) parts.push(stream.getContents());
        else return null;
    }

    // Streams may split a token across their boundary only if a newline
    // separates them in the concatenation (§7.8.2), so join with one.
    const total = parts.reduce((sum, part) => sum + part.length + 1, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
        out[offset++] = 0x0a;
    }
    return out;
}

/**
 * Removes the glyphs whose centres fall inside `regions` from `page`'s content.
 *
 * The page's `/Contents` is replaced with a single new stream rather than
 * edited in place: duplicated pages share their content-stream objects after
 * `copyPages`, and an edit on one copy must not leak into the other.
 */
export function removeTextInRegions(page: PDFPage, regions: UserRect[]): RegionResult[] {
    const results: RegionResult[] = regions.map(() => ({ removed: 0, uncertain: false }));
    if (regions.length === 0) return results;

    const context = page.doc.context;
    const lookup: Lookup = (object, type) => {
        const resolved = object instanceof PDFRef ? context.lookup(object) : object;
        return resolved instanceof type ? (resolved as never) : undefined;
    };
    const markAll = () => results.forEach((result) => (result.uncertain = true));

    let content: Uint8Array | null;
    let operations: Operation[];
    try {
        content = readPageContent(page);
        if (!content) {
            markAll();
            return results;
        }
        operations = parseContentStream(content);
    } catch {
        markAll();
        return results;
    }

    const resources = lookup(page.node.getInheritableAttribute(PDFName.of("Resources")), PDFDict);
    const fontDict = lookup(resources?.get(PDFName.of("Font")), PDFDict);
    const xObjects = lookup(resources?.get(PDFName.of("XObject")), PDFDict);

    const metricsCache = new Map<string, FontMetrics | null>();
    const metricsFor = (name: string | null): FontMetrics | null => {
        if (!name) return null;
        if (!metricsCache.has(name)) {
            const font = lookup(fontDict?.get(PDFName.of(name)), PDFDict);
            let metrics: FontMetrics | null = null;
            try {
                metrics = font ? loadFontMetrics(font, lookup) : null;
            } catch {
                metrics = null;
            }
            metricsCache.set(name, metrics);
        }
        return metricsCache.get(name) ?? null;
    };

    let gs: GraphicsState = {
        ctm: IDENTITY,
        charSpacing: 0,
        wordSpacing: 0,
        hScale: 1,
        leading: 0,
        font: null,
        fontSize: 0,
        rise: 0,
        renderMode: 0,
    };
    const stack: GraphicsState[] = [];
    let tm: Matrix = IDENTITY;
    let tlm: Matrix = IDENTITY;
    /** The text position is unknown until the next absolute or line move. */
    let positionLost = false;

    const edits: Array<{ start: number; end: number; text: string }> = [];

    const nextLine = (tx: number, ty: number) => {
        tlm = multiply([1, 0, 0, 1, tx, ty], tlm);
        tm = tlm;
        positionLost = false;
    };

    /** Flags every region the point falls in, or all of them if the point is unknown. */
    const flagAt = (point: [number, number] | null) => {
        if (!point) return markAll();
        regions.forEach((region, i) => {
            if (inside(region, point[0], point[1])) results[i].uncertain = true;
        });
    };

    /**
     * Replays one text-showing operation. Returns the TJ array to write in its
     * place when glyphs were removed, or null to leave it untouched.
     */
    const show = (elements: Operand[]): string | null => {
        const metrics = metricsFor(gs.font);
        const origin = positionLost ? null : apply(multiply(tm, gs.ctm), 0, gs.rise);
        const scale = gs.fontSize * gs.hScale;

        if (!metrics || scale === 0 || positionLost) {
            // Cannot know where this text ends, so neither can we know where
            // the next string on this line starts.
            flagAt(origin);
            positionLost = true;
            return null;
        }

        type Piece = { kind: "keep"; bytes: number[] } | { kind: "shift"; amount: number };
        const pieces: Piece[] = [];
        let removedHere = 0;

        const keep = (bytes: number[]) => {
            const last = pieces[pieces.length - 1];
            if (last?.kind === "keep") last.bytes.push(...bytes);
            else pieces.push({ kind: "keep", bytes: [...bytes] });
        };
        const shift = (amount: number) => {
            const last = pieces[pieces.length - 1];
            if (last?.kind === "shift") last.amount += amount;
            else pieces.push({ kind: "shift", amount });
        };

        for (const element of elements) {
            if (element.type === "number") {
                // A TJ adjustment: thousandths of text space, subtracted.
                const tx = (-element.value / 1000) * scale;
                tm = multiply([1, 0, 0, 1, tx, 0], tm);
                shift(element.value);
                continue;
            }
            if (element.type !== "string") continue;

            const { bytes } = element;
            for (let i = 0; i + metrics.bytesPerCode <= bytes.length; i += metrics.bytesPerCode) {
                const code = metrics.bytesPerCode === 2 ? (bytes[i] << 8) | bytes[i + 1] : bytes[i];
                const glyphBytes = metrics.bytesPerCode === 2 ? [bytes[i], bytes[i + 1]] : [bytes[i]];
                const w0 = metrics.width(code);

                if (w0 === null) {
                    flagAt(apply(multiply([gs.fontSize * gs.hScale, 0, 0, gs.fontSize, 0, gs.rise], multiply(tm, gs.ctm)), 0, 0));
                    positionLost = true;
                    return null;
                }

                const trm = multiply([gs.fontSize * gs.hScale, 0, 0, gs.fontSize, 0, gs.rise], multiply(tm, gs.ctm));
                // Test the middle of the glyph at about x-height, which is
                // robust to the region being a touch generous or a touch tight.
                const [cx, cy] = apply(trm, w0 / 2, 0.3);
                const regionIndex = regions.findIndex((region) => inside(region, cx, cy));

                const isSpace = metrics.bytesPerCode === 1 && code === 32;
                const tx = (w0 * gs.fontSize + gs.charSpacing + (isSpace ? gs.wordSpacing : 0)) * gs.hScale;

                if (regionIndex === -1) {
                    keep(glyphBytes);
                } else {
                    results[regionIndex].removed++;
                    // Invisible text (render mode 3, typically an OCR layer
                    // over a scan) is removed, but what the reader sees there
                    // is an image, which still needs covering.
                    if (gs.renderMode === 3 || gs.renderMode === 7) results[regionIndex].uncertain = true;
                    removedHere++;
                    // Keep the advance: -n/1000 × Tfs × Th = tx.
                    shift((-tx * 1000) / scale);
                }

                tm = multiply([1, 0, 0, 1, tx, 0], tm);
            }
        }

        if (removedHere === 0) return null;

        const parts = pieces
            .filter((piece) => piece.kind === "keep" || Math.abs(piece.amount) > 1e-6)
            .map((piece) => (piece.kind === "keep" ? hexString(Uint8Array.from(piece.bytes)) : formatNumber(piece.amount)));
        return `[${parts.join(" ")}] TJ`;
    };

    for (const op of operations) {
        const { operator, operands } = op;

        switch (operator) {
            case "q":
                stack.push({ ...gs });
                break;
            case "Q":
                gs = stack.pop() ?? gs;
                break;
            case "cm": {
                const m = numberOperands(operands);
                if (m?.length === 6) gs = { ...gs, ctm: multiply(m as Matrix, gs.ctm) };
                break;
            }
            case "BT":
                tm = IDENTITY;
                tlm = IDENTITY;
                positionLost = false;
                break;
            case "Tc":
                gs.charSpacing = numberOperands(operands)?.[0] ?? gs.charSpacing;
                break;
            case "Tw":
                gs.wordSpacing = numberOperands(operands)?.[0] ?? gs.wordSpacing;
                break;
            case "Tz":
                gs.hScale = (numberOperands(operands)?.[0] ?? gs.hScale * 100) / 100;
                break;
            case "TL":
                gs.leading = numberOperands(operands)?.[0] ?? gs.leading;
                break;
            case "Ts":
                gs.rise = numberOperands(operands)?.[0] ?? gs.rise;
                break;
            case "Tr":
                gs.renderMode = numberOperands(operands)?.[0] ?? gs.renderMode;
                break;
            case "Tf": {
                const [name, size] = operands;
                if (name?.type === "name") gs.font = name.value;
                if (size?.type === "number") gs.fontSize = size.value;
                break;
            }
            case "Td": {
                const v = numberOperands(operands);
                if (v?.length === 2) nextLine(v[0], v[1]);
                break;
            }
            case "TD": {
                const v = numberOperands(operands);
                if (v?.length === 2) {
                    gs.leading = -v[1];
                    nextLine(v[0], v[1]);
                }
                break;
            }
            case "Tm": {
                const v = numberOperands(operands);
                if (v?.length === 6) {
                    tlm = v as Matrix;
                    tm = tlm;
                    positionLost = false;
                }
                break;
            }
            case "T*":
                nextLine(0, -gs.leading);
                break;
            case "Tj": {
                const replacement = show(operands.slice(-1));
                if (replacement) edits.push({ start: op.start, end: op.end, text: replacement });
                break;
            }
            case "TJ": {
                const array = operands[operands.length - 1];
                if (array?.type !== "array") break;
                const replacement = show(array.items);
                if (replacement) edits.push({ start: op.start, end: op.end, text: replacement });
                break;
            }
            case "'": {
                nextLine(0, -gs.leading);
                const replacement = show(operands.slice(-1));
                if (replacement) edits.push({ start: op.start, end: op.end, text: `T* ${replacement}` });
                break;
            }
            case '"': {
                const [aw, ac] = operands;
                if (aw?.type === "number") gs.wordSpacing = aw.value;
                if (ac?.type === "number") gs.charSpacing = ac.value;
                nextLine(0, -gs.leading);
                const replacement = show(operands.slice(-1));
                if (replacement) {
                    edits.push({
                        start: op.start,
                        end: op.end,
                        text: `${formatNumber(gs.wordSpacing)} Tw ${formatNumber(gs.charSpacing)} Tc T* ${replacement}`,
                    });
                }
                break;
            }
            case "Do": {
                // Text inside a form XObject is out of reach of this rewrite; if
                // the form could be drawing inside a region, say so.
                const name = operands[0];
                if (name?.type !== "name") break;
                const xObject = lookup(xObjects?.get(PDFName.of(name.value)), PDFRawStream);
                if (lookup(xObject?.dict.get(PDFName.of("Subtype")), PDFName)?.decodeText() !== "Form") break;

                const bbox = lookup(xObject?.dict.get(PDFName.of("BBox")), PDFArray)
                    ?.asArray()
                    .map((value) => lookup(value, PDFNumber)?.asNumber() ?? 0);
                const matrixArray = lookup(xObject?.dict.get(PDFName.of("Matrix")), PDFArray)
                    ?.asArray()
                    .map((value) => lookup(value, PDFNumber)?.asNumber() ?? 0);
                if (!bbox || bbox.length !== 4) {
                    markAll();
                    break;
                }
                const toUser = multiply(matrixArray?.length === 6 ? (matrixArray as Matrix) : IDENTITY, gs.ctm);
                const corners = [apply(toUser, bbox[0], bbox[1]), apply(toUser, bbox[2], bbox[1]), apply(toUser, bbox[0], bbox[3]), apply(toUser, bbox[2], bbox[3])];
                const extent: UserRect = {
                    x0: Math.min(...corners.map((c) => c[0])),
                    y0: Math.min(...corners.map((c) => c[1])),
                    x1: Math.max(...corners.map((c) => c[0])),
                    y1: Math.max(...corners.map((c) => c[1])),
                };
                regions.forEach((region, i) => {
                    if (intersects(region, extent)) results[i].uncertain = true;
                });
                break;
            }
        }
    }

    if (edits.length > 0) {
        const rewritten = splice(content, edits);
        const stream = context.flateStream(rewritten);
        page.node.set(PDFName.of("Contents"), context.obj([context.register(stream)]));
    }

    return results;
}
