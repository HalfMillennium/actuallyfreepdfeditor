import { addRotation, clampBoxToPage, createId, rotateAnnotationWithPage } from "./geometry";
import type { Annotation, EditorDocument, EditorPage, SourcePageSize, ToolId } from "./types";
import { displaySize } from "./types";

/** The slice of state that undo/redo rewinds. Everything else is view state. */
interface Snapshot {
    pages: EditorPage[];
    annotations: Annotation[];
}

export interface EditorState {
    doc: EditorDocument | null;
    sourceSizes: SourcePageSize[];
    tool: ToolId;
    selectedId: string | null;
    zoom: number;
    past: Snapshot[];
    future: Snapshot[];
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
const HISTORY_LIMIT = 60;

export const initialEditorState: EditorState = {
    doc: null,
    sourceSizes: [],
    tool: "select",
    selectedId: null,
    zoom: 1,
    past: [],
    future: [],
};

export type EditorAction =
    | { type: "document/open"; doc: EditorDocument; sourceSizes: SourcePageSize[]; zoom?: number }
    | { type: "document/close" }
    | { type: "tool/set"; tool: ToolId }
    | { type: "zoom/set"; zoom: number }
    | { type: "selection/set"; id: string | null }
    | { type: "annotation/add"; annotation: Annotation; select?: boolean }
    /**
     * `transient` updates skip the history push. A drag issues one checkpoint on
     * pointer-down and then streams transient updates, so the whole gesture
     * collapses into a single undo step.
     */
    | { type: "annotation/update"; id: string; patch: Partial<Annotation>; transient?: boolean }
    | { type: "annotation/delete"; id: string }
    | { type: "history/checkpoint" }
    | { type: "page/rotate"; pageId: string; delta: 90 | -90 }
    | { type: "page/delete"; pageId: string }
    | { type: "page/duplicate"; pageId: string }
    | { type: "page/move"; pageId: string; toIndex: number }
    | { type: "history/undo" }
    | { type: "history/redo" };

function snapshot(doc: EditorDocument): Snapshot {
    return { pages: doc.pages, annotations: doc.annotations };
}

/** Applies a change to the document and records the previous state for undo. */
function commit(state: EditorState, next: Snapshot, options: { transient?: boolean } = {}): EditorState {
    if (!state.doc) return state;

    const past = options.transient ? state.past : [...state.past, snapshot(state.doc)].slice(-HISTORY_LIMIT);

    return {
        ...state,
        doc: { ...state.doc, ...next },
        past,
        future: options.transient ? state.future : [],
    };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
    switch (action.type) {
        case "document/open":
            return {
                ...initialEditorState,
                doc: action.doc,
                sourceSizes: action.sourceSizes,
                zoom: action.zoom ?? state.zoom,
            };

        case "document/close":
            return { ...initialEditorState, zoom: state.zoom };

        case "tool/set":
            // Leaving a drawing tool for another one should not keep a stale
            // selection highlighted on the page.
            return { ...state, tool: action.tool, selectedId: action.tool === "select" ? state.selectedId : null };

        case "zoom/set":
            return { ...state, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, action.zoom)) };

        case "selection/set":
            return { ...state, selectedId: action.id };

        case "history/checkpoint": {
            if (!state.doc) return state;
            return { ...state, past: [...state.past, snapshot(state.doc)].slice(-HISTORY_LIMIT), future: [] };
        }

        case "annotation/add": {
            if (!state.doc) return state;
            const next = commit(state, { pages: state.doc.pages, annotations: [...state.doc.annotations, action.annotation] });
            return action.select === false ? next : { ...next, selectedId: action.annotation.id };
        }

        case "annotation/update": {
            if (!state.doc) return state;
            const annotations = state.doc.annotations.map((a) => (a.id === action.id ? ({ ...a, ...action.patch } as Annotation) : a));
            return commit(state, { pages: state.doc.pages, annotations }, { transient: action.transient });
        }

        case "annotation/delete": {
            if (!state.doc) return state;
            const annotations = state.doc.annotations.filter((a) => a.id !== action.id);
            return {
                ...commit(state, { pages: state.doc.pages, annotations }),
                selectedId: state.selectedId === action.id ? null : state.selectedId,
            };
        }

        case "page/rotate": {
            if (!state.doc) return state;
            const page = state.doc.pages.find((p) => p.id === action.pageId);
            if (!page) return state;

            const source = state.sourceSizes[page.sourceIndex];
            const before = displaySize(source, page.rotation);
            const quarterTurns = action.delta === 90 ? 1 : 3;

            return commit(state, {
                pages: state.doc.pages.map((p) => (p.id === action.pageId ? { ...p, rotation: addRotation(p.rotation, action.delta) } : p)),
                annotations: state.doc.annotations.map((a) => {
                    if (a.pageId !== action.pageId) return a;
                    const turned = rotateAnnotationWithPage(a, quarterTurns, before.width, before.height);
                    // The page's width and height have swapped, so re-clamp
                    // against the new bounds.
                    return { ...turned, ...clampBoxToPage(turned, before.height, before.width) };
                }),
            });
        }

        case "page/delete": {
            if (!state.doc || state.doc.pages.length <= 1) return state;
            return {
                ...commit(state, {
                    pages: state.doc.pages.filter((p) => p.id !== action.pageId),
                    annotations: state.doc.annotations.filter((a) => a.pageId !== action.pageId),
                }),
                selectedId: null,
            };
        }

        case "page/duplicate": {
            if (!state.doc) return state;
            const index = state.doc.pages.findIndex((p) => p.id === action.pageId);
            if (index === -1) return state;

            const original = state.doc.pages[index];
            const copy: EditorPage = { ...original, id: createId("page") };
            const pages = [...state.doc.pages];
            pages.splice(index + 1, 0, copy);

            // Annotations are stamped onto the copy too, otherwise "duplicate"
            // would silently drop the work done on the page being duplicated.
            const clonedAnnotations = state.doc.annotations
                .filter((a) => a.pageId === action.pageId)
                .map((a) => ({ ...a, id: createId("ann"), pageId: copy.id }) as Annotation);

            return commit(state, { pages, annotations: [...state.doc.annotations, ...clonedAnnotations] });
        }

        case "page/move": {
            if (!state.doc) return state;
            const from = state.doc.pages.findIndex((p) => p.id === action.pageId);
            const to = Math.max(0, Math.min(state.doc.pages.length - 1, action.toIndex));
            if (from === -1 || from === to) return state;

            const pages = [...state.doc.pages];
            const [moved] = pages.splice(from, 1);
            pages.splice(to, 0, moved);

            return commit(state, { pages, annotations: state.doc.annotations });
        }

        case "history/undo": {
            if (!state.doc || state.past.length === 0) return state;
            const previous = state.past[state.past.length - 1];
            return {
                ...state,
                doc: { ...state.doc, ...previous },
                past: state.past.slice(0, -1),
                future: [snapshot(state.doc), ...state.future].slice(0, HISTORY_LIMIT),
                selectedId: null,
            };
        }

        case "history/redo": {
            if (!state.doc || state.future.length === 0) return state;
            const [next, ...rest] = state.future;
            return {
                ...state,
                doc: { ...state.doc, ...next },
                past: [...state.past, snapshot(state.doc)].slice(-HISTORY_LIMIT),
                future: rest,
                selectedId: null,
            };
        }

        default:
            return state;
    }
}
