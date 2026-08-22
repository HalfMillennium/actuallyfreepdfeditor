"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createId } from "@/lib/geometry";
import type { ImageAnnotation } from "@/lib/types";
import { displaySize } from "@/lib/types";
import { cx } from "@/utils/cx";

import { useEditor } from "./editor-context";
import { Landing } from "./landing";
import { PageSidebar } from "./page-sidebar";
import { PageStack } from "./page-stack";
import { type SignatureResult, SignatureModal } from "./signature-modal";
import { TopBar } from "./top-bar";
import { Toolbar } from "./toolbar";

/** Longest edge a placed signature or image gets, in points. */
const PLACED_MAX_EDGE = 180;

export function EditorShell() {
    const { state, dispatch, savedSignatures, rememberSignature, forgetSignature } = useEditor();
    const [activePageId, setActivePageId] = useState<string | null>(null);
    const [isSignatureOpen, setIsSignatureOpen] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const fittedDocId = useRef<string | null>(null);

    const { doc, sourceSizes, zoom } = state;

    /**
     * Zoom level at which the widest page fits the viewport.
     *
     * Capped at 100%: on a wide monitor an A4 page would otherwise be blown up
     * to nearly twice its natural size, which is not what "fit" should mean.
     */
    const widthFittingZoom = useCallback(() => {
        const container = scrollRef.current;
        if (!container || !doc) return null;

        const widest = Math.max(...doc.pages.map((page) => displaySize(sourceSizes[page.sourceIndex], page.rotation).width));
        if (!Number.isFinite(widest) || widest <= 0) return null;

        // Leave room for the horizontal padding the page stack applies. A
        // zero-width container means layout has not settled yet; skip rather
        // than snapping to the minimum zoom.
        const available = container.clientWidth - 48;
        if (available <= 0) return null;

        return Math.min(1, available / widest);
    }, [doc, sourceSizes]);

    const fitToWidth = useCallback(() => {
        const fitted = widthFittingZoom();
        if (fitted) dispatch({ type: "zoom/set", zoom: fitted });
    }, [dispatch, widthFittingZoom]);

    /**
     * Never open a document wider than the window.
     *
     * This takes the *smaller* of the fitting zoom and whatever zoom the user
     * last preferred, so a restored 75% is respected on a desktop but a phone
     * still gets a page it can actually see.
     */
    useEffect(() => {
        if (!doc || fittedDocId.current === doc.id) return;

        const fitted = widthFittingZoom();
        if (fitted === null) return;

        fittedDocId.current = doc.id;
        if (fitted < zoom) dispatch({ type: "zoom/set", zoom: fitted });
    }, [doc, dispatch, widthFittingZoom, zoom]);

    const scrollToPage = useCallback((pageId: string) => {
        const container = scrollRef.current;
        const element = container?.querySelector<HTMLElement>(`[data-page-id="${pageId}"]`);
        element?.scrollIntoView({ behavior: "smooth", block: "start" });
        setIsSidebarOpen(false);
    }, []);

    /** Where a newly-placed stamp should land: the middle of the visible page. */
    const placeOnPage = useCallback(
        (result: SignatureResult, kind: "signature" | "image") => {
            if (!doc) return;

            const page = doc.pages.find((p) => p.id === activePageId) ?? doc.pages[0];
            const size = displaySize(sourceSizes[page.sourceIndex], page.rotation);

            const ratio = result.naturalWidth / result.naturalHeight;
            let width = Math.min(PLACED_MAX_EDGE, size.width * 0.45);
            let height = width / ratio;

            // A very wide or very tall source can still overflow after the width
            // clamp, so clamp the other axis too.
            if (height > size.height * 0.4) {
                height = size.height * 0.4;
                width = height * ratio;
            }

            const annotation: ImageAnnotation = {
                id: createId("ann"),
                pageId: page.id,
                kind,
                x: (size.width - width) / 2,
                y: (size.height - height) / 2,
                width,
                height,
                dataUrl: result.dataUrl,
                naturalWidth: result.naturalWidth,
                naturalHeight: result.naturalHeight,
            };

            dispatch({ type: "annotation/add", annotation });
            dispatch({ type: "tool/set", tool: "select" });
            dispatch({ type: "selection/set", id: annotation.id });

            scrollToPage(page.id);
        },
        [activePageId, dispatch, doc, scrollToPage, sourceSizes],
    );

    if (!doc) return <Landing />;

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-secondary">
            <TopBar isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen((open) => !open)} onFitWidth={fitToWidth} />

            <Toolbar onPickSignature={() => setIsSignatureOpen(true)} onPickImage={() => imageInputRef.current?.click()} />

            <div className="flex min-h-0 flex-1">
                {/* Page rail: a permanent column on desktop, an overlay below lg. */}
                <aside
                    className={cx(
                        "z-30 w-56 shrink-0 border-r border-secondary bg-primary transition-transform duration-200",
                        "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:top-0 max-lg:pt-2 max-lg:shadow-xl",
                        isSidebarOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
                    )}
                >
                    <PageSidebar activePageId={activePageId} onJumpToPage={scrollToPage} />
                </aside>

                {isSidebarOpen && (
                    <button
                        type="button"
                        aria-label="Close page list"
                        onClick={() => setIsSidebarOpen(false)}
                        className="fixed inset-0 z-20 bg-overlay/40 lg:hidden"
                    />
                )}

                <div ref={scrollRef} className="min-w-0 flex-1 overflow-auto">
                    <PageStack onRequestPageFocus={setActivePageId} />
                </div>
            </div>

            <SignatureModal
                isOpen={isSignatureOpen}
                onClose={() => setIsSignatureOpen(false)}
                savedSignatures={savedSignatures}
                onForget={forgetSignature}
                onApply={(result) => {
                    rememberSignature(result.dataUrl);
                    placeOnPage(result, "signature");
                }}
            />

            <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;

                    const result = await readImage(file);
                    if (result) placeOnPage(result, "image");
                }}
            />
        </div>
    );
}

/**
 * Decodes an image file to a data URL and its intrinsic size.
 *
 * Large photos are downscaled first: a 12-megapixel camera image embedded at
 * full resolution would dwarf the PDF it is being dropped into.
 */
function readImage(file: File): Promise<SignatureResult | null> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onerror = () => resolve(null);
        reader.onload = () => {
            const image = new Image();
            image.onerror = () => resolve(null);
            image.onload = () => {
                const maxEdge = 2000;
                const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));

                if (scale === 1 && file.type === "image/png") {
                    resolve({ dataUrl: reader.result as string, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight });
                    return;
                }

                const canvas = document.createElement("canvas");
                canvas.width = Math.round(image.naturalWidth * scale);
                canvas.height = Math.round(image.naturalHeight * scale);
                canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);

                resolve({ dataUrl: canvas.toDataURL("image/png"), naturalWidth: canvas.width, naturalHeight: canvas.height });
            };
            image.src = reader.result as string;
        };
        reader.readAsDataURL(file);
    });
}
