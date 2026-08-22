import Link from "next/link";

import { Wordmark } from "@/components/editor/wordmark";

export function SiteFooter() {
    return (
        <footer className="border-t border-secondary bg-primary">
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                <div className="max-w-xs">
                    <Link href="/" aria-label="actuallyfreepdfeditor home">
                        <Wordmark className="h-6" />
                    </Link>
                    <p className="mt-3 text-sm text-tertiary">
                        A PDF editor that runs entirely in your browser. No account, no upload, no watermark.
                    </p>
                </div>

                <nav className="flex gap-10 text-sm">
                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-semibold tracking-wide text-quaternary uppercase">Editor</span>
                        <Link href="/" className="text-tertiary transition hover:text-secondary">
                            Open a PDF
                        </Link>
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-semibold tracking-wide text-quaternary uppercase">Guides</span>
                        <Link href="/blog" className="text-tertiary transition hover:text-secondary">
                            All guides
                        </Link>
                        <a href="/feed.xml" className="text-tertiary transition hover:text-secondary">
                            RSS
                        </a>
                    </div>
                </nav>
            </div>
        </footer>
    );
}
