"use client";

import { useState } from "react";

import { Download01, FileCode01 } from "@untitledui/icons";

import { Button } from "@/components/base/buttons/button";
import { exportDocument, downloadText } from "@/lib/extract/export";
import type { ExportFormat } from "@/lib/extract/types";
import { cx } from "@/utils/cx";

import { useExtract } from "./extract-context";

const FORMATS: Array<{ id: ExportFormat; label: string; hint: string }> = [
    { id: "txt", label: "Text", hint: "Plain text, lines in reading order." },
    { id: "md", label: "Markdown", hint: "One heading per page; selections become tables." },
    { id: "csv", label: "CSV", hint: "A spreadsheet. Draw a box round a table first." },
    { id: "json", label: "JSON", hint: "Records keyed by the table's header row." },
];

export function ExportPanel() {
    const { active, files, regions } = useExtract();
    const [format, setFormat] = useState<ExportFormat>("txt");
    const [batch, setBatch] = useState(false);

    if (!active) return null;

    const targets = batch ? files : [active];
    const ready = targets.filter((file) => file.status === "ready" || file.status === "ocr");

    const run = () => {
        for (const file of ready) {
            // Regions belong to the page currently on screen, so they only make
            // sense for the active file; a batch export is whole documents.
            const content = exportDocument({
                document: file.document,
                regions: batch ? undefined : regions,
                format,
            });
            const base = file.fileName.replace(/\.pdf$/i, "");
            downloadText(content, `${base}.${format}`, format);
        }
    };

    const emptyPages = active.document.pages.filter((page) => page.source === "none").length;

    return (
        <section className="border-t border-secondary p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
                <FileCode01 className="size-4 text-fg-brand-primary" />
                Export
            </h2>

            <div className="mt-3 grid grid-cols-2 gap-2">
                {FORMATS.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        title={option.hint}
                        onClick={() => setFormat(option.id)}
                        className={cx(
                            "cursor-pointer rounded-lg border px-2 py-2 text-left transition",
                            format === option.id ? "border-brand bg-brand-primary" : "border-secondary hover:bg-secondary",
                        )}
                    >
                        <span className="block text-sm font-semibold text-primary">{option.label}</span>
                        <span className="mt-0.5 block text-xs leading-snug text-tertiary">{option.hint}</span>
                    </button>
                ))}
            </div>

            {regions.length > 0 && !batch && (
                <p className="mt-3 text-xs text-tertiary">
                    Only your {regions.length} {regions.length === 1 ? "selection" : "selections"} will be exported. Clear them to export whole pages.
                </p>
            )}

            {emptyPages > 0 && !batch && (
                <p className="mt-3 text-xs text-warning-primary">
                    {emptyPages} {emptyPages === 1 ? "page has" : "pages have"} no text yet — run OCR first or they will come out empty.
                </p>
            )}

            {files.length > 1 && (
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-secondary">
                    <input type="checkbox" checked={batch} onChange={(event) => setBatch(event.target.checked)} className="mt-0.5 accent-[var(--color-bg-brand-solid)]" />
                    <span>
                        Export all {files.length} files, one download each. Selections are skipped — a box drawn on this document does not mean anything on
                        another one.
                    </span>
                </label>
            )}

            <Button size="sm" color="primary" iconLeading={Download01} className="mt-3 w-full" isDisabled={ready.length === 0} onClick={run}>
                {batch ? `Export ${ready.length} files` : `Download .${format}`}
            </Button>
        </section>
    );
}
