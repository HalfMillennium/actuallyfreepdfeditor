import type { Metadata } from "next";

import Link from "next/link";

import { RedactionChecker } from "@/components/check/redaction-checker";
import { SiteFooter } from "@/components/blog/site-footer";
import { SiteHeader } from "@/components/blog/site-header";
import { Faq } from "@/components/seo/faq";
import { CHECK_DESCRIPTION, CHECK_FAQ, CHECK_LIMIT, CHECK_LIST, CHECK_TITLE } from "@/lib/redaction-copy";
import { faqSchema, jsonLd, webApplicationSchema } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
    title: CHECK_TITLE,
    description: CHECK_DESCRIPTION,
    alternates: { canonical: absoluteUrl("/check-redaction") },
    openGraph: { title: CHECK_TITLE, description: CHECK_DESCRIPTION, url: absoluteUrl("/check-redaction") },
};

export default function Page() {
    return (
        <div className="flex min-h-dvh flex-col bg-primary">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: jsonLd(webApplicationSchema({ name: "PDF redaction checker", path: "/check-redaction", description: CHECK_DESCRIPTION })),
                }}
            />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema(CHECK_FAQ)) }} />

            <SiteHeader />

            <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-4 py-12 sm:px-6 sm:py-16">
                <h1 className="text-center text-display-sm font-semibold tracking-tight text-balance text-primary sm:text-display-md">
                    Did your redaction actually work?
                </h1>
                <p className="mt-4 max-w-xl text-center text-lg text-balance text-tertiary">
                    Drop in any redacted PDF, from any tool. We&rsquo;ll look for text that&rsquo;s still hiding under the boxes.
                </p>

                <div className="mt-10 w-full">
                    <RedactionChecker />
                </div>

                <section className="mt-14 w-full" aria-labelledby="what-heading">
                    <h2 id="what-heading" className="text-lg font-semibold text-primary">
                        What we check
                    </h2>
                    <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                        {CHECK_LIST.map((item) => (
                            <li key={item} className="rounded-lg border border-secondary px-4 py-3 text-sm text-secondary">
                                {item}
                            </li>
                        ))}
                    </ul>
                    <p className="mt-4 text-sm text-tertiary">{CHECK_LIMIT}</p>
                </section>

                <section className="mt-14 w-full rounded-xl border border-secondary bg-secondary p-5">
                    <h2 className="text-md font-semibold text-primary">Found a leak?</h2>
                    <p className="mt-1 text-sm text-tertiary">
                        The <Link href="/redact" className="font-semibold text-brand-secondary underline-offset-2 hover:underline">redaction tool</Link> removes
                        the text instead of covering it, then re-reads the file to confirm it&rsquo;s gone. Nothing is uploaded there either.
                    </p>
                </section>

                <div className="mt-14 w-full">
                    <Faq entries={CHECK_FAQ} />
                </div>

                <section className="mt-14 w-full" aria-labelledby="guides-heading">
                    <h2 id="guides-heading" className="text-lg font-semibold text-primary">
                        Guides
                    </h2>
                    <ul className="mt-3 flex flex-col gap-2 text-sm">
                        <li>
                            <Link href="/blog/why-black-boxes-dont-redact-pdfs" className="font-semibold text-brand-secondary hover:underline">
                                Why black boxes don&rsquo;t redact a PDF
                            </Link>
                        </li>
                        <li>
                            <Link href="/blog/how-to-check-a-pdf-redaction-worked" className="font-semibold text-brand-secondary hover:underline">
                                How to check if a PDF is properly redacted
                            </Link>
                        </li>
                        <li>
                            <Link href="/blog/how-to-remove-metadata-from-a-pdf" className="font-semibold text-brand-secondary hover:underline">
                                How to remove metadata from a PDF
                            </Link>
                        </li>
                    </ul>
                </section>
            </main>

            <SiteFooter />
        </div>
    );
}
