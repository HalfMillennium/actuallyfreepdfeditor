"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Trash01, UploadCloud01 } from "@untitledui/icons";
import SignaturePad from "signature_pad";

import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { CloseButton } from "@/components/base/buttons/close-button";
import { Input } from "@/components/base/input/input";
import { Tabs } from "@/components/application/tabs/tabs";
import { cx } from "@/utils/cx";

import { INK_COLORS } from "./tool-settings";

export interface SignatureResult {
    dataUrl: string;
    naturalWidth: number;
    naturalHeight: number;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onApply: (result: SignatureResult) => void;
    savedSignatures: string[];
    onForget: (dataUrl: string) => void;
}

/** Cursive stacks that are present on most systems, with graceful fallbacks. */
const SCRIPT_FONTS = [
    { id: "brush", label: "Brush", stack: '"Brush Script MT", "Segoe Script", "Bradley Hand", cursive' },
    { id: "casual", label: "Casual", stack: '"Segoe Print", "Comic Sans MS", "Chalkboard", cursive' },
    { id: "formal", label: "Formal", stack: '"Snell Roundhand", "Apple Chancery", "Lucida Handwriting", cursive' },
];

export function SignatureModal({ isOpen, onClose, onApply, savedSignatures, onForget }: Props) {
    return (
        <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable>
            <Modal className="max-w-2xl">
                <Dialog>
                    <div className="flex items-start justify-between gap-4 px-6 pt-6">
                        <div>
                            <h2 className="text-lg font-semibold text-primary">Add your signature</h2>
                            <p className="mt-1 text-sm text-tertiary">
                                Draw it, type it, or upload a photo. It stays in this browser — nothing is uploaded.
                            </p>
                        </div>
                        <CloseButton onClick={onClose} label="Close" />
                    </div>

                    {isOpen && (
                        <SignatureBody onApply={onApply} savedSignatures={savedSignatures} onForget={onForget} onClose={onClose} />
                    )}
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}

function SignatureBody({
    onApply,
    onClose,
    savedSignatures,
    onForget,
}: Omit<Props, "isOpen">) {
    return (
        <Tabs className="mt-5">
            <div className="px-6">
                <Tabs.List type="button-border" items={[
                    { id: "draw", label: "Draw" },
                    { id: "type", label: "Type" },
                    { id: "upload", label: "Upload" },
                    ...(savedSignatures.length > 0 ? [{ id: "saved", label: "Saved" }] : []),
                ]}>
                    {(tab) => <Tabs.Item {...tab} />}
                </Tabs.List>
            </div>

            <Tabs.Panel id="draw" className="px-6 pt-5 pb-6">
                <DrawPanel onApply={onApply} onClose={onClose} />
            </Tabs.Panel>
            <Tabs.Panel id="type" className="px-6 pt-5 pb-6">
                <TypePanel onApply={onApply} onClose={onClose} />
            </Tabs.Panel>
            <Tabs.Panel id="upload" className="px-6 pt-5 pb-6">
                <UploadPanel onApply={onApply} onClose={onClose} />
            </Tabs.Panel>
            {savedSignatures.length > 0 && (
                <Tabs.Panel id="saved" className="px-6 pt-5 pb-6">
                    <SavedPanel signatures={savedSignatures} onApply={onApply} onClose={onClose} onForget={onForget} />
                </Tabs.Panel>
            )}
        </Tabs>
    );
}

/* -------------------------------------------------------------------------- */
/* Draw                                                                       */
/* -------------------------------------------------------------------------- */

function DrawPanel({ onApply, onClose }: { onApply: (r: SignatureResult) => void; onClose: () => void }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const padRef = useRef<SignaturePad | null>(null);
    const [color, setColor] = useState("#1a1a1a");
    const [isEmpty, setIsEmpty] = useState(true);

    // signature_pad draws in device pixels, so the backing store has to be
    // resized (and the context scaled) whenever the element's box changes.
    const resize = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const { width, height } = canvas.getBoundingClientRect();
        if (width === 0) return;

        const data = padRef.current?.toData();
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        canvas.getContext("2d")?.scale(ratio, ratio);
        if (data?.length) padRef.current?.fromData(data);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const pad = new SignaturePad(canvas, { backgroundColor: "rgba(0,0,0,0)", penColor: color, minWidth: 0.7, maxWidth: 2.6 });
        padRef.current = pad;
        pad.addEventListener("endStroke", () => setIsEmpty(pad.isEmpty()));

        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);

        return () => {
            observer.disconnect();
            pad.off();
            padRef.current = null;
        };
    }, [resize, color]);

    useEffect(() => {
        if (padRef.current) padRef.current.penColor = color;
    }, [color]);

    const apply = () => {
        const canvas = canvasRef.current;
        const pad = padRef.current;
        if (!canvas || !pad || pad.isEmpty()) return;

        const trimmed = trimTransparent(canvas);
        if (!trimmed) return;
        onApply(trimmed);
        onClose();
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="relative rounded-xl bg-secondary ring-1 ring-secondary ring-inset">
                <canvas ref={canvasRef} className="h-48 w-full touch-none rounded-xl" />
                <div className="pointer-events-none absolute inset-x-8 bottom-10 border-b border-dashed border-tertiary" />
                <span className="pointer-events-none absolute bottom-4 left-8 text-xs text-quaternary">Sign above the line</span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <ColorSwatches colors={INK_COLORS.slice(0, 5)} value={color} onChange={setColor} />
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        color="tertiary"
                        iconLeading={Trash01}
                        onClick={() => {
                            padRef.current?.clear();
                            setIsEmpty(true);
                        }}
                    >
                        Clear
                    </Button>
                    <Button size="sm" color="primary" isDisabled={isEmpty} onClick={apply}>
                        Use signature
                    </Button>
                </div>
            </div>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Type                                                                       */
/* -------------------------------------------------------------------------- */

function TypePanel({ onApply, onClose }: { onApply: (r: SignatureResult) => void; onClose: () => void }) {
    const [name, setName] = useState("");
    const [fontIndex, setFontIndex] = useState(0);
    const [color, setColor] = useState("#1a1a1a");

    const apply = () => {
        if (!name.trim()) return;
        const result = renderTextSignature(name.trim(), SCRIPT_FONTS[fontIndex].stack, color);
        if (!result) return;
        onApply(result);
        onClose();
    };

    return (
        <div className="flex flex-col gap-4">
            <Input label="Your name" placeholder="Jamie Rivera" value={name} onChange={setName} size="md" />

            <div className="grid gap-2 sm:grid-cols-3">
                {SCRIPT_FONTS.map((font, index) => (
                    <button
                        key={font.id}
                        type="button"
                        onClick={() => setFontIndex(index)}
                        className={cx(
                            "flex h-20 cursor-pointer items-center justify-center overflow-hidden rounded-xl px-3 ring-1 ring-inset transition",
                            index === fontIndex ? "bg-brand-primary ring-2 ring-brand" : "bg-primary ring-secondary hover:bg-secondary",
                        )}
                    >
                        <span className="truncate text-2xl" style={{ fontFamily: font.stack, color }}>
                            {name.trim() || font.label}
                        </span>
                    </button>
                ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <ColorSwatches colors={INK_COLORS.slice(0, 5)} value={color} onChange={setColor} />
                <Button size="sm" color="primary" isDisabled={!name.trim()} onClick={apply}>
                    Use signature
                </Button>
            </div>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Upload                                                                     */
/* -------------------------------------------------------------------------- */

function UploadPanel({ onApply, onClose }: { onApply: (r: SignatureResult) => void; onClose: () => void }) {
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        setError(null);

        if (!file.type.startsWith("image/")) {
            setError("Pick an image file — PNG, JPEG or WebP.");
            return;
        }

        try {
            const result = await imageFileToSignature(file);
            onApply(result);
            onClose();
        } catch {
            setError("That image couldn't be read. Try a different file.");
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                    event.preventDefault();
                    void handleFile(event.dataTransfer.files[0]);
                }}
                className="flex cursor-pointer flex-col items-center gap-3 rounded-xl bg-primary px-6 py-8 ring-1 ring-secondary ring-inset transition hover:bg-secondary"
            >
                <span className="flex size-10 items-center justify-center rounded-lg bg-brand-primary text-fg-brand-primary ring-1 ring-brand ring-inset">
                    <UploadCloud01 className="size-5" />
                </span>
                <span className="text-sm font-semibold text-brand-secondary">Click to upload or drag an image here</span>
                <span className="text-xs text-tertiary">
                    A photo of a signature on white paper works well — the white background is made transparent automatically.
                </span>
            </button>

            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => void handleFile(event.target.files?.[0])}
            />

            {error && <p className="text-sm text-error-primary">{error}</p>}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Saved                                                                      */
/* -------------------------------------------------------------------------- */

function SavedPanel({
    signatures,
    onApply,
    onClose,
    onForget,
}: {
    signatures: string[];
    onApply: (r: SignatureResult) => void;
    onClose: () => void;
    onForget: (dataUrl: string) => void;
}) {
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {signatures.map((dataUrl) => (
                <div key={dataUrl} className="group relative rounded-xl bg-secondary p-3 ring-1 ring-secondary ring-inset">
                    <button
                        type="button"
                        className="flex w-full cursor-pointer items-center justify-center"
                        onClick={() => {
                            const image = new Image();
                            image.onload = () => {
                                onApply({ dataUrl, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight });
                                onClose();
                            };
                            image.src = dataUrl;
                        }}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element -- in-memory data URL */}
                        <img src={dataUrl} alt="Saved signature" className="h-16 object-contain" />
                    </button>
                    <div className="absolute top-2 right-2 opacity-0 transition group-hover:opacity-100">
                        <ButtonUtility size="xs" color="tertiary" icon={Trash01} tooltip="Forget this signature" onClick={() => onForget(dataUrl)} />
                    </div>
                </div>
            ))}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                */
/* -------------------------------------------------------------------------- */

function ColorSwatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (color: string) => void }) {
    return (
        <div className="flex items-center gap-1.5">
            {colors.map((color) => (
                <button
                    key={color}
                    type="button"
                    aria-label={`Ink colour ${color}`}
                    aria-pressed={value === color}
                    onClick={() => onChange(color)}
                    className={cx(
                        "size-7 cursor-pointer rounded-full ring-1 ring-secondary transition ring-inset",
                        value === color && "ring-2 ring-brand ring-offset-2 ring-offset-primary",
                    )}
                    style={{ backgroundColor: color }}
                />
            ))}
        </div>
    );
}

/**
 * Crops a canvas down to its non-transparent content.
 *
 * A signature drawn in the middle of a wide pad would otherwise arrive on the
 * page as a large, mostly-empty box that is awkward to position.
 */
function trimTransparent(canvas: HTMLCanvasElement): SignatureResult | null {
    const context = canvas.getContext("2d");
    if (!context) return null;

    const { width, height } = canvas;
    const { data } = context.getImageData(0, 0, width, height);

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] > 8) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (maxX < 0) return null;

    const pad = 6;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);

    const out = document.createElement("canvas");
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext("2d")?.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);

    return { dataUrl: out.toDataURL("image/png"), naturalWidth: out.width, naturalHeight: out.height };
}

