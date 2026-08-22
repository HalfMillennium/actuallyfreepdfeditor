import { cx } from "@/utils/cx";

/**
 * The app's mark: a sheet of paper with a corner turned, filled with the
 * palette gradient.
 */
export function Wordmark({ className, showText = true }: { className?: string; showText?: boolean }) {
    return (
        <span className={cx("flex items-center gap-2", className)}>
            <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden="true">
                <defs>
                    <linearGradient id="afpe-mark" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#ffe548" />
                        <stop offset="35%" stopColor="#ffb20f" />
                        <stop offset="70%" stopColor="#ff4b3e" />
                        <stop offset="100%" stopColor="#972d07" />
                    </linearGradient>
                </defs>
                <path d="M6 3.5A2.5 2.5 0 0 1 8.5 1h10L27 9.5V28.5A2.5 2.5 0 0 1 24.5 31h-16A2.5 2.5 0 0 1 6 28.5Z" fill="url(#afpe-mark)" />
                <path d="M18.5 1 27 9.5h-6a2.5 2.5 0 0 1-2.5-2.5Z" fill="#582707" fillOpacity="0.35" />
                <path d="M11 19.5h11M11 24h7" stroke="#582707" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
            </svg>

            {showText && (
                <span className="text-sm font-semibold tracking-tight text-primary">
                    actually<span className="text-gradient-warm">free</span>pdfeditor
                </span>
            )}
        </span>
    );
}
