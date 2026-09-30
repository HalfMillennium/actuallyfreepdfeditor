"use client";

import { type DragEvent, useCallback, useEffect, useRef, useState } from "react";

import { AlertCircle, AlertTriangle, CheckCircle, Eye, EyeOff, RefreshCcw01, Shield01, UploadCloud01, XCircle } from "@untitledui/icons";
import { useRouter } from "next/navigation";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Button } from "@/components/base/buttons/button";
import { PdfPageCanvas } from "@/components/editor/pdf-page-canvas";
import { downloadBytes } from "@/lib/extract/export";
import { loadPdf } from "@/lib/pdf-document";
import { CHECK_LIMIT } from "@/lib/redaction-copy";
import { CHECK_LABELS, type CheckProgress, type CheckReport, type Finding, UnreadablePdfError, checkRedaction, mask, metadataFindings } from "@/lib/redaction-check/check";
import { handOff, takeHandoff } from "@/lib/redaction-check/handoff";
import { cx } from "@/utils/cx";

const MAX_FILE_BYTES = 100 * 1024 * 1024;

type State =
    | { kind: "idle" }
    | { kind: "working"; fileName: string; progress: CheckProgress | null }
    | { kind: "done"; file: File; report: CheckReport }
    | { kind: "error"; message: string };

export function RedactionChecker() {
    const [state, setState] = useState<State>({ kind: "idle" });
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const run = useCallback(async (file: File) => {
        if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
            setState({ kind: "error", message: "That doesn't look like a PDF. Pick a file ending in .pdf." });
            return;
        }
        if (file.size > MAX_FILE_BYTES) {
            setState({ kind: "error", message: "That file is larger than 100 MB, which is more than a browser tab can comfortably hold." });
            return;
        }

        setState({ kind: "working", fileName: file.name, progress: null });
        try {
            const report = await checkRedaction(await file.arrayBuffer(), (progress) =>
                setState((current) => (current.kind === "working" ? { ...current, progress } : current)),
            );
            setState({ kind: "done", file, report });
        } catch (error) {
            console.error("Redaction check failed", error);
            setState({
                kind: "error",
                message: error instanceof UnreadablePdfError ? error.message : "Something went wrong reading this file. Nothing was uploaded; try again.",
            });
        }
    }, []);

    /* A file sent over from the redaction tool's "second opinion" button. */
    const handoffTaken = useRef(false);
    useEffect(() => {
        if (handoffTaken.current) return;
        handoffTaken.current = true;
        const handoff = takeHandoff("check");
        if (handoff) void run(handoff.file);
    }, [run]);

    if (state.kind === "done") return <Result file={state.file} report={state.report} onReset={() => setState({ kind: "idle" })} />;

    return (
        <div className="w-full" data-checker-state={state.kind}>
            <div
                onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event: DragEvent) => {
                    event.preventDefault();
                    setIsDragging(false);
                    const file = event.dataTransfer.files[0];
                    if (file) void run(file);
                }}
                className={cx(
                    "flex w-full flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition sm:py-16",
                    isDragging ? "border-brand bg-brand-primary" : "border-secondary bg-secondary",
                )}
            >
                {state.kind === "working" ? (
                    <>
                        <LoadingIndicator type="dot-circle" size="md" />
                        <p className="text-sm font-medium text-secondary" aria-live="polite">
                            {!state.progress
                                ? `Opening ${state.fileName}…`
                                : state.progress.phase === "pages"
                                  ? `Checking page ${state.progress.done + 1} of ${state.progress.total}`
                                  : state.progress.phase === "revisions"
                                    ? "Looking for earlier versions saved inside the file…"
                                    : "Reading metadata, attachments and form fields…"}
                        </p>
                    </>
                ) : (
                    <>
                        <span className="flex size-12 items-center justify-center rounded-xl bg-primary ring-1 ring-secondary">
                            <UploadCloud01 className="size-6 text-fg-brand-primary" />
                        </span>
                        <div>
                            <p className="text-lg font-semibold text-primary">Drop a redacted PDF here</p>
                            <p className="mt-1 text-sm text-tertiary">Your file stays in this tab. Nothing is uploaded.</p>
                        </div>
                        <Button size="lg" color="primary" onClick={() => inputRef.current?.click()}>
                            Choose a file
                        </Button>
                        <input
                            ref={inputRef}
                            type="file"
                            accept="application/pdf,.pdf"
                            className="sr-only"
                            aria-label="Choose a PDF to check"
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                if (file) void run(file);
                            }}
                        />
                    </>
                )}
            </div>

            {state.kind === "error" && (
                <p role="alert" className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-error-primary">
                    <AlertCircle className="size-4 shrink-0" />
                    {state.message}
                </p>
            )}
        </div>
    );
}

