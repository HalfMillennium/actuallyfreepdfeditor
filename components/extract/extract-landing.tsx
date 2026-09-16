"use client";

import { type DragEvent, useRef, useState } from "react";

import Link from "next/link";

import { AlertCircle, Columns03, CoinsStacked01, Eye, EyeOff, FileSearch02, Scan, UploadCloud01, WifiOff } from "@untitledui/icons";

import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

import { Wordmark } from "@/components/editor/wordmark";

import { useExtract } from "./extract-context";

const STEPS = [
    {
        icon: FileSearch02,
        title: "Finds the text that is already there",
        body: "Most PDFs carry a text layer. Where one exists it is read directly, which is exact and instant — no OCR guesswork over text a machine already wrote.",
    },
    {
        icon: Scan,
        title: "Reads the scanned pages too",
        body: "Pages with no text layer are flagged, and OCR runs in your browser on just those pages. Nothing is uploaded to a recognition service.",
    },
    {
        icon: Columns03,
        title: "Turns a table into CSV or JSON",
        body: "Drag a box around a table and column boundaries are worked out from the gaps in the text. Export it as CSV, JSON, Markdown or plain text.",
    },
    {
        icon: EyeOff,
        title: "Removes what should not be there",
        body: "Email addresses, card numbers, national IDs and more are found and listed for you to review. Redaction rebuilds the page so the text is gone, not covered.",
    },
];

const PROMISES = [
    { icon: WifiOff, title: "This file never leaves your device", body: "Every step runs in this tab. There is no upload, no queue, no processing server." },
    { icon: CoinsStacked01, title: "No per-page pricing", body: "Because nothing runs on our machines, extracting a thousand pages costs us nothing and costs you nothing." },
    { icon: Eye, title: "Nothing is auto-redacted", body: "Suspected personal data is highlighted and left alone until you tick it. You decide what goes." },
];

export function ExtractLanding() {
    const { addFiles, busy, error } = useExtract();
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const onDrop = (event: DragEvent) => {
        event.preventDefault();
        setIsDragging(false);
        const dropped = Array.from(event.dataTransfer.files);
        if (dropped.length > 0) void addFiles(dropped);
    };

    return (
        <main className="relative min-h-dvh overflow-hidden bg-primary">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 -top-64 h-160 opacity-[0.18] blur-3xl"
                style={{ backgroundImage: "var(--gradient-warm)" }}
            />

            <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 py-14 sm:px-6 sm:py-20">
                <nav className="mb-10 flex w-full items-center justify-between gap-4">
                    <Link href="/" aria-label="actuallyfreepdfeditor home">
                        <Wordmark className="h-8 sm:h-9" />
                    </Link>
                    <div className="flex items-center gap-1">
                        <Link href="/" className="rounded-lg px-3 py-1.5 text-sm font-semibold text-tertiary transition hover:bg-secondary hover:text-secondary">
                            Editor
                        </Link>
                        <Link
                            href="/blog"
                            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-tertiary transition hover:bg-secondary hover:text-secondary"
                        >
                            Guides
                        </Link>
                    </div>
                </nav>

                <h1 className="max-w-2xl text-center text-display-sm font-semibold tracking-tight text-balance text-primary sm:text-display-md">
                    Turn PDFs into data, <span className="text-gradient-warm">locally</span>
                </h1>
                <p className="mt-4 max-w-xl text-center text-lg text-balance text-tertiary">
                    Pull text and tables out of a PDF, run OCR on the scanned pages, find the personal data hiding in it and redact it for good. All of it
                    happens inside this browser tab.
                </p>

                {/* ---------------------------------------------------------- */}

                <div
                    onDragOver={(event) => {
                        event.preventDefault();
                        setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={onDrop}
                    className={cx(
                        "mt-10 flex w-full max-w-2xl flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition sm:py-16",
                        isDragging ? "border-brand bg-brand-primary" : "border-secondary bg-secondary",
                    )}
                >
                    {busy ? (
                        <>
                            <LoadingIndicator type="dot-circle" size="md" />
                            <p className="text-sm font-medium text-secondary">Reading your file…</p>
                        </>
                    ) : (
                        <>
                            <span className="flex size-12 items-center justify-center rounded-xl bg-primary ring-1 ring-secondary">
                                <UploadCloud01 className="size-6 text-fg-brand-primary" />
                            </span>
                            <div>
                                <p className="text-lg font-semibold text-primary">Drop your PDFs here</p>
                                <p className="mt-1 text-sm text-tertiary">Drop several at once to run the same job across all of them.</p>
                            </div>
                            <Button size="lg" color="primary" onClick={() => inputRef.current?.click()}>
                                Choose files
                            </Button>
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
                        </>
                    )}
                </div>

                {error && (
                    <p role="alert" className="mt-4 flex items-center gap-2 text-sm font-medium text-error-primary">
                        <AlertCircle className="size-4 shrink-0" />
                        {error}
                    </p>
                )}

                {/* ---------------------------------------------------------- */}

                <div className="mt-16 grid w-full gap-6 sm:grid-cols-2">
                    {STEPS.map(({ icon: Icon, title, body }) => (
                        <div key={title} className="rounded-xl border border-secondary bg-primary p-5">
                            <span className="flex size-9 items-center justify-center rounded-lg bg-brand-primary">
                                <Icon className="size-5 text-fg-brand-primary" />
                            </span>
                            <h2 className="mt-3 text-md font-semibold text-primary">{title}</h2>
                            <p className="mt-1 text-sm text-tertiary">{body}</p>
                        </div>
                    ))}
                </div>

                <div className="mt-10 grid w-full gap-6 border-t border-secondary pt-10 sm:grid-cols-3">
                    {PROMISES.map(({ icon: Icon, title, body }) => (
                        <div key={title}>
                            <Icon className="size-5 text-fg-brand-primary" />
                            <h2 className="mt-3 text-sm font-semibold text-primary">{title}</h2>
                            <p className="mt-1 text-sm text-tertiary">{body}</p>
                        </div>
                    ))}
                </div>
            </div>
        </main>
    );
}
