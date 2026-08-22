import type { Annotation, Box, Rotation } from "./types";

export function createId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/** `#rrggbb` (or `#rgb`) to the 0–1 channel triple pdf-lib wants. */
export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
    let value = hex.replace("#", "").trim();
    if (value.length === 3) {
        value = value
            .split("")
            .map((c) => c + c)
            .join("");
    }
    const int = Number.parseInt(value, 16);
    if (!Number.isFinite(int)) return { r: 0, g: 0, b: 0 };
    return {
        r: ((int >> 16) & 255) / 255,
        g: ((int >> 8) & 255) / 255,
        b: (int & 255) / 255,
    };
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** Keep a box from being dragged entirely off the page. */
export function clampBoxToPage(box: Box, pageWidth: number, pageHeight: number): Box {
    const margin = 8;
    return {
        ...box,
        x: clamp(box.x, margin - box.width, pageWidth - margin),
        y: clamp(box.y, margin - box.height, pageHeight - margin),
    };
}

/**
 * Re-place an annotation after its page is rotated by a quarter turn.
 *
 * The annotation's *centre* travels with the paper, but the annotation itself
 * stays upright and keeps its size. That is the behaviour that matches intent:
 * you rotate a page to fix how it reads, and a signature you already dropped on
 * it should still read the right way up afterwards.
 *
 * `pageWidth` / `pageHeight` describe the page *before* the turn.
 */
export function rotateAnnotationWithPage<T extends Annotation>(annotation: T, quarterTurns: 1 | 3, pageWidth: number, pageHeight: number): T {
    const cx = annotation.x + annotation.width / 2;
    const cy = annotation.y + annotation.height / 2;

    // Clockwise: (x, y) in a W×H page becomes (H - y, x) in the H×W result.
    // Counter-clockwise is the same map applied three times, which simplifies
    // to (y, W - x).
    const [ncx, ncy] = quarterTurns === 1 ? [pageHeight - cy, cx] : [cy, pageWidth - cx];

    return {
        ...annotation,
        x: ncx - annotation.width / 2,
        y: ncy - annotation.height / 2,
    };
}

export function addRotation(rotation: Rotation, delta: number): Rotation {
    return ((((rotation + delta) % 360) + 360) % 360) as Rotation;
}
