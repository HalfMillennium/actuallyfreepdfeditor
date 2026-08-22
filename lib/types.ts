/**
 * The editor's document model.
 *
 * Geometry convention — every annotation stores its box in **display points**
 * of the page it lives on: the origin is the top-left corner of the page as the
 * user currently sees it (i.e. after the page's rotation has been applied), x
 * grows right, y grows down, and one unit is one PDF point at 100% zoom.
 *
 * Keeping annotations in the *rotated* frame rather than the PDF's own frame is
 * what makes the editor WYSIWYG: the overlay can position an annotation with
 * `left: x * zoom`, and the exporter can draw it without ever thinking about
 * which way up the underlying page is (see `lib/export-pdf.ts`, which folds the
 * rotation into a single transformation matrix per page).
 */

export type Rotation = 0 | 90 | 180 | 270;

export type ToolId = "select" | "text" | "signature" | "image" | "highlight" | "whiteout" | "draw";

export type FontId = "helvetica" | "times" | "courier";

export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface AnnotationCommon extends Box {
    id: string;
    /** Id of the `EditorPage` this annotation is stamped onto. */
    pageId: string;
}

export interface TextAnnotation extends AnnotationCommon {
    kind: "text";
    text: string;
    fontId: FontId;
    fontSize: number;
    bold: boolean;
    italic: boolean;
    /** `#rrggbb`. */
    color: string;
    align: "left" | "center" | "right";
}

export interface ImageAnnotation extends AnnotationCommon {
    /**
     * `signature` and `image` behave identically at export time; they are
     * distinct kinds only so the UI can label and filter them separately.
     */
    kind: "signature" | "image";
    /** A `data:image/png;base64,…` or `data:image/jpeg;base64,…` URL. */
    dataUrl: string;
    /** Intrinsic pixel size, used to preserve aspect ratio while resizing. */
    naturalWidth: number;
    naturalHeight: number;
}

export interface ShapeAnnotation extends AnnotationCommon {
    kind: "highlight" | "whiteout";
    color: string;
    opacity: number;
}

export interface DrawAnnotation extends AnnotationCommon {
    kind: "draw";
    /**
     * Stroke points, stored relative to the annotation's own box so the whole
     * scribble can be moved or resized as a unit. Each value is a 0–1 fraction
     * of `width` / `height`.
     */
    points: Array<[number, number]>;
    color: string;
    strokeWidth: number;
}

export type Annotation = TextAnnotation | ImageAnnotation | ShapeAnnotation | DrawAnnotation;

export type AnnotationKind = Annotation["kind"];

/**
 * One page in the *output* document. Several `EditorPage`s may share a
 * `sourceIndex` — that is how "duplicate page" works.
 */
export interface EditorPage {
    id: string;
    /** Index of the page in the originally-opened PDF. */
    sourceIndex: number;
    /** Rotation to apply on top of whatever the source page already declares. */
    rotation: Rotation;
}

/** Intrinsic, rotation-free size of a source page, in PDF points. */
export interface SourcePageSize {
    width: number;
    height: number;
    /** The `/Rotate` value the source page was authored with. */
    rotation: Rotation;
}

export interface EditorDocument {
    /** Stable id for the loaded file; also the IndexedDB key for its bytes. */
    id: string;
    fileName: string;
    pages: EditorPage[];
    annotations: Annotation[];
}

/**
 * The size of a page *as displayed*, i.e. with source rotation and the user's
 * extra rotation both applied. Annotation coordinates are relative to this.
 */
export function displaySize(source: SourcePageSize, extraRotation: Rotation): { width: number; height: number } {
    const total = (source.rotation + extraRotation) % 360;
    return total === 90 || total === 270 ? { width: source.height, height: source.width } : { width: source.width, height: source.height };
}

/** Total rotation the viewer should apply to a page. */
export function totalRotation(source: SourcePageSize, extraRotation: Rotation): Rotation {
    return (((source.rotation + extraRotation) % 360) + 360) % 360 as Rotation;
}
