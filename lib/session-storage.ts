"use client";

import type { Annotation, EditorPage } from "./types";

/**
 * Session persistence.
 *
 * The promise this app makes is that your document never leaves your machine,
 * so "persistence" here means *this browser, for a short while* — just enough
 * that a refresh or an accidental tab close does not throw your work away.
 *
 * The small stuff (page order, rotations, annotations, tool preferences) lives
 * in localStorage. The document bytes are far too big for localStorage's ~5 MB
 * budget, so they go in IndexedDB. Both are stamped with a timestamp and are
 * dropped on read once they pass `SESSION_TTL_MS`.
 */

const SESSION_KEY = "afpe.session.v1";
const PREFS_KEY = "afpe.prefs.v1";
const DB_NAME = "afpe";
const STORE_NAME = "documents";
const DB_VERSION = 1;

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface PersistedSession {
    id: string;
    fileName: string;
    pages: EditorPage[];
    annotations: Annotation[];
    savedAt: number;
}

export interface PersistedPrefs {
    zoom?: number;
    showThumbnails?: boolean;
    /** Signatures the user drew earlier in the session, for quick re-use. */
    savedSignatures?: string[];
}

function isExpired(savedAt: number): boolean {
    return !Number.isFinite(savedAt) || Date.now() - savedAt > SESSION_TTL_MS;
}

/* -------------------------------------------------------------------------- */
/* localStorage                                                               */
/* -------------------------------------------------------------------------- */

export function readSession(): PersistedSession | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(SESSION_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as PersistedSession;
        if (!parsed?.id || !Array.isArray(parsed.pages) || isExpired(parsed.savedAt)) {
            clearSession();
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function writeSession(session: Omit<PersistedSession, "savedAt">): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, savedAt: Date.now() }));
    } catch {
        // A quota error here is not worth interrupting the user over: the
        // document is still perfectly editable in memory. Most likely cause is
        // a session with many large pasted signatures.
    }
}

export function clearSession(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(SESSION_KEY);
    } catch {
        /* ignore */
    }
}

export function readPrefs(): PersistedPrefs {
    if (typeof window === "undefined") return {};
    try {
        return JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}") as PersistedPrefs;
    } catch {
        return {};
    }
}

export function writePrefs(prefs: PersistedPrefs): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...prefs }));
    } catch {
        /* ignore */
    }
}

/* -------------------------------------------------------------------------- */
/* IndexedDB — the document bytes                                             */
/* -------------------------------------------------------------------------- */

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                request.result.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return openDb().then(
        (db) =>
            new Promise<T>((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, mode);
                const request = run(tx.objectStore(STORE_NAME));
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
                tx.oncomplete = () => db.close();
            }),
    );
}

interface StoredDocument {
    bytes: ArrayBuffer;
    fileName: string;
    savedAt: number;
}

export async function saveDocumentBytes(id: string, bytes: ArrayBuffer, fileName: string): Promise<void> {
    if (typeof window === "undefined" || !window.indexedDB) return;
    try {
        const record: StoredDocument = { bytes: bytes.slice(0), fileName, savedAt: Date.now() };
        await withStore("readwrite", (store) => store.put(record, id) as IDBRequest<IDBValidKey>);
    } catch {
        // Private-browsing modes can refuse IndexedDB outright. Losing restore
        // on refresh is an acceptable degradation; editing still works.
    }
}

export async function loadDocumentBytes(id: string): Promise<ArrayBuffer | null> {
    if (typeof window === "undefined" || !window.indexedDB) return null;
    try {
        const record = await withStore<StoredDocument | undefined>("readonly", (store) => store.get(id));
        if (!record || isExpired(record.savedAt)) {
            await deleteDocumentBytes(id);
            return null;
        }
        return record.bytes;
    } catch {
        return null;
    }
}

export async function deleteDocumentBytes(id: string): Promise<void> {
    if (typeof window === "undefined" || !window.indexedDB) return;
    try {
        await withStore("readwrite", (store) => store.delete(id) as IDBRequest<undefined>);
    } catch {
        /* ignore */
    }
}

/** Drops every stored document, whatever its age. Used by "Close document". */
export async function clearAllDocuments(): Promise<void> {
    if (typeof window === "undefined" || !window.indexedDB) return;
    try {
        await withStore("readwrite", (store) => store.clear() as IDBRequest<undefined>);
    } catch {
        /* ignore */
    }
}
