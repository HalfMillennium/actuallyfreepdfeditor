"use client";

import type { FC } from "react";

import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    Bold01,
    Brush01,
    Cursor04,
    Eraser,
    Image01,
    Italic01,
    PenTool02,
    Type01,
} from "@untitledui/icons";

import { Select } from "@/components/base/select/select";
import { FONT_OPTIONS } from "@/lib/fonts";
import type { Annotation, FontId, ToolId } from "@/lib/types";
import { cx } from "@/utils/cx";

import { useEditor } from "./editor-context";
import { HIGHLIGHT_COLORS, INK_COLORS, useToolSettings } from "./tool-settings";

interface ToolDefinition {
    id: ToolId;
    label: string;
    hint: string;
    icon: FC<{ className?: string }>;
}

const TOOLS: ToolDefinition[] = [
    { id: "select", label: "Select", hint: "Move and resize what you've added", icon: Cursor04 },
    { id: "text", label: "Text", hint: "Click the page to start typing", icon: Type01 },
    { id: "signature", label: "Sign", hint: "Draw, type or upload a signature", icon: PenTool02 },
    { id: "image", label: "Image", hint: "Place a picture on the page", icon: Image01 },
    { id: "highlight", label: "Highlight", hint: "Drag over text to highlight it", icon: Brush01 },
    { id: "whiteout", label: "White-out", hint: "Drag to cover something up", icon: Eraser },
    { id: "draw", label: "Draw", hint: "Freehand pen", icon: PenTool02 },
];

interface Props {
    onPickSignature: () => void;
    onPickImage: () => void;
}

export function Toolbar({ onPickSignature, onPickImage }: Props) {
    const { state, dispatch } = useEditor();

    const selected = state.doc?.annotations.find((a) => a.id === state.selectedId) ?? null;

    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3 border-b border-secondary bg-primary px-4 py-2.5">
            <div className="flex items-center gap-0.5 rounded-lg bg-secondary p-1">
                {TOOLS.map((tool) => {
                    const isActive = state.tool === tool.id;
                    return (
                        <button
                            key={tool.id}
                            type="button"
                            title={`${tool.label} — ${tool.hint}`}
                            aria-pressed={isActive}
                            onClick={() => {
                                // These two need a source before anything can be
                                // placed, so they open a picker instead of arming
                                // a click-on-page interaction.
                                if (tool.id === "signature") return onPickSignature();
                                if (tool.id === "image") return onPickImage();
                                dispatch({ type: "tool/set", tool: tool.id });
                            }}
                            className={cx(
                                "flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-semibold transition",
                                isActive ? "bg-primary text-brand-secondary shadow-xs ring-1 ring-secondary" : "text-tertiary hover:text-secondary",
                            )}
                        >
                            <tool.icon className="size-4 shrink-0" />
                            <span className="hidden lg:inline">{tool.label}</span>
                        </button>
                    );
                })}
            </div>

            <div className="h-6 w-px bg-border-secondary max-md:hidden" />

            <ContextualControls selected={selected} />
        </div>
    );
}

/**
 * The right-hand half of the toolbar.
 *
 * When something is selected it edits *that* annotation; otherwise it edits the
 * defaults the active tool will use next. Same controls either way, so there is
 * only one place to learn.
 */
