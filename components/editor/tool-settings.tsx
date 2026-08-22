"use client";

import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

import type { FontId } from "@/lib/types";

/**
 * Style the *tools* carry, as opposed to style baked into an annotation.
 *
 * These are the "next thing you draw looks like this" settings. They are held
 * separately from the document so that changing the pen colour does not count
 * as a document edit (and therefore does not land in the undo stack).
 */

export interface TextStyle {
    fontId: FontId;
    fontSize: number;
    bold: boolean;
    italic: boolean;
    color: string;
    align: "left" | "center" | "right";
}

export interface ShapeStyle {
    color: string;
    opacity: number;
}

export interface PenStyle {
    color: string;
    strokeWidth: number;
}

interface ToolSettingsValue {
    text: TextStyle;
    highlight: ShapeStyle;
    whiteout: ShapeStyle;
    pen: PenStyle;
    setText: (patch: Partial<TextStyle>) => void;
    setHighlight: (patch: Partial<ShapeStyle>) => void;
    setWhiteout: (patch: Partial<ShapeStyle>) => void;
    setPen: (patch: Partial<PenStyle>) => void;
}

/** Swatches drawn from the project palette, plus the neutrals you actually need. */
export const INK_COLORS = ["#1a1a1a", "#582707", "#972d07", "#ff4b3e", "#ffb20f", "#1d4ed8", "#15803d", "#ffffff"];
export const HIGHLIGHT_COLORS = ["#ffe548", "#ffb20f", "#ff4b3e", "#7ee787", "#7dd3fc", "#e9a8ff"];

const DEFAULTS = {
    text: { fontId: "helvetica", fontSize: 14, bold: false, italic: false, color: "#1a1a1a", align: "left" } satisfies TextStyle,
    highlight: { color: "#ffe548", opacity: 0.4 } satisfies ShapeStyle,
    whiteout: { color: "#ffffff", opacity: 1 } satisfies ShapeStyle,
    pen: { color: "#972d07", strokeWidth: 2 } satisfies PenStyle,
};

const ToolSettingsContext = createContext<ToolSettingsValue | null>(null);

export function useToolSettings(): ToolSettingsValue {
    const context = useContext(ToolSettingsContext);
    if (!context) throw new Error("useToolSettings must be used inside <ToolSettingsProvider>.");
    return context;
}

export function ToolSettingsProvider({ children }: { children: ReactNode }) {
    const [text, setTextState] = useState<TextStyle>(DEFAULTS.text);
    const [highlight, setHighlightState] = useState<ShapeStyle>(DEFAULTS.highlight);
    const [whiteout, setWhiteoutState] = useState<ShapeStyle>(DEFAULTS.whiteout);
    const [pen, setPenState] = useState<PenStyle>(DEFAULTS.pen);

    const setText = useCallback((patch: Partial<TextStyle>) => setTextState((current) => ({ ...current, ...patch })), []);
    const setHighlight = useCallback((patch: Partial<ShapeStyle>) => setHighlightState((current) => ({ ...current, ...patch })), []);
    const setWhiteout = useCallback((patch: Partial<ShapeStyle>) => setWhiteoutState((current) => ({ ...current, ...patch })), []);
    const setPen = useCallback((patch: Partial<PenStyle>) => setPenState((current) => ({ ...current, ...patch })), []);

    const value = useMemo(
        () => ({ text, highlight, whiteout, pen, setText, setHighlight, setWhiteout, setPen }),
        [text, highlight, whiteout, pen, setText, setHighlight, setWhiteout, setPen],
    );

    return <ToolSettingsContext.Provider value={value}>{children}</ToolSettingsContext.Provider>;
}
