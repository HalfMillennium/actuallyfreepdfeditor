import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/blog/site-footer";
import { SiteHeader } from "@/components/blog/site-header";
import { getAllPosts } from "@/lib/blog/posts";
import { breadcrumbSchema, jsonLd } from "@/lib/blog/structured-data";
import { INTENT_LABELS } from "@/lib/blog/taxonomy";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

const TITLE = "Guides";
const DESCRIPTION =
    "Straight answers to the document tasks people actually get stuck on — signing, filling, redacting, reordering — from the people who built a free browser PDF editor.";

export const metadata: Metadata = {
    title: `${TITLE} — ${SITE_NAME}`,
    description: DESCRIPTION,
    alternates: { canonical: absoluteUrl("/blog") },
    openGraph: {
        type: "website",
        title: `${TITLE} — ${SITE_NAME}`,
        description: DESCRIPTION,
        url: absoluteUrl("/blog"),
        siteName: SITE_NAME,
    },
    twitter: { card: "summary_large_image", title: `${TITLE} — ${SITE_NAME}`, description: DESCRIPTION },
};

function formatDate(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export default function BlogIndexPage() {
    const posts = getAllPosts();

    return (
        <div className="flex min-h-dvh flex-col bg-primary">
            <SiteHeader />

            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: jsonLd(
                        breadcrumbSchema([
                            { name: "Home", path: "/" },
                            { name: TITLE, path: "/blog" },
                        ]),
                    ),
                }}
            />

            <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
                <h1 className="text-display-xs font-semibold tracking-tight text-primary sm:text-display-sm">Guides</h1>
                <p className="mt-3 max-w-xl text-lg text-tertiary">{DESCRIPTION}</p>

                {posts.length === 0 ? (
                    <p className="mt-12 rounded-xl bg-secondary px-5 py-8 text-center text-sm text-tertiary">
                        No guides published yet. Check back shortly.
                    </p>
                ) : (
                    <ol className="mt-12 flex flex-col">
                        {posts.map((post) => (
                            <li key={post.slug} className="border-t border-secondary first:border-t-0">
                                <Link href={`/blog/${post.slug}`} className="group flex flex-col gap-1.5 py-6 transition">
                                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-quaternary">
                                        <time dateTime={post.date}>{formatDate(post.date)}</time>
                                        <span aria-hidden="true">·</span>
                                        <span>{INTENT_LABELS[post.taskIntent]}</span>
                                        <span aria-hidden="true">·</span>
                                        <span>{post.readingMinutes} min read</span>
                                    </div>
                                    <h2 className="text-lg font-semibold text-primary transition group-hover:text-brand-secondary">{post.title}</h2>
                                    <p className="text-md text-tertiary">{post.dek}</p>
                                </Link>
                            </li>
                        ))}
                    </ol>
                )}
            </main>

            <SiteFooter />
        </div>
    );
}
