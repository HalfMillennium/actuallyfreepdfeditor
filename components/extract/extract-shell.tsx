"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";

import { Menu02, XClose, ZoomIn, ZoomOut } from "@untitledui/icons";

import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Wordmark } from "@/components/editor/wordmark";
import { cx } from "@/utils/cx";

import { ExportPanel } from "./export-panel";
import { ExtractLanding } from "./extract-landing";
import { useExtract } from "./extract-context";
import { FileRail } from "./file-rail";
import { PageView } from "./page-view";
import { PiiPanel } from "./pii-panel";
import { TextBanner } from "./text-banner";

const MIN_SCALE = 0.25;
const MAX_SCALE = 3;
const STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

export function ExtractShell() {
    const { files, active, clearAll } = useExtract();
    const [scale, setScale] = useState(1);
    const [railOpen, setRailOpen] = useState(false);
    const [panelOpen, setPanelOpen] = useState(false);
    const surfaceRef = useRef<HTMLDivElement>(null);

    // Fit the page to the window the first time a document appears, so a phone
    // does not open on the top-left corner of an A4 page at 100%.
    const fittedRef = useRef<string | null>(null);
    useEffect(() => {
        const page = active?.document.pages[0];
        const surface = surfaceRef.current;
        if (!page || !surface || fittedRef.current === active?.id) return;

        fittedRef.current = active?.id ?? null;
        const available = surface.clientWidth - 48;
        if (available > 0) setScale(Math.min(1, Math.max(MIN_SCALE, available / page.width)));
    }, [active?.id, active?.document.pages]);

    if (files.length === 0) return <ExtractLanding />;

    const step = (direction: 1 | -1) => {
        const next =
            direction === 1
                ? (STEPS.find((value) => value > scale + 0.001) ?? MAX_SCALE)
                : ([...STEPS].reverse().find((value) => value < scale - 0.001) ?? MIN_SCALE);
        setScale(next);
    };

    return (
        <div className="flex h-dvh flex-col bg-primary">
            <header className="flex items-center gap-2 border-b border-secondary px-3 py-2.5 sm:gap-3 sm:px-4">
                <ButtonUtility size="sm" color="tertiary" icon={Menu02} tooltip="Show files" onClick={() => setRailOpen((open) => !open)} className="lg:hidden" />

                <Link href="/" aria-label="actuallyfreepdfeditor home" className="hidden shrink-0 sm:block">
                    <Wordmark />
                </Link>

                <div className="min-w-0 flex-1 sm:px-2">
                    <p className="truncate text-sm font-semibold text-primary" title={active?.fileName}>
                        {active?.fileName ?? "Extract"}
                    </p>
                    <p className="truncate text-xs text-tertiary max-sm:hidden">
                        Drag a box round a table or a paragraph to pull out just that. Nothing here is uploaded.
                    </p>
                </div>

                <div className="flex items-center gap-0.5 rounded-lg bg-secondary p-0.5">
                    <ButtonUtility size="xs" color="tertiary" icon={ZoomOut} tooltip="Zoom out" isDisabled={scale <= MIN_SCALE} onClick={() => step(-1)} />
                    <span className="w-12 text-center text-xs font-semibold tabular-nums text-secondary max-sm:hidden">{Math.round(scale * 100)}%</span>
                    <ButtonUtility size="xs" color="tertiary" icon={ZoomIn} tooltip="Zoom in" isDisabled={scale >= MAX_SCALE} onClick={() => step(1)} />
                </div>

                <ButtonUtility
                    size="sm"
                    color="tertiary"
                    icon={Menu02}
                    tooltip="Show the extract and redact panel"
                    onClick={() => setPanelOpen((open) => !open)}
                    className="xl:hidden"
                />
                <ButtonUtility size="sm" color="tertiary" icon={XClose} tooltip="Close everything and clear this session" onClick={clearAll} />
            </header>

            <div className="flex min-h-0 flex-1">
                <div className={cx("max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-20 max-lg:shadow-xl", !railOpen && "max-lg:hidden")}>
                    <FileRail />
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                    <TextBanner />
                    <div ref={surfaceRef} className="min-h-0 flex-1 overflow-auto">
                        <PageView scale={scale} />
                    </div>
                </div>

                <aside
                    className={cx(
                        "w-80 shrink-0 overflow-y-auto border-l border-secondary bg-primary",
                        "max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-20 max-xl:shadow-xl",
                        !panelOpen && "max-xl:hidden",
                    )}
                >
                    <ExportPanel />
                    <PiiPanel />
                </aside>
            </div>
        </div>
    );
}
