"use client";

import { CheckCircle, Scan } from "@untitledui/icons";

import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

import { useExtract } from "./extract-context";

/**
 * Says where the text on screen came from.
 *
 * Worth its own banner because it is the one thing that decides what the rest of
 * the workspace can do — and because "this PDF is a photograph of a document"
 * is the answer most people are missing when extraction comes back empty.
 */
export function TextBanner() {
    const { active, files, runOcr } = useExtract();
    if (!active) return null;

    const scanned = active.document.pages.filter((page) => page.source === "none");
    const ocred = active.document.pages.filter((page) => page.source === "ocr").length;
    const running = active.status === "ocr";

    const othersNeedingOcr = files.filter((file) => file.id !== active.id && file.document.pages.some((page) => page.source === "none"));

    if (scanned.length === 0 && !running) {
        return (
            <div data-text-banner className="flex items-center gap-2 border-b border-secondary bg-primary px-4 py-2 text-sm">
                <CheckCircle className="size-4 shrink-0 text-fg-success-primary" />
                <span className="text-secondary">
                    {ocred > 0
                        ? `Text ready for all ${active.document.pageCount} pages (${ocred} read by OCR in this browser).`
                        : `This PDF already carries its own text layer, so every page was read exactly — no OCR needed.`}
                </span>
            </div>
        );
    }

    return (
        <div data-text-banner
            className={cx("flex flex-wrap items-center gap-3 border-b border-secondary bg-warning-primary px-4 py-2 text-sm")}>
            <Scan className="size-4 shrink-0 text-fg-warning-primary" />
            <span className="flex-1 text-secondary">
                {running
                    ? `Reading text from the scanned pages… ${Math.round((active.ocrProgress ?? 0) * 100)}%`
                    : `${scanned.length} of ${active.document.pageCount} pages look like scans: a picture with no text layer behind it. OCR can read them here in your browser.`}
            </span>

            <Button size="sm" color="secondary" iconLeading={Scan} isLoading={running} showTextWhileLoading onClick={() => void runOcr(active.id)}>
                Run OCR on {scanned.length} {scanned.length === 1 ? "page" : "pages"}
            </Button>

            {othersNeedingOcr.length > 0 && !running && (
                <Button
                    size="sm"
                    color="tertiary"
                    onClick={() => {
                        // Sequential on purpose: one wasm worker, one page at a
                        // time. Firing these in parallel just thrashes memory.
                        void (async () => {
                            for (const file of [active, ...othersNeedingOcr]) await runOcr(file.id);
                        })();
                    }}
                >
                    Do this for all {othersNeedingOcr.length + 1} files
                </Button>
            )}
        </div>
    );
}
