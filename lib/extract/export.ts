import { parseTable, toCsv, toJsonRecords, toMarkdownTable } from "./tables";
import { toPlainText } from "./text-layer";
import type { ExportFormat, ExtractedDocument, PageText, Region } from "./types";
import { itemsInRect } from "./tables";

/**
 * Turning extracted text into something a person or a script can use.
 *
 * Every format is produced in the browser from data already in memory. There is
 * no conversion service behind any of this, which is the point: the marginal
 * cost of an export is zero, so it can be unlimited and free without the
 * product becoming unattractive the month somebody exports a thousand pages.
 */

export interface ExportInput {
    document: ExtractedDocument;
    /** Restrict to these page indices. Empty means every page. */
    pageIndices?: number[];
    /** When present, only text inside these regions is exported. */
    regions?: Region[];
    format: ExportFormat;
}

function pagesFor(document: ExtractedDocument, pageIndices?: number[]): PageText[] {
    if (!pageIndices || pageIndices.length === 0) return document.pages;
    const wanted = new Set(pageIndices);
    return document.pages.filter((page) => wanted.has(page.pageIndex));
}

export function exportDocument({ document, pageIndices, regions, format }: ExportInput): string {
    const pages = pagesFor(document, pageIndices);

    // A region selection means the user has pointed at something specific, so
    // honour that rather than exporting whole pages around it.
    if (regions && regions.length > 0) return exportRegions(document, regions, format);

    switch (format) {
        case "txt":
            return pages.map((page) => toPlainText(page.items)).join("\n\n");

        case "md":
            return pages
                .map((page) => {
                    const heading = `## Page ${page.pageIndex + 1}`;
                    const note = page.source === "ocr" ? `\n\n*Read by OCR${page.ocrConfidence ? ` — ${Math.round(page.ocrConfidence)}% confidence` : ""}.*` : "";
                    return `${heading}${note}\n\n${toPlainText(page.items)}`;
                })
                .join("\n\n");

        case "csv": {
            // Whole-page CSV only makes sense as one row per line; a page is
            // not a table unless the user says which part of it is.
            const rows = pages.flatMap((page) =>
                toPlainText(page.items)
                    .split("\n")
                    .filter(Boolean)
                    .map((line) => [String(page.pageIndex + 1), line]),
            );
            return toCsv([["page", "text"], ...rows]);
        }

        case "json":
            return JSON.stringify(
                {
                    fileName: document.fileName,
                    pageCount: document.pageCount,
                    pages: pages.map((page) => ({
                        page: page.pageIndex + 1,
                        source: page.source,
                        ocrConfidence: page.ocrConfidence,
                        text: toPlainText(page.items),
                    })),
                },
                null,
                2,
            );
    }
}

function exportRegions(document: ExtractedDocument, regions: Region[], format: ExportFormat): string {
    const parsed = regions.map((region) => {
        const page = document.pages.find((candidate) => candidate.pageIndex === region.pageIndex);
        const items = page ? itemsInRect(page.items, region) : [];
        return { region, page, items, table: page ? parseTable(items, page.width) : null };
    });

    switch (format) {
        case "txt":
            return parsed.map((entry) => toPlainText(entry.items)).join("\n\n");

        case "md":
            return parsed
                .map((entry) => {
                    const heading = entry.region.label ? `## ${entry.region.label}` : `## Page ${entry.region.pageIndex + 1} selection`;
                    return `${heading}\n\n${entry.table && entry.table.columnCount > 1 ? toMarkdownTable(entry.table.rows) : toPlainText(entry.items)}`;
                })
                .join("\n\n");

        case "csv":
            // Several regions concatenate with a blank line between, which every
            // spreadsheet treats as a section break rather than corrupt data.
            return parsed.map((entry) => (entry.table ? toCsv(entry.table.rows) : "")).join("\n\n");

        case "json":
            return JSON.stringify(
                parsed.map((entry) => ({
                    label: entry.region.label ?? null,
                    page: entry.region.pageIndex + 1,
                    ragged: entry.table?.ragged ?? false,
                    records: entry.table ? toJsonRecords(entry.table.rows) : [],
                })),
                null,
                2,
            );
    }
}

export const MIME: Record<ExportFormat, string> = {
    txt: "text/plain;charset=utf-8",
    md: "text/markdown;charset=utf-8",
    csv: "text/csv;charset=utf-8",
    json: "application/json;charset=utf-8",
};

export function downloadText(content: string, fileName: string, format: ExportFormat): void {
    const blob = new Blob([content], { type: MIME[format] });
    const url = URL.createObjectURL(blob);

    const link = window.document.createElement("a");
    link.href = url;
    link.download = fileName;
    window.document.body.append(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadBytes(bytes: Uint8Array, fileName: string): void {
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const link = window.document.createElement("a");
    link.href = url;
    link.download = fileName;
    window.document.body.append(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
