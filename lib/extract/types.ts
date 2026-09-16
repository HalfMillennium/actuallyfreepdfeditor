/**
 * The extraction workspace's data model.
 *
 * Geometry follows the editor's convention: display points, top-left origin,
 * after the page's rotation is applied. That means a region the user drags on
 * screen maps onto text items without a second coordinate system to reason
 * about.
 */

export interface TextItem {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
}

/** Where a page's text came from. `none` means neither a text layer nor OCR has run. */
export type TextSource = "text-layer" | "ocr" | "none";

export interface PageText {
    pageIndex: number;
    /** Display size in points, rotation applied. */
    width: number;
    height: number;
    items: TextItem[];
    /**
     * Characters found in the PDF's own text layer, before any OCR.
     *
     * Reported rather than collapsed into a boolean because the honest answer
     * is often "some": a scanned page with a typed header has a text layer that
     * covers almost none of what the reader can see.
     */
    nativeCharCount: number;
    source: TextSource;
    /** Mean OCR confidence 0-100, when `source` is `ocr`. */
    ocrConfidence?: number;
}

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** A user-drawn selection on one page. */
export interface Region extends Rect {
    id: string;
    pageIndex: number;
    label?: string;
}

export type ExportFormat = "txt" | "md" | "csv" | "json";

export interface PiiKind {
    id: string;
    label: string;
    /** Higher means more likely to be genuinely sensitive if exposed. */
    severity: "high" | "medium" | "low";
}

export interface PiiMatch {
    id: string;
    kind: PiiKind["id"];
    text: string;
    pageIndex: number;
    /** Union of the rects of the text items the match spans. */
    rect: Rect;
    /** Nothing is redacted unless the user selects it. */
    selected: boolean;
}

export interface ExtractedDocument {
    id: string;
    fileName: string;
    pageCount: number;
    pages: PageText[];
    /** True once every page has a usable text source. */
    complete: boolean;
}
