import Link from "next/link";

import { Wordmark } from "@/components/editor/wordmark";
import { cx } from "@/utils/cx";

/**
 * Header for the non-editor pages.
 *
 * The editor has its own chrome — it needs the filename, undo, zoom and the
 * download button — so it links to the guides from there rather than reusing
 * this.
 */
export function SiteHeader({ className }: { className?: string }) {
    return (
        <header className={cx("border-b border-secondary bg-primary", className)}>
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
                <Link href="/" aria-label="actuallyfreepdfeditor home">
                    <Wordmark className="h-6 sm:h-7" />
                </Link>

                <nav className="flex items-center gap-1 text-sm font-semibold">
                    <Link href="/extract" className="rounded-lg px-3 py-1.5 text-tertiary transition hover:bg-secondary hover:text-secondary max-sm:hidden">
                        Extract
                    </Link>
                    <Link href="/blog" className="rounded-lg px-3 py-1.5 text-tertiary transition hover:bg-secondary hover:text-secondary">
                        Guides
                    </Link>
                    <Link
                        href="/"
                        className="rounded-lg bg-brand-solid px-3 py-1.5 text-white shadow-xs-skeuomorphic transition hover:bg-brand-solid_hover"
                    >
                        Open the editor
                    </Link>
                </nav>
            </div>
        </header>
    );
}
