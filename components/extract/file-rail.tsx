"use client";

import { type DragEvent, useRef, useState } from "react";

import { Plus, Trash01 } from "@untitledui/icons";

import { cx } from "@/utils/cx";

import { type LoadedFile, useExtract } from "./extract-context";

function statusLine(file: LoadedFile): string {
    if (file.status === "error") return file.error ?? "Could not be read";
    if (file.status === "ocr") return `Reading page text… ${Math.round((file.ocrProgress ?? 0) * 100)}%`;
    if (file.status === "surveying") return "Looking for text…";

    const scanned = file.document.pages.filter((page) => page.source === "none").length;
    const pages = `${file.document.pageCount} ${file.document.pageCount === 1 ? "page" : "pages"}`;
    if (scanned > 0) return `${pages} · ${scanned} need OCR`;
    return `${pages} · ${file.pii.length} possible ${file.pii.length === 1 ? "match" : "matches"}`;
}

export function FileRail() {
    const { files, activeId, setActiveId, removeFile, addFiles } = useExtract();
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const onDrop = (event: DragEvent) => {
        event.preventDefault();
        setIsDragging(false);
        const dropped = Array.from(event.dataTransfer.files);
        if (dropped.length > 0) void addFiles(dropped);
    };

    return (
        <aside
            onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={cx("flex w-64 shrink-0 flex-col border-r border-secondary bg-primary", isDragging && "bg-brand-primary")}
        >
            <div className="flex items-center justify-between px-3 py-2.5">
                <h2 className="text-xs font-semibold tracking-wide text-tertiary uppercase">Files</h2>
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-brand-secondary transition hover:bg-secondary"
                >
                    <Plus className="size-3.5" />
                    Add
                </button>
                <input
                    ref={inputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                        const chosen = Array.from(event.target.files ?? []);
                        if (chosen.length > 0) void addFiles(chosen);
                        event.target.value = "";
                    }}
                />
            </div>

            <ul className="flex-1 overflow-y-auto px-2 pb-3">
                {files.map((file) => (
                    <li key={file.id}>
                        <div
                            className={cx(
                                "group relative flex w-full items-start gap-2 rounded-lg p-2 transition",
                                file.id === activeId ? "bg-brand-primary" : "hover:bg-secondary",
                            )}
                        >
                            <button type="button" onClick={() => setActiveId(file.id)} className="min-w-0 flex-1 cursor-pointer text-left">
                                <p className="truncate text-sm font-medium text-primary" title={file.fileName}>
                                    {file.fileName}
                                </p>
                                <p className={cx("truncate text-xs", file.status === "error" ? "text-error-primary" : "text-tertiary")}>{statusLine(file)}</p>
                                {file.status === "ocr" && (
                                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-quaternary">
                                        <div className="h-full bg-brand-solid transition-[width]" style={{ width: `${Math.round((file.ocrProgress ?? 0) * 100)}%` }} />
                                    </div>
                                )}
                            </button>
                            <button
                                type="button"
                                aria-label={`Remove ${file.fileName}`}
                                onClick={() => removeFile(file.id)}
                                className="cursor-pointer rounded p-1 text-fg-quaternary opacity-0 transition group-hover:opacity-100 hover:text-fg-error-primary focus-visible:opacity-100"
                            >
                                <Trash01 className="size-3.5" />
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        </aside>
    );
}
