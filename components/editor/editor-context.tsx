"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";

import type { PDFDocumentProxy } from "pdfjs-dist";

import { type EditorAction, type EditorState, editorReducer, initialEditorState } from "@/lib/editor-state";
import { createId } from "@/lib/geometry";
import { PasswordProtectedError, loadPdf } from "@/lib/pdf-document";
import {
    clearAllDocuments,
    clearSession,
    loadDocumentBytes,
    readPrefs,
    readSession,
    saveDocumentBytes,
    writePrefs,
    writeSession,
} from "@/lib/session-storage";
import type { EditorDocument } from "@/lib/types";

interface EditorContextValue {
    state: EditorState;
    dispatch: (action: EditorAction) => void;
    /** pdf.js handle for the open document. Not part of reducer state — it is not serialisable. */
    pdf: PDFDocumentProxy | null;
    /** The pristine bytes of the opened file, kept for export. */
    sourceBytes: ArrayBuffer | null;
    status: "idle" | "loading" | "restoring" | "ready";
    error: string | null;
    openFile: (file: File) => Promise<void>;
    closeDocument: () => Promise<void>;
    /** Signatures drawn earlier in this session, offered for re-use. */
    savedSignatures: string[];
    rememberSignature: (dataUrl: string) => void;
    forgetSignature: (dataUrl: string) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor(): EditorContextValue {
    const context = useContext(EditorContext);
    if (!context) throw new Error("useEditor must be used inside <EditorProvider>.");
    return context;
}

const MAX_FILE_BYTES = 100 * 1024 * 1024;

export function EditorProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(editorReducer, initialEditorState);
    const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
    const [status, setStatus] = useState<EditorContextValue["status"]>("idle");
    const [error, setError] = useState<string | null>(null);
    const [savedSignatures, setSavedSignatures] = useState<string[]>([]);

    const sourceBytesRef = useRef<ArrayBuffer | null>(null);
    const restoreAttempted = useRef(false);

    const adoptDocument = useCallback(async (bytes: ArrayBuffer, doc: EditorDocument) => {
        const { proxy, sizes } = await loadPdf(bytes);
        sourceBytesRef.current = bytes;
        setPdf(proxy);
        dispatch({ type: "document/open", doc, sourceSizes: sizes });
    }, []);

    /* ------------------------------------------------------------------ */
    /* Restore a previous session                                          */
    /* ------------------------------------------------------------------ */

    useEffect(() => {
        if (restoreAttempted.current) return;
        restoreAttempted.current = true;

        const prefs = readPrefs();
        setSavedSignatures(prefs.savedSignatures ?? []);

        const session = readSession();
        if (!session) return;

        let cancelled = false;
        setStatus("restoring");

        void (async () => {
            try {
                const bytes = await loadDocumentBytes(session.id);
                if (!bytes || cancelled) {
                    // Metadata without bytes is useless — don't leave a ghost
                    // session that can never be restored.
                    clearSession();
                    return;
                }
                await adoptDocument(bytes, {
                    id: session.id,
                    fileName: session.fileName,
                    pages: session.pages,
                    annotations: session.annotations,
                });
                if (prefs.zoom) dispatch({ type: "zoom/set", zoom: prefs.zoom });
            } catch {
                clearSession();
            } finally {
                if (!cancelled) setStatus("idle");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [adoptDocument]);

    /* ------------------------------------------------------------------ */
    /* Persist as the user works                                           */
    /* ------------------------------------------------------------------ */

    useEffect(() => {
        if (!state.doc) return;
        // Debounced: dragging an annotation fires a great many updates and we
        // do not want to re-serialise the whole document on each frame.
        const handle = window.setTimeout(() => {
            writeSession({
                id: state.doc!.id,
                fileName: state.doc!.fileName,
                pages: state.doc!.pages,
                annotations: state.doc!.annotations,
            });
        }, 400);
        return () => window.clearTimeout(handle);
    }, [state.doc]);

    useEffect(() => {
        writePrefs({ zoom: state.zoom });
    }, [state.zoom]);

    /* ------------------------------------------------------------------ */
    /* Opening and closing                                                 */
    /* ------------------------------------------------------------------ */

    const openFile = useCallback(
        async (file: File) => {
            setError(null);

            if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
                setError("That doesn't look like a PDF. Pick a file ending in .pdf.");
                return;
            }
            if (file.size > MAX_FILE_BYTES) {
                setError("That file is larger than 100 MB. Everything here runs in your browser, and that's more than a tab can comfortably hold.");
                return;
            }

            setStatus("loading");
            try {
                const bytes = await file.arrayBuffer();
                const id = createId("doc");
                const { proxy, sizes } = await loadPdf(bytes);

                sourceBytesRef.current = bytes;
                setPdf(proxy);
                dispatch({
                    type: "document/open",
                    doc: {
                        id,
                        fileName: file.name,
                        pages: sizes.map((_, index) => ({ id: createId("page"), sourceIndex: index, rotation: 0 })),
                        annotations: [],
                    },
                    sourceSizes: sizes,
                });

                await saveDocumentBytes(id, bytes, file.name);
            } catch (cause) {
                setError(
                    cause instanceof PasswordProtectedError
                        ? cause.message
                        : "That PDF couldn't be opened — it may be corrupt or use a feature this reader doesn't support.",
                );
            } finally {
                setStatus("idle");
            }
        },
        [],
    );

    const closeDocument = useCallback(async () => {
        setError(null);
        sourceBytesRef.current = null;
        setPdf(null);
        dispatch({ type: "document/close" });
        clearSession();
        await clearAllDocuments();
    }, []);

    /* ------------------------------------------------------------------ */
    /* Saved signatures                                                    */
    /* ------------------------------------------------------------------ */

    const rememberSignature = useCallback((dataUrl: string) => {
        setSavedSignatures((current) => {
            // Keep a short, de-duplicated list: this is a convenience, not a
            // signature library, and every entry is a sizeable data URL.
            const next = [dataUrl, ...current.filter((item) => item !== dataUrl)].slice(0, 4);
            writePrefs({ savedSignatures: next });
            return next;
        });
    }, []);

    const forgetSignature = useCallback((dataUrl: string) => {
        setSavedSignatures((current) => {
            const next = current.filter((item) => item !== dataUrl);
            writePrefs({ savedSignatures: next });
            return next;
        });
    }, []);

    const value = useMemo<EditorContextValue>(
        () => ({
            state,
            dispatch,
            pdf,
            sourceBytes: sourceBytesRef.current,
            status,
            error,
            openFile,
            closeDocument,
            savedSignatures,
            rememberSignature,
            forgetSignature,
        }),
        [state, pdf, status, error, openFile, closeDocument, savedSignatures, rememberSignature, forgetSignature],
    );

    return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}
