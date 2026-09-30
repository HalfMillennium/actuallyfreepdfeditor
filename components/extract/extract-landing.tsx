"use client";

import { type DragEvent, useRef, useState } from "react";

import Link from "next/link";

import { AlertCircle, Columns03, CoinsStacked01, Eye, FileSearch02, Scan, ShieldTick, UploadCloud01, WifiOff } from "@untitledui/icons";

import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

import { Wordmark } from "@/components/editor/wordmark";
import { Faq } from "@/components/seo/faq";
import { REDACT_DEFINITION, REDACT_FAQ } from "@/lib/redaction-copy";

import { useExtract } from "./extract-context";

const HOW_IT_WORKS = [
    { title: "Open your PDF", body: "Drop it in. It's read by this tab, not sent anywhere." },
    {
        title: "Pick what goes",
        body: "Search for fixed-format data like emails, card numbers and IBANs, or draw a box over anything else. Tick each thing that should go. Nothing is removed until you do.",
    },
    {
        title: "Download",
        body: "The pages you redacted are rebuilt so the text is gone. Then we re-read the file and tell you if anything you ticked survived.",
    },
];

/** The rest of what the same engine does. Kept, but secondary on this page. */
const ALSO = [
    { icon: FileSearch02, title: "Copy the text out", body: "Export a PDF's own text as plain text or Markdown, in reading order." },
    { icon: Scan, title: "Read scanned pages", body: "Pages with no text layer are flagged, and OCR runs in your browser on just those." },
    { icon: Columns03, title: "Turn a table into CSV", body: "Drag a box round a table and export it as CSV, JSON or Markdown." },
];

const PROMISES = [
    { icon: WifiOff, title: "Nothing is uploaded", body: "Every step runs in this tab. There is no upload, no queue, no processing server." },
    { icon: CoinsStacked01, title: "No limits, no account", body: "Nothing runs on our machines, so there's no daily cap, no sign-up and no watermark." },
    { icon: Eye, title: "You tick every item", body: "Matches are highlighted and left alone until you tick them. You decide what goes." },
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
                            href="/check-redaction"
                            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-tertiary transition hover:bg-secondary hover:text-secondary max-sm:hidden"
                        >
                            Check a redaction
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
                    Redact a PDF <span className="text-gradient-warm">(properly)</span>
                </h1>
                <p className="mt-4 max-w-xl text-center text-lg text-balance text-tertiary">
                    Most free tools draw a black box and call it done. The text is still under there, and anyone can copy it out. This one deletes it,
                    then checks.
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
                                <p className="text-lg font-semibold text-primary">Drop your PDF here</p>
                                <p className="mt-1 text-sm text-tertiary">Your file stays in this tab. Nothing is uploaded.</p>
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

                <blockquote className="mt-14 w-full max-w-2xl rounded-xl border-l-4 border-brand bg-secondary px-5 py-4 text-md text-secondary">
                    {REDACT_DEFINITION}
                </blockquote>

                <section className="mt-14 w-full" aria-labelledby="how-heading">
                    <h2 id="how-heading" className="text-lg font-semibold text-primary">
                        How it works
                    </h2>
                    <ol className="mt-4 grid gap-4 sm:grid-cols-3">
                        {HOW_IT_WORKS.map((step, index) => (
                            <li key={step.title} className="rounded-xl border border-secondary bg-primary p-5">
                                <span className="flex size-8 items-center justify-center rounded-full bg-brand-primary text-sm font-semibold text-brand-secondary">
                                    {index + 1}
                                </span>
                                <h3 className="mt-3 text-md font-semibold text-primary">{step.title}</h3>
                                <p className="mt-1 text-sm text-tertiary">{step.body}</p>
                            </li>
                        ))}
                    </ol>
                </section>

                <Link
                    href="/check-redaction"
                    className="mt-8 flex w-full items-center gap-4 rounded-xl border border-secondary bg-primary p-5 transition hover:border-brand hover:bg-brand-primary"
                >
                    <ShieldTick className="size-6 shrink-0 text-fg-brand-primary" />
                    <span>
                        <span className="block text-md font-semibold text-primary">Already redacted it somewhere else?</span>
                        <span className="mt-0.5 block text-sm text-tertiary">
                            Run it through the checker. It looks for text still hiding under the boxes, old revisions and metadata.
                        </span>
                    </span>
                </Link>

                <section className="mt-14 w-full" aria-labelledby="also-heading">
                    <h2 id="also-heading" className="text-lg font-semibold text-primary">
                        Also in here
                    </h2>
                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                        {ALSO.map(({ icon: Icon, title, body }) => (
                            <div key={title} className="rounded-xl border border-secondary bg-primary p-5">
                                <Icon className="size-5 text-fg-brand-primary" />
                                <h3 className="mt-3 text-sm font-semibold text-primary">{title}</h3>
                                <p className="mt-1 text-sm text-tertiary">{body}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <div className="mt-10 grid w-full gap-6 border-t border-secondary pt-10 sm:grid-cols-3">
                    {PROMISES.map(({ icon: Icon, title, body }) => (
                        <div key={title}>
                            <Icon className="size-5 text-fg-brand-primary" />
                            <h2 className="mt-3 text-sm font-semibold text-primary">{title}</h2>
                            <p className="mt-1 text-sm text-tertiary">{body}</p>
                        </div>
                    ))}
                </div>

                <div className="mt-14 w-full">
                    <Faq entries={REDACT_FAQ} />
                </div>
            </div>
        </main>
    );
}
