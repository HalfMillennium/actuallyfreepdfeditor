"use client";

import { type DragEvent, useRef, useState } from "react";

import Link from "next/link";

import { AlertCircle, Brush01, CoinsStacked01, Eye, FileX02, PenTool02, Type01, UploadCloud01, WifiOff } from "@untitledui/icons";

import { Button } from "@/components/base/buttons/button";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { cx } from "@/utils/cx";

import { useEditor } from "./editor-context";
import { Wordmark } from "./wordmark";

const CAPABILITIES = [
    { icon: Type01, title: "Add text", body: "Click anywhere and type. Pick the font, size, weight and colour." },
    { icon: PenTool02, title: "Sign it", body: "Draw with a mouse or finger, type your name, or upload a photo of your signature." },
    { icon: Brush01, title: "Highlight & white-out", body: "Draw attention to a passage, or cover one up for good." },
    { icon: FileX02, title: "Rearrange pages", body: "Reorder, rotate, duplicate and delete pages, then download the result." },
];

const PROMISES = [
    { icon: CoinsStacked01, title: "No paywall at the download button", body: "There is no paid tier, so there is nothing to upsell you at the last step." },
    { icon: WifiOff, title: "Your file never leaves this tab", body: "The PDF is opened, edited and re-written by your own browser. There is no server to send it to." },
    { icon: Eye, title: "No account, no tracking", body: "Nothing to sign up for. Your work is kept in this browser for a day, then dropped." },
];

export interface GuideLink {
    slug: string;
    title: string;
    dek: string;
}