/* -------------------------------------------------------------------------- */

function Result({ file, report, onReset }: { file: File; report: CheckReport; onReset: () => void }) {
    const router = useRouter();
    const [reveal, setReveal] = useState<Set<string>>(new Set());
    const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
    const [stripState, setStripState] = useState<"idle" | "working" | "done" | "failed">("idle");

    const fails = report.findings.filter((f) => f.severity === "fail");
    const warns = report.findings.filter((f) => f.severity === "warn");
    const failPages = [...new Set(fails.filter((f) => f.pageIndex !== undefined).map((f) => f.pageIndex!))].sort((a, b) => a - b);
    const revisionFindings = fails.filter((f) => f.check === "old-revision");
    const hasMetadata = warns.some((f) => f.check === "metadata");

    // A separate handle for the thumbnails: the check itself released its own.
    useEffect(() => {
        if (failPages.length === 0) return;
        let cancelled = false;
        let proxy: PDFDocumentProxy | null = null;
        void file.arrayBuffer().then(async (bytes) => {
            proxy = (await loadPdf(bytes)).proxy;
            if (cancelled) void proxy.destroy();
            else setPdf(proxy);
        });
        return () => {
            cancelled = true;
            void proxy?.destroy();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [file]);

    const toggle = (id: string) =>
        setReveal((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const fixIt = () => {
        handOff({ kind: "redact", file, phrases: fails.map((f) => f.text) });
        router.push("/redact");
    };

    const removeMetadata = async () => {
        setStripState("working");
        try {
            const { stripMetadata } = await import("@/lib/redaction-check/strip-metadata");
            const bytes = await stripMetadata(await file.arrayBuffer());
            // Prove it before handing it over, as the redaction tool does.
            const check = (await loadPdf(bytes.slice(0).buffer as ArrayBuffer)).proxy;
            const left = await metadataFindings(check);
            await check.destroy();
            if (left.length > 0) {
                setStripState("failed");
                return;
            }
            downloadBytes(bytes, `${file.name.replace(/\.pdf$/i, "")}-no-metadata.pdf`);
            setStripState("done");
        } catch (error) {
            console.error("Metadata removal failed", error);
            setStripState("failed");
        }
    };

    return (
        <div className="flex w-full flex-col gap-6" data-checker-state="done" data-verdict={report.verdict}>
            <div
                className={cx(
                    "flex items-start gap-4 rounded-2xl border p-5 sm:p-6",
                    report.verdict === "fail" ? "border-error_subtle bg-error-primary" : "border-secondary bg-success-primary",
                )}
            >
                {report.verdict === "fail" ? (
                    <XCircle className="size-8 shrink-0 text-fg-error-primary" />
                ) : (
                    <CheckCircle className="size-8 shrink-0 text-fg-success-primary" />
                )}
                <div className="min-w-0">
                    <h2 className="text-display-xs font-semibold text-primary">
                        {report.verdict === "fail" ? "This redaction leaks." : "We couldn't find any hidden text."}
                    </h2>
                    <p className="mt-1 truncate text-sm text-tertiary" title={file.name}>
                        {file.name} · {report.pages.length} {report.pages.length === 1 ? "page" : "pages"}
                        {report.revisions > 1 && ` · ${report.revisions} saved versions inside the file`}
                    </p>
                    {report.verdict === "fail" && (
                        <p className="mt-2 text-sm text-secondary">
                            {fails.length} {fails.length === 1 ? "piece" : "pieces"} of text can still be pulled out of this file. The text is shown masked
                            below; press Show to read it.
                        </p>
                    )}
                </div>
            </div>

            {report.verdict === "fail" && (
                <div className="flex flex-wrap gap-3">
                    <Button size="md" color="primary" iconLeading={Shield01} onClick={fixIt}>
                        Fix it in the redaction tool
                    </Button>
                    <Button size="md" color="secondary" iconLeading={RefreshCcw01} onClick={onReset}>
                        Check another file
                    </Button>
                </div>
            )}

            {failPages.map((pageIndex) => {
                const pageFindings = fails.filter((f) => f.pageIndex === pageIndex);
                const info = report.pages[pageIndex];
                const thumbScale = Math.min(180 / info.width, 240 / info.height);
                return (
                    <section key={pageIndex} className="rounded-xl border border-secondary bg-primary p-4" data-finding-page={pageIndex + 1}>
                        <h3 className="text-sm font-semibold text-primary">Page {pageIndex + 1}</h3>
                        <div className="mt-3 flex flex-col gap-4 sm:flex-row">
                            <div
                                className="relative shrink-0 self-start overflow-hidden rounded-md ring-1 ring-secondary"
                                style={{ width: info.width * thumbScale, height: info.height * thumbScale }}
                            >
                                {pdf && <PdfPageCanvas pdf={pdf} pageNumber={pageIndex + 1} scale={thumbScale} rotation={info.rotation} className="absolute inset-0" />}
                                {pageFindings.map(
                                    (f) =>
                                        f.rect && (
                                            <span
                                                key={f.id}
                                                aria-hidden="true"
                                                className="absolute rounded-[2px] ring-2 ring-[var(--color-bg-error-solid)]"
                                                style={{
                                                    left: f.rect.x * thumbScale - 2,
                                                    top: f.rect.y * thumbScale - 2,
                                                    width: f.rect.width * thumbScale + 4,
                                                    height: f.rect.height * thumbScale + 4,
                                                }}
                                            />
                                        ),
                                )}
                            </div>
                            <FindingList findings={pageFindings} reveal={reveal} onToggle={toggle} />
                        </div>
                    </section>
                );
            })}

            {revisionFindings.length > 0 && (
                <section className="rounded-xl border border-secondary bg-primary p-4" data-finding-revisions>
                    <h3 className="text-sm font-semibold text-primary">Earlier versions of the file</h3>
                    <p className="mt-1 text-sm text-tertiary">
                        This file was saved over an older version, and the older version is still inside it. This text is in there but not on the pages you
                        see.
                    </p>
                    <div className="mt-3">
                        <FindingList findings={revisionFindings} reveal={reveal} onToggle={toggle} />
                    </div>
                </section>
            )}

            {warns.length > 0 && (
                <section className="rounded-xl border border-secondary bg-primary p-4" data-finding-warnings>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
                        <AlertTriangle className="size-4 text-fg-warning-primary" />
                        Worth a look
                    </h3>
                    <p className="mt-1 text-sm text-tertiary">Not hidden text, but things this file says about itself that are easy to forget.</p>
                    <div className="mt-3">
                        <FindingList findings={warns} reveal={reveal} onToggle={toggle} />
                    </div>
                    {hasMetadata && (
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <Button size="sm" color="secondary" isLoading={stripState === "working"} showTextWhileLoading onClick={() => void removeMetadata()}>
                                Remove metadata and download
                            </Button>
                            {stripState === "done" && (
                                <span role="status" className="text-sm text-success-primary">
                                    Saved a copy with the metadata, attachments, bookmarks and earlier versions left out, and checked it.
                                </span>
                            )}
                            {stripState === "failed" && (
                                <span role="alert" className="text-sm text-error-primary">
                                    Couldn&rsquo;t produce a clean copy of this file. Nothing was downloaded.
                                </span>
                            )}
                        </div>
                    )}
                </section>
            )}

            {report.verdict === "pass" && (
                <>
                    <p className="rounded-xl bg-secondary p-4 text-sm text-secondary" data-honest-limit>
                        {CHECK_LIMIT}
                    </p>
                    <div>
                        <Button size="md" color="secondary" iconLeading={RefreshCcw01} onClick={onReset}>
                            Check another file
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}

function FindingList({ findings, reveal, onToggle }: { findings: Finding[]; reveal: Set<string>; onToggle: (id: string) => void }) {
    return (
        <ul className="flex min-w-0 flex-1 flex-col gap-2">
            {findings.map((finding) => {
                // Software names (Creator, Producer) name nobody; masking them is noise.
                const shown = reveal.has(finding.id) || (finding.check === "metadata" && (finding.label === "Creator" || finding.label === "Producer"));
                return (
                    <li key={finding.id} className="flex min-w-0 items-start gap-3 rounded-lg bg-secondary px-3 py-2" data-check={finding.check}>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-tertiary">
                                {CHECK_LABELS[finding.check]}
                                {finding.label && finding.check !== "covered-text" && finding.check !== "hidden-ocr" && ` · ${finding.label}`}
                            </p>
                            <p className="mt-0.5 font-mono text-sm break-words text-primary" data-masked={!shown}>
                                {shown ? finding.text : mask(finding.text)}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => onToggle(finding.id)}
                            aria-label={shown ? "Hide this text" : "Show this text"}
                            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand-secondary transition hover:bg-primary"
                        >
                            {shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                            {shown ? "Hide" : "Show"}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