function renderTextSignature(name: string, fontStack: string, color: string): SignatureResult | null {
    const ratio = 3; // Render oversized so the result stays sharp when scaled up on the page.
    const fontSize = 64;
    const measure = document.createElement("canvas").getContext("2d");
    if (!measure) return null;

    measure.font = `${fontSize}px ${fontStack}`;
    const width = Math.ceil(measure.measureText(name).width) + 40;
    const height = Math.ceil(fontSize * 1.8);

    const canvas = document.createElement("canvas");
    canvas.width = width * ratio;
    canvas.height = height * ratio;

    const context = canvas.getContext("2d");
    if (!context) return null;

    context.scale(ratio, ratio);
    context.font = `${fontSize}px ${fontStack}`;
    context.fillStyle = color;
    context.textBaseline = "middle";
    context.fillText(name, 20, height / 2);

    return trimTransparent(canvas);
}

/**
 * Reads an uploaded image and knocks out a near-white background.
 *
 * Most people photograph a signature on paper, and pasting that onto a PDF as
 * an opaque white rectangle looks obviously wrong. Pixels that are bright and
 * unsaturated become progressively more transparent.
 */
function imageFileToSignature(file: File): Promise<SignatureResult> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("read failed"));
        reader.onload = () => {
            const image = new Image();
            image.onerror = () => reject(new Error("decode failed"));
            image.onload = () => {
                const maxEdge = 1600;
                const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(image.naturalWidth * scale);
                canvas.height = Math.round(image.naturalHeight * scale);

                const context = canvas.getContext("2d");
                if (!context) return reject(new Error("no context"));

                context.drawImage(image, 0, 0, canvas.width, canvas.height);

                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                const { data } = imageData;
                for (let i = 0; i < data.length; i += 4) {
                    const luminance = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
                    if (luminance > 0.75) {
                        // Fade out from fully opaque at 0.75 to clear at 0.95.
                        data[i + 3] = Math.round(data[i + 3] * Math.max(0, 1 - (luminance - 0.75) / 0.2));
                    }
                }
                context.putImageData(imageData, 0, 0);

                const trimmed = trimTransparent(canvas);
                if (trimmed) resolve(trimmed);
                else resolve({ dataUrl: canvas.toDataURL("image/png"), naturalWidth: canvas.width, naturalHeight: canvas.height });
            };
            image.src = reader.result as string;
        };
        reader.readAsDataURL(file);
    });
}
