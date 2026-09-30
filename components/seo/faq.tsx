import type { FaqEntry } from "@/lib/seo";

/**
 * A plain FAQ block, rendered from the same array the page's FAQPage JSON-LD
 * is built from so the two cannot drift apart.
 *
 * `<details>` keeps it compact on a phone while leaving every answer in the
 * HTML for crawlers and for anyone quoting the page.
 */
export function Faq({ entries, title = "Questions" }: { entries: FaqEntry[]; title?: string }) {
    return (
        <section className="w-full" aria-labelledby="faq-heading">
            <h2 id="faq-heading" className="text-lg font-semibold text-primary">
                {title}
            </h2>
            <div className="mt-4 divide-y divide-secondary rounded-xl border border-secondary bg-primary">
                {entries.map((entry) => (
                    <details key={entry.question} className="group px-5 py-4">
                        <summary className="cursor-pointer list-none text-md font-semibold text-primary marker:hidden">
                            <span className="flex items-start justify-between gap-4">
                                {entry.question}
                                <span aria-hidden="true" className="text-quaternary transition group-open:rotate-45">
                                    +
                                </span>
                            </span>
                        </summary>
                        <p className="mt-2 text-sm text-tertiary">{entry.answer}</p>
                    </details>
                ))}
            </div>
        </section>
    );
}
