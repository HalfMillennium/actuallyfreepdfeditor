import { Encodings, Font, type IFontNames } from "@pdf-lib/standard-fonts";
import { PDFArray, PDFDict, PDFName, PDFNumber, type PDFObject } from "pdf-lib";

/**
 * Glyph widths for fonts found in an existing PDF.
 *
 * Removing glyphs from the middle of a line without moving the rest of it means
 * replacing them with a gap of exactly their width, so widths have to come from
 * the file itself, not from a guess. When a font's widths cannot be known with
 * confidence this returns `null` and the caller leaves that text alone.
 */
export interface FontMetrics {
    /** Bytes per character code in a shown string. */
    bytesPerCode: 1 | 2;
    /** Horizontal advance of `code` in text-space units (i.e. already divided by 1000). */
    width(code: number): number | null;
}

/**
 * Resolves a reference and returns the object only if it is of `type`.
 *
 * Deliberately forgiving: a font dictionary with a malformed entry should cost
 * us that entry, not the whole page. (pdf-lib's own `lookup` throws instead.)
 * `type` is typed by prototype because pdf-lib's classes have private
 * constructors, which a `new (...) => T` signature will not accept.
 */
export type Lookup = <T extends PDFObject>(object: PDFObject | undefined, type: Function & { prototype: T }) => T | undefined;

function num(object: PDFObject | undefined): number | undefined {
    return object instanceof PDFNumber ? object.asNumber() : undefined;
}

/** Standard-14 names, plus the aliases Acrobat treats as the same face. */
const STANDARD_ALIASES: Record<string, IFontNames> = {
    Helvetica: "Helvetica",
    "Helvetica-Bold": "Helvetica-Bold",
    "Helvetica-Oblique": "Helvetica-Oblique",
    "Helvetica-BoldOblique": "Helvetica-BoldOblique",
    Arial: "Helvetica",
    "Arial,Bold": "Helvetica-Bold",
    "Arial,Italic": "Helvetica-Oblique",
    "Arial,BoldItalic": "Helvetica-BoldOblique",
    "Times-Roman": "Times-Roman",
    "Times-Bold": "Times-Bold",
    "Times-Italic": "Times-Italic",
    "Times-BoldItalic": "Times-BoldItalic",
    TimesNewRoman: "Times-Roman",
    "TimesNewRoman,Bold": "Times-Bold",
    "TimesNewRoman,Italic": "Times-Italic",
    "TimesNewRoman,BoldItalic": "Times-BoldItalic",
    Courier: "Courier",
    "Courier-Bold": "Courier-Bold",
    "Courier-Oblique": "Courier-Oblique",
    "Courier-BoldOblique": "Courier-BoldOblique",
    CourierNew: "Courier",
    "CourierNew,Bold": "Courier-Bold",
    Symbol: "Symbol",
    ZapfDingbats: "ZapfDingbats",
};

let winAnsiNames: Map<number, string> | null = null;

/** Character code → glyph name for WinAnsiEncoding, built from pdf-lib's own table. */
function winAnsiCodeToName(): Map<number, string> {
    if (winAnsiNames) return winAnsiNames;
    winAnsiNames = new Map();
    for (const codePoint of Encodings.WinAnsi.supportedCodePoints) {
        const { code, name } = Encodings.WinAnsi.encodeUnicodeCodePoint(codePoint);
        if (!winAnsiNames.has(code)) winAnsiNames.set(code, name);
    }
    return winAnsiNames;
}

function builtinCodeToName(fontName: IFontNames): Map<number, string> {
    if (fontName !== "Symbol" && fontName !== "ZapfDingbats") return winAnsiCodeToName();
    const encoding = Encodings[fontName];
    const map = new Map<number, string>();
    for (const codePoint of encoding.supportedCodePoints) {
        const { code, name } = encoding.encodeUnicodeCodePoint(codePoint);
        if (!map.has(code)) map.set(code, name);
    }
    return map;
}

/** Applies an `/Encoding` dictionary's `/Differences` on top of a base table. */
function withDifferences(base: Map<number, string>, encoding: PDFDict | undefined, lookup: Lookup): Map<number, string> {
    const differences = encoding ? lookup(encoding.get(PDFName.of("Differences")), PDFArray) : undefined;
    if (!differences) return base;

    const table = new Map(base);
    let code = 0;
    for (let i = 0; i < differences.size(); i++) {
        const entry = differences.get(i);
        if (entry instanceof PDFNumber) code = entry.asNumber();
        else if (entry instanceof PDFName) table.set(code++, entry.decodeText());
    }
    return table;
}

