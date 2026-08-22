import { cx } from "@/utils/cx";

/**
 * The brand lockup: the folded-page mark with an I-beam cursor, followed by
 * "actually / free / pdfeditor" with the middle word in the brand gradient.
 *
 * Served from `public/brand/` rather than inlined. The wordmark's type is
 * outlined (Inter Display SemiBold, with the "free" in Bold), which is exact
 * but runs to ~17 kB of path data — worth a cached request, not worth carrying
 * in every JS bundle. `brand/build.py` is the generator that produced it.
 *
 * `wordmark-white.svg` is the variant for dark backgrounds, and
 * `mark-gradient.svg` the glyph on its own; both ship alongside this one.
 */
export function Wordmark({ className }: { className?: string }) {
    return (
        // eslint-disable-next-line @next/next/no-img-element -- a static, pre-optimised SVG; next/image adds nothing here.
        <img
            src="/brand/wordmark-ink.svg"
            alt="actuallyfreepdfeditor"
            // Intrinsic size comes from the artwork's viewBox, so the box is
            // reserved before the file lands and the header does not jump.
            width={441}
            height={64}
            className={cx("h-7 w-auto", className)}
        />
    );
}