export function Landing({ latestGuides = [] }: { latestGuides?: GuideLink[] }) {
    const { openFile, status, error } = useEditor();
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const isBusy = status === "loading" || status === "restoring";

    const onDrop = (event: DragEvent) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) void openFile(file);
    };

    return (
        <main className="relative min-h-dvh overflow-hidden bg-primary">
            {/* A wash of the palette behind the hero, kept well away from the text. */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 -top-64 h-160 opacity-[0.18] blur-3xl"
                style={{ backgroundImage: "var(--gradient-warm)" }}
            />

            <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 py-14 sm:px-6 sm:py-20">
                <nav className="mb-10 flex w-full items-center justify-between gap-4">
                    <Wordmark className="h-8 sm:h-9" />
                    <div className="flex items-center gap-1">
                        <Link
                            href="/extract"
                            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-tertiary transition hover:bg-secondary hover:text-secondary"
                        >
                            Extract
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
                    A PDF editor that is <span className="text-gradient-warm">actually</span> free
                </h1>
                <p className="mt-4 max-w-xl text-center text-lg text-balance text-tertiary">
                    Add text, drop in a signature, highlight, white-out, reorder pages — then download it. No account, no upload, no watermark, no
                    &ldquo;free trial&rdquo; that wants a card at the end.
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
                        "mt-10 w-full max-w-xl rounded-2xl bg-primary p-1 ring-1 transition-all duration-200 ring-inset",
                        isDragging ? "ring-2 ring-brand" : "ring-secondary",
                    )}
                >
                    <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => inputRef.current?.click()}
                        className={cx(
                            "flex w-full cursor-pointer flex-col items-center gap-4 rounded-xl px-6 py-12 transition",
                            isDragging ? "bg-brand-primary" : "bg-secondary hover:bg-secondary_hover",
                            isBusy && "cursor-wait opacity-70",
                        )}
                    >
                        {isBusy ? (
                            <>
                                <LoadingIndicator type="dot-circle" size="md" />
                                <span className="text-sm font-semibold text-secondary">
                                    {status === "restoring" ? "Picking up where you left off…" : "Opening your PDF…"}
                                </span>
                            </>
                        ) : (
                            <>
                                <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-fg-brand-primary shadow-xs ring-1 ring-secondary ring-inset">
                                    <UploadCloud01 className="size-6" />
                                </span>
                                <span className="flex flex-col items-center gap-1">
                                    <span className="text-md font-semibold text-primary">
                                        <span className="text-brand-secondary">Choose a PDF</span> or drag one here
                                    </span>
                                    <span className="text-sm text-tertiary">Up to 100 MB · stays on your device</span>
                                </span>
                            </>
                        )}
                    </button>

                    <input
                        ref={inputRef}
                        type="file"
                        accept="application/pdf,.pdf"
                        className="sr-only"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void openFile(file);
                            // Reset so choosing the same file twice still fires.
                            event.target.value = "";
                        }}
                    />
                </div>

                {error && (
                    <div role="alert" className="mt-4 flex max-w-xl items-start gap-3 rounded-xl bg-error-primary px-4 py-3 ring-1 ring-error_subtle ring-inset">
                        <AlertCircle className="mt-0.5 size-5 shrink-0 text-fg-error-secondary" />
                        <p className="text-sm text-error-primary">{error}</p>
                    </div>
                )}

                {/* ---------------------------------------------------------- */}

                <div className="mt-16 grid w-full gap-x-8 gap-y-6 sm:grid-cols-2">
                    {CAPABILITIES.map((item) => (
                        <div key={item.title} className="flex gap-3.5">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-fg-brand-primary ring-1 ring-brand ring-inset">
                                <item.icon className="size-4.5" />
                            </span>
                            <div>
                                <h2 className="text-sm font-semibold text-primary">{item.title}</h2>
                                <p className="mt-0.5 text-sm text-tertiary">{item.body}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-14 w-full rounded-2xl bg-secondary p-6 sm:p-8">
                    <h2 className="text-sm font-semibold tracking-wide text-quaternary uppercase">Why &ldquo;actually&rdquo;</h2>
                    <div className="mt-5 grid gap-6 sm:grid-cols-3">
                        {PROMISES.map((item) => (
                            <div key={item.title}>
                                <item.icon className="size-5 text-fg-brand-primary" />
                                <h3 className="mt-3 text-sm font-semibold text-primary">{item.title}</h3>
                                <p className="mt-1 text-sm text-tertiary">{item.body}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <section className="mt-14 w-full rounded-2xl border border-secondary p-6 sm:p-8">
                    <h2 className="text-sm font-semibold tracking-wide text-quaternary uppercase">Also here</h2>
                    <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-primary">Turn PDFs into data, locally</h3>
                            <p className="mt-1 max-w-xl text-sm text-tertiary">
                                Pull out text and tables as CSV, JSON or Markdown, run OCR on scanned pages in this browser, and find and truly remove the
                                personal data hiding in a document.
                            </p>
                        </div>
                        <Button href="/extract" size="lg" color="secondary" className="shrink-0">
                            Open the extractor
                        </Button>
                    </div>
                </section>

                <section className="mt-14 w-full border-t border-secondary pt-10">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <h2 className="text-sm font-semibold tracking-wide text-quaternary uppercase">Guides</h2>
                        <Link href="/blog" className="text-sm font-semibold text-brand-secondary transition hover:text-brand-secondary_hover">
                            All guides
                        </Link>
                    </div>
                    <ul className="mt-5 grid gap-5 sm:grid-cols-2">
                        {latestGuides.map((guide) => (
                            <li key={guide.slug}>
                                <Link href={`/blog/${guide.slug}`} className="group flex flex-col gap-1">
                                    <span className="font-semibold text-primary transition group-hover:text-brand-secondary">{guide.title}</span>
                                    <span className="text-sm text-tertiary">{guide.dek}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>

                <footer className="mt-12 flex flex-col items-center gap-3 text-center">
                    <p className="text-xs text-quaternary">
                        Built with pdf.js and pdf-lib. Interface by{" "}
                        <Button href="https://www.untitledui.com/react" target="_blank" rel="noreferrer" color="link-color" size="sm">
                            Untitled UI React
                        </Button>
                        .
                    </p>
                </footer>
            </div>
        </main>
    );
}