function ContextualControls({ selected }: { selected: Annotation | null }) {
    const { state, dispatch } = useEditor();
    const settings = useToolSettings();

    const patch = (values: Partial<Annotation>) => {
        if (selected) dispatch({ type: "annotation/update", id: selected.id, patch: values });
    };

    const kind = selected?.kind ?? (state.tool === "select" ? null : state.tool);

    if (kind === "text") {
        const text = selected?.kind === "text" ? selected : null;
        const value = text ?? settings.text;

        return (
            <div className="flex flex-wrap items-center gap-2">
                <Select
                    aria-label="Font"
                    size="sm"
                    selectedKey={text ? text.fontId : settings.text.fontId}
                    items={FONT_OPTIONS.map((font) => ({ id: font.id, label: font.label }))}
                    onSelectionChange={(key) => {
                        const fontId = key as FontId;
                        text ? patch({ fontId }) : settings.setText({ fontId });
                    }}
                    className="w-32"
                >
                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>

                <NumberStepper
                    label="Font size"
                    value={value.fontSize}
                    min={4}
                    max={144}
                    onChange={(fontSize) => {
                        if (text) {
                            // Keep the box tall enough for the type inside it.
                            const lines = text.text.split("\n").length;
                            patch({ fontSize, height: lines * fontSize * 1.25 });
                        } else {
                            settings.setText({ fontSize });
                        }
                    }}
                />

                <ToggleChip
                    label="Bold"
                    icon={Bold01}
                    isActive={value.bold}
                    onToggle={() => (text ? patch({ bold: !text.bold }) : settings.setText({ bold: !settings.text.bold }))}
                />
                <ToggleChip
                    label="Italic"
                    icon={Italic01}
                    isActive={value.italic}
                    onToggle={() => (text ? patch({ italic: !text.italic }) : settings.setText({ italic: !settings.text.italic }))}
                />

                <div className="flex items-center gap-0.5 rounded-lg bg-secondary p-0.5">
                    {(
                        [
                            { id: "left", icon: AlignLeft },
                            { id: "center", icon: AlignCenter },
                            { id: "right", icon: AlignRight },
                        ] as const
                    ).map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            title={`Align ${option.id}`}
                            aria-pressed={value.align === option.id}
                            onClick={() => (text ? patch({ align: option.id }) : settings.setText({ align: option.id }))}
                            className={cx(
                                "cursor-pointer rounded-md p-1.5 transition",
                                value.align === option.id ? "bg-primary text-brand-secondary shadow-xs" : "text-fg-quaternary hover:text-fg-secondary",
                            )}
                        >
                            <option.icon className="size-4" />
                        </button>
                    ))}
                </div>

                <Swatches
                    colors={INK_COLORS}
                    value={value.color}
                    onChange={(color) => (text ? patch({ color }) : settings.setText({ color }))}
                />
            </div>
        );
    }

    if (kind === "highlight") {
        const shape = selected?.kind === "highlight" ? selected : null;
        const value = shape ?? settings.highlight;
        return (
            <div className="flex flex-wrap items-center gap-3">
                <Swatches
                    colors={HIGHLIGHT_COLORS}
                    value={value.color}
                    onChange={(color) => (shape ? patch({ color }) : settings.setHighlight({ color }))}
                />
                <OpacityControl
                    value={value.opacity}
                    onChange={(opacity) => (shape ? patch({ opacity }) : settings.setHighlight({ opacity }))}
                />
            </div>
        );
    }

    if (kind === "whiteout") {
        const shape = selected?.kind === "whiteout" ? selected : null;
        const value = shape ?? settings.whiteout;
        return (
            <div className="flex flex-wrap items-center gap-3">
                <Swatches
                    colors={["#ffffff", "#f5f5f4", "#1a1a1a"]}
                    value={value.color}
                    onChange={(color) => (shape ? patch({ color }) : settings.setWhiteout({ color }))}
                />
                <span className="text-xs text-tertiary">Covers whatever is underneath, permanently, in the exported file.</span>
            </div>
        );
    }

    if (kind === "draw") {
        const draw = selected?.kind === "draw" ? selected : null;
        return (
            <div className="flex flex-wrap items-center gap-3">
                <Swatches
                    colors={INK_COLORS}
                    value={draw?.color ?? settings.pen.color}
                    onChange={(color) => (draw ? patch({ color }) : settings.setPen({ color }))}
                />
                <NumberStepper
                    label="Stroke"
                    value={draw?.strokeWidth ?? settings.pen.strokeWidth}
                    min={1}
                    max={24}
                    onChange={(strokeWidth) => (draw ? patch({ strokeWidth }) : settings.setPen({ strokeWidth }))}
                />
            </div>
        );
    }

    if (selected && (selected.kind === "signature" || selected.kind === "image")) {
        return (
            <p className="text-xs text-tertiary">
                Drag to move, or pull a corner to resize — the aspect ratio is kept. Press <Kbd>Delete</Kbd> to remove it.
            </p>
        );
    }

    return (
        <p className="text-xs text-tertiary">
            {TOOLS.find((tool) => tool.id === state.tool)?.hint ?? "Pick a tool to start editing"}
        </p>
    );
}

function Swatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (color: string) => void }) {
    return (
        <div className="flex items-center gap-1">
            {colors.map((color) => (
                <button
                    key={color}
                    type="button"
                    aria-label={`Colour ${color}`}
                    aria-pressed={value.toLowerCase() === color.toLowerCase()}
                    onClick={() => onChange(color)}
                    className={cx(
                        "size-5 cursor-pointer rounded-full ring-1 ring-secondary transition ring-inset hover:scale-110",
                        value.toLowerCase() === color.toLowerCase() && "ring-2 ring-brand ring-offset-2 ring-offset-primary",
                    )}
                    style={{ backgroundColor: color }}
                />
            ))}
        </div>
    );
}

function NumberStepper({
    label,
    value,
    min,
    max,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
}) {
    const clamp = (next: number) => Math.min(max, Math.max(min, next));
    return (
        <div className="flex items-center rounded-lg bg-primary ring-1 ring-primary ring-inset">
            <button
                type="button"
                aria-label={`Decrease ${label.toLowerCase()}`}
                onClick={() => onChange(clamp(value - 1))}
                className="cursor-pointer px-2 py-1 text-sm text-fg-quaternary transition hover:text-fg-secondary"
            >
                −
            </button>
            <input
                type="number"
                aria-label={label}
                value={Math.round(value * 10) / 10}
                min={min}
                max={max}
                onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next)) onChange(clamp(next));
                }}
                className="w-11 border-0 bg-transparent py-1 text-center text-sm font-medium text-primary outline-none"
            />
            <button
                type="button"
                aria-label={`Increase ${label.toLowerCase()}`}
                onClick={() => onChange(clamp(value + 1))}
                className="cursor-pointer px-2 py-1 text-sm text-fg-quaternary transition hover:text-fg-secondary"
            >
                +
            </button>
        </div>
    );
}

function OpacityControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
    return (
        <label className="flex items-center gap-2 text-xs font-medium text-tertiary">
            Opacity
            <input
                type="range"
                min={10}
                max={100}
                value={Math.round(value * 100)}
                onChange={(event) => onChange(Number(event.target.value) / 100)}
                className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-quaternary accent-[var(--color-brand-600)]"
            />
            <span className="w-8 tabular-nums">{Math.round(value * 100)}%</span>
        </label>
    );
}

function ToggleChip({
    label,
    icon: Icon,
    isActive,
    onToggle,
}: {
    label: string;
    icon: FC<{ className?: string }>;
    isActive: boolean;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            title={label}
            aria-pressed={isActive}
            onClick={onToggle}
            className={cx(
                "cursor-pointer rounded-lg p-1.5 transition ring-inset",
                isActive ? "bg-brand-primary text-fg-brand-primary ring-1 ring-brand" : "text-fg-quaternary hover:bg-secondary hover:text-fg-secondary",
            )}
        >
            <Icon className="size-4" />
        </button>
    );
}

function Kbd({ children }: { children: React.ReactNode }) {
    return <kbd className="rounded border border-secondary bg-secondary px-1 font-mono text-[10px] text-secondary">{children}</kbd>;
}
