import type { FontId } from "./types";

/**
 * Text has to land in exactly the same place in the browser preview and in the
 * exported PDF, so both sides derive their geometry from this one table rather
 * than each guessing at line boxes.
 *
 * `ascent` / `descent` are the values published for the PDF standard-14 fonts,
 * expressed as a fraction of the em.
 *
 * The variant names are written out as plain strings rather than imported from
 * pdf-lib's `StandardFonts`: this module is pulled in by the toolbar, and a
 * value import would drag the whole of pdf-lib into the initial bundle for the
 * sake of twelve string constants. `lib/export-pdf.ts` checks them against the
 * real enum.
 */
export type StandardFontName =
    | "Helvetica"
    | "Helvetica-Bold"
    | "Helvetica-Oblique"
    | "Helvetica-BoldOblique"
    | "Times-Roman"
    | "Times-Bold"
    | "Times-Italic"
    | "Times-BoldItalic"
    | "Courier"
    | "Courier-Bold"
    | "Courier-Oblique"
    | "Courier-BoldOblique";

interface FontSpec {
    label: string;
    /** What the browser should render the live preview with. */
    cssStack: string;
    ascent: number;
    descent: number;
    variants: {
        regular: StandardFontName;
        bold: StandardFontName;
        italic: StandardFontName;
        boldItalic: StandardFontName;
    };
}

export const FONTS: Record<FontId, FontSpec> = {
    helvetica: {
        label: "Helvetica",
        cssStack: 'Helvetica, Arial, "Liberation Sans", sans-serif',
        ascent: 0.718,
        descent: 0.207,
        variants: {
            regular: "Helvetica",
            bold: "Helvetica-Bold",
            italic: "Helvetica-Oblique",
            boldItalic: "Helvetica-BoldOblique",
        },
    },
    times: {
        label: "Times",
        cssStack: '"Times New Roman", Times, "Liberation Serif", serif',
        ascent: 0.683,
        descent: 0.217,
        variants: {
            regular: "Times-Roman",
            bold: "Times-Bold",
            italic: "Times-Italic",
            boldItalic: "Times-BoldItalic",
        },
    },
    courier: {
        label: "Courier",
        cssStack: '"Courier New", Courier, "Liberation Mono", monospace',
        ascent: 0.629,
        descent: 0.157,
        variants: {
            regular: "Courier",
            bold: "Courier-Bold",
            italic: "Courier-Oblique",
            boldItalic: "Courier-BoldOblique",
        },
    },
};

export const FONT_OPTIONS = (Object.keys(FONTS) as FontId[]).map((id) => ({ id, label: FONTS[id].label }));

/** Line box height as a multiple of the font size. Mirrored in CSS. */
export const LINE_HEIGHT_RATIO = 1.25;

export function standardFontFor(fontId: FontId, bold: boolean, italic: boolean): StandardFontName {
    const { variants } = FONTS[fontId];
    if (bold && italic) return variants.boldItalic;
    if (bold) return variants.bold;
    if (italic) return variants.italic;
    return variants.regular;
}

/**
 * Distance from the top of a line box down to the text baseline.
 *
 * A CSS line box of height `fontSize * LINE_HEIGHT_RATIO` centres the font's
 * (ascent + descent) block inside itself and puts the baseline `ascent` below
 * the top of that block. Reproducing that here is what keeps the exported
 * baseline aligned with the on-screen one.
 */
export function baselineOffset(fontId: FontId, fontSize: number): number {
    const { ascent, descent } = FONTS[fontId];
    const halfLeading = (LINE_HEIGHT_RATIO - (ascent + descent)) / 2;
    return (halfLeading + ascent) * fontSize;
}