/** Parses a CIDFont `/W` array into a code → width map (in 1/1000 em). */
function parseCidWidths(array: PDFArray, lookup: Lookup): Map<number, number> {
    const widths = new Map<number, number>();
    let i = 0;
    while (i < array.size()) {
        const first = num(array.get(i));
        const next = array.get(i + 1);
        const listed = lookup(next, PDFArray);
        if (first === undefined) break;

        if (listed) {
            for (let j = 0; j < listed.size(); j++) {
                const width = num(lookup(listed.get(j), PDFNumber));
                if (width !== undefined) widths.set(first + j, width);
            }
            i += 2;
        } else {
            const last = num(next);
            const width = num(array.get(i + 2));
            if (last === undefined || width === undefined) break;
            // Guard against a hostile range that would allocate millions of entries.
            for (let cid = first; cid <= Math.min(last, first + 65535); cid++) widths.set(cid, width);
            i += 3;
        }
    }
    return widths;
}

export function loadFontMetrics(font: PDFDict, lookup: Lookup): FontMetrics | null {
    const subtype = lookup(font.get(PDFName.of("Subtype")), PDFName)?.decodeText();

    if (subtype === "Type0") {
        // Only the Identity CMaps map two-byte codes straight to CIDs. Anything
        // else needs the embedded CMap parsed, which is out of scope.
        const encoding = lookup(font.get(PDFName.of("Encoding")), PDFName)?.decodeText();
        if (encoding !== "Identity-H") return null;

        const descendant = lookup(lookup(font.get(PDFName.of("DescendantFonts")), PDFArray)?.get(0), PDFDict);
        if (!descendant) return null;

        const defaultWidth = num(lookup(descendant.get(PDFName.of("DW")), PDFNumber)) ?? 1000;
        const w = lookup(descendant.get(PDFName.of("W")), PDFArray);
        const widths = w ? parseCidWidths(w, lookup) : new Map<number, number>();

        return { bytesPerCode: 2, width: (code) => (widths.get(code) ?? defaultWidth) / 1000 };
    }

    if (subtype !== "Type1" && subtype !== "TrueType" && subtype !== "MMType1" && subtype !== "Type3") return null;

    // Type 3 glyph widths are in glyph space, which the font matrix maps to
    // text space; everyone else uses thousandths of an em.
    let unit = 1 / 1000;
    if (subtype === "Type3") {
        const matrix = lookup(font.get(PDFName.of("FontMatrix")), PDFArray);
        const a = matrix ? num(lookup(matrix.get(0), PDFNumber)) : undefined;
        if (a === undefined) return null;
        unit = a;
    }

    const widthsArray = lookup(font.get(PDFName.of("Widths")), PDFArray);
    if (widthsArray) {
        const firstChar = num(lookup(font.get(PDFName.of("FirstChar")), PDFNumber)) ?? 0;
        const descriptor = lookup(font.get(PDFName.of("FontDescriptor")), PDFDict);
        const missing = num(lookup(descriptor?.get(PDFName.of("MissingWidth")), PDFNumber)) ?? 0;
        const widths: number[] = [];
        for (let i = 0; i < widthsArray.size(); i++) widths.push(num(lookup(widthsArray.get(i), PDFNumber)) ?? missing);

        return {
            bytesPerCode: 1,
            width: (code) => {
                const width = widths[code - firstChar];
                return (width ?? missing) * unit;
            },
        };
    }

    // No /Widths: legal only for the standard 14, whose metrics are public.
    const baseFont = lookup(font.get(PDFName.of("BaseFont")), PDFName)
        ?.decodeText()
        .replace(/^[A-Z]{6}\+/, "");
    const standard = baseFont ? STANDARD_ALIASES[baseFont] : undefined;
    if (!standard) return null;

    const afm = Font.load(standard);
    const encodingEntry = font.get(PDFName.of("Encoding"));
    const encodingDict = lookup(encodingEntry, PDFDict);
    const names = withDifferences(builtinCodeToName(standard), encodingDict, lookup);

    return {
        bytesPerCode: 1,
        width: (code) => {
            const name = names.get(code);
            if (!name) return null;
            const width = afm.getWidthOfGlyph(name);
            return typeof width === "number" ? width / 1000 : null;
        },
    };
}
