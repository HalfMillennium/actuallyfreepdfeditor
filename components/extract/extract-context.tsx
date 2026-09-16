"use client";

import { type ReactNode, createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import type { PDFDocumentProxy } from "pdfjs-dist";

import { createId } from "@/lib/geometry";
import { loadPdf, PasswordProtectedError } from "@/lib/pdf-document";
import type { Rotation, SourcePageSize } from "@/lib/types";
import { totalRotation } from "@/lib/types";

import { findPii } from "@/lib/extract/pii";
import { surveyDocument } from "@/lib/extract/text-layer";
import type { ExtractedDocument, PageText, PiiMatch, Region } from "@/lib/extract/types";

/**
 * State for the extraction workspace.
 *
 * Several files are held at once so the same operation can be run across a
 * batch. Everything — bytes, text, matches — stays in memory in this tab and is
 * dropped when it closes; nothing is persisted and nothing is sent anywhere.
 */

export interface LoadedFile {
    id: string;
    fileName: string;
    /** Pristine bytes, kept for redaction export. */
    bytes: ArrayBuffer;
    pdf: PDFDocumentProxy;
    sizes: SourcePageSize[];
    document: ExtractedDocument;
    pii: PiiMatch[];
    status: "surveying" | "ready" | "ocr" | "error";
    error?: string;
    /** 0-1 while OCR runs. */
    ocrProgress?: number;
}

interface ExtractContextValue {
    files: LoadedFile[];
    activeId: string | null;
    active: LoadedFile | null;
    regions: Region[];
    busy: boolean;
    error: string | null;
    addFiles: (files: File[]) => Promise<void>;
    setActiveId: (id: string) => void;
    removeFile: (id: string) => void;
    clearAll: () => void;
    addRegion: (region: Omit<Region, "id">) => void;
    removeRegion: (id: string) => void;
    clearRegions: () => void;
    togglePii: (fileId: string, matchId: string) => void;
    setPiiSelection: (fileId: string, kind: string | null, selected: boolean) => void;
    runOcr: (fileId: string, pageIndices?: number[]) => Promise<void>;
    replacePages: (fileId: string, pages: PageText[]) => void;
    displayRotation: (file: LoadedFile, pageIndex: number) => Rotation;
}

const ExtractContext = createContext<ExtractContextValue | null>(null);

export function useExtract(): ExtractContextValue {
    const context = useContext(ExtractContext);
    if (!context) throw new Error("useExtract must be used inside <ExtractProvider>.");
    return context;
}

const MAX_FILE_BYTES = 100 * 1024 * 1024;

export function ExtractProvider({ children }: { children: ReactNode }) {
    const [files, setFiles] = useState<LoadedFile[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [regions, setRegions] = useState<Region[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Guards against a second OCR run being started for a file while the first
    // is still going; the wasm heap does not appreciate it.
    const ocrLock = useRef<Set<string>>(new Set());

    const patch = useCallback((id: string, update: Partial<LoadedFile>) => {
        setFiles((current) => current.map((file) => (file.id === id ? { ...file, ...update } : file)));
    }, []);

    const addFiles = useCallback(async (incoming: File[]) => {
        setError(null);
        setBusy(true);

        try {
            for (const file of incoming) {
                if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
                    setError(`${file.name} is not a PDF. Scan or convert images to PDF first.`);
                    continue;
                }
                if (file.size > MAX_FILE_BYTES) {
                    setError(`${file.name} is larger than 100 MB.`);
                    continue;
                }

                const id = createId("file");
                const bytes = await file.arrayBuffer();

                try {
                    const { proxy, sizes } = await loadPdf(bytes);
                    const rotations = sizes.map((size) => totalRotation(size, 0));
                    const pages = await surveyDocument(proxy, rotations);

                    const document: ExtractedDocument = {
                        id,
                        fileName: file.name,
                        pageCount: proxy.numPages,
                        pages,
                        complete: pages.every((page) => page.source !== "none"),
                    };

                    const loaded: LoadedFile = {
                        id,
                        fileName: file.name,
                        bytes,
                        pdf: proxy,
                        sizes,
                        document,
                        pii: findPii(pages),
                        status: "ready",
                    };

                    setFiles((current) => [...current, loaded]);
                    setActiveId((current) => current ?? id);
                } catch (cause) {
                    setError(
                        cause instanceof PasswordProtectedError
                            ? `${file.name} is password protected. Remove the password and try again.`
                            : `${file.name} could not be opened.`,
                    );
                }
            }
        } finally {
            setBusy(false);
        }
    }, []);

    const removeFile = useCallback((id: string) => {
        setFiles((current) => {
            const next = current.filter((file) => file.id !== id);
            setActiveId((active) => (active === id ? (next[0]?.id ?? null) : active));
            return next;
        });
        setRegions((current) => current.filter(() => false));
    }, []);

    const clearAll = useCallback(() => {
        setFiles([]);
        setActiveId(null);
        setRegions([]);
        setError(null);
    }, []);

    const replacePages = useCallback(
        (fileId: string, pages: PageText[]) => {
            setFiles((current) =>
                current.map((file) => {
                    if (file.id !== fileId) return file;

                    const merged = file.document.pages.map((existing) => pages.find((page) => page.pageIndex === existing.pageIndex) ?? existing);
                    const document = { ...file.document, pages: merged, complete: merged.every((page) => page.source !== "none") };
                    // Re-scan for PII: text that only OCR could read may well be
                    // the sensitive part.
                    return { ...file, document, pii: findPii(merged) };
                }),
            );
        },
        [],
    );

    const runOcr = useCallback(
        async (fileId: string, pageIndices?: number[]) => {
            if (ocrLock.current.has(fileId)) return;
            ocrLock.current.add(fileId);

            const file = files.find((candidate) => candidate.id === fileId);
            if (!file) {
                ocrLock.current.delete(fileId);
                return;
            }

            const targets = pageIndices ?? file.document.pages.filter((page) => page.source === "none").map((page) => page.pageIndex);
            if (targets.length === 0) {
                ocrLock.current.delete(fileId);
                return;
            }

            patch(fileId, { status: "ocr", ocrProgress: 0 });

            try {
                const { ocrPage } = await import("@/lib/extract/ocr");
                const done: PageText[] = [];

                for (const [position, pageIndex] of targets.entries()) {
                    const source = file.sizes[pageIndex];
                    const page = await ocrPage({
                        pdf: file.pdf,
                        pageIndex,
                        rotation: totalRotation(source, 0),
                        onProgress: ({ ratio }) => patch(fileId, { ocrProgress: (position + ratio) / targets.length }),
                    });
                    done.push(page);
                    // Commit each page as it lands so a long scan shows progress
                    // rather than nothing until the end.
                    replacePages(fileId, [page]);
                }

                patch(fileId, { status: "ready", ocrProgress: 1 });
            } catch (cause) {
                patch(fileId, { status: "error", error: `OCR failed: ${String(cause)}` });
            } finally {
                ocrLock.current.delete(fileId);
            }
        },
        [files, patch, replacePages],
    );

    const addRegion = useCallback((region: Omit<Region, "id">) => {
        setRegions((current) => [...current, { ...region, id: createId("region") }]);
    }, []);

    const removeRegion = useCallback((id: string) => setRegions((current) => current.filter((region) => region.id !== id)), []);
    const clearRegions = useCallback(() => setRegions([]), []);

    const togglePii = useCallback((fileId: string, matchId: string) => {
        setFiles((current) =>
            current.map((file) =>
                file.id === fileId
                    ? { ...file, pii: file.pii.map((match) => (match.id === matchId ? { ...match, selected: !match.selected } : match)) }
                    : file,
            ),
        );
    }, []);

    const setPiiSelection = useCallback((fileId: string, kind: string | null, selected: boolean) => {
        setFiles((current) =>
            current.map((file) =>
                file.id === fileId
                    ? { ...file, pii: file.pii.map((match) => (kind === null || match.kind === kind ? { ...match, selected } : match)) }
                    : file,
            ),
        );
    }, []);

    const displayRotation = useCallback((file: LoadedFile, pageIndex: number): Rotation => totalRotation(file.sizes[pageIndex], 0), []);

    const active = useMemo(() => files.find((file) => file.id === activeId) ?? null, [files, activeId]);

    const value = useMemo<ExtractContextValue>(
        () => ({
            files,
            activeId,
            active,
            regions,
            busy,
            error,
            addFiles,
            setActiveId,
            removeFile,
            clearAll,
            addRegion,
            removeRegion,
            clearRegions,
            togglePii,
            setPiiSelection,
            runOcr,
            replacePages,
            displayRotation,
        }),
        [files, activeId, active, regions, busy, error, addFiles, removeFile, clearAll, addRegion, removeRegion, clearRegions, togglePii, setPiiSelection, runOcr, replacePages, displayRotation],
    );

    return <ExtractContext.Provider value={value}>{children}</ExtractContext.Provider>;
}
