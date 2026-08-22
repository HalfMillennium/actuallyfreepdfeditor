import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft, ArrowRight } from "@untitledui/icons";

import { SiteFooter } from "@/components/blog/site-footer";
import { SiteHeader } from "@/components/blog/site-header";
import { renderMarkdown } from "@/lib/blog/markdown";
import { getAllPosts, getNeighbours, getPost, pickRelated } from "@/lib/blog/posts";
import { articleSchema, breadcrumbSchema, howToSchema, jsonLd } from "@/lib/blog/structured-data";
import { INTENT_LABELS } from "@/lib/blog/taxonomy";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

interface Props {
    params: Promise<{ slug: string }>;
}

/** Fully static: the pipeline's commit is what rebuilds the site, so there is no ISR to configure. */
export function generateStaticParams() {
    return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const post = getPost(slug);
    if (!post) return {};

    const url = absoluteUrl(`/blog/${post.slug}`);

    return {
        title: `${post.title} — ${SITE_NAME}`,
        description: post.dek,
        alternates: { canonical: url },
        openGraph: {
            type: "article",
            title: post.title,
            description: post.dek,
            url,
            siteName: SITE_NAME,
            publishedTime: post.date,
            tags: post.tags,
        },
        twitter: { card: "summary_large_image", title: post.title, description: post.dek },
    };
}

function formatDate(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function BlogPostPage({ params }: Props) {
    const { slug } = await params;
    const post = getPost(slug);
    if (!post) notFound();

    const html = renderMarkdown(post.body);
    const related = pickRelated(post, getAllPosts(), 3);
    const { previous, next } = getNeighbours(post.slug);
    const howTo = howToSchema(post);

    return (
        <div className="flex min-h-dvh flex-col bg-primary">
            <SiteHeader />

            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(articleSchema(post)) }} />
            {howTo && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(howTo) }} />}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: jsonLd(
                        breadcrumbSchema([
                            { name: "Home", path: "/" },
                            { name: "Guides", path: "/blog" },
                            { name: post.title, path: `/blog/${post.slug}` },
                        ]),
                    ),
                }}
            />

            <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
                <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm font-semibold text-tertiary transition hover:text-secondary">
                    <ArrowLeft className="size-4" />
                    All guides
                </Link>

                <article className="mt-8">
                    <header>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-quaternary">
                            <time dateTime={post.date}>{formatDate(post.date)}</time>
                            <span aria-hidden="true">·</span>
                            <span>{INTENT_LABELS[post.taskIntent]}</span>
                            <span aria-hidden="true">·</span>
                            <span>{post.readingMinutes} min read</span>
                        </div>

                        <h1 className="mt-3 text-display-xs font-semibold tracking-tight text-balance text-primary sm:text-display-sm">{post.title}</h1>
                        <p className="mt-4 text-lg text-tertiary">{post.dek}</p>
                    </header>

                    <div className="afpe-prose mt-10" dangerouslySetInnerHTML={{ __html: html }} />
                </article>

                {related.length > 0 && (
                    <section className="mt-14 border-t border-secondary pt-8">
                        <h2 className="text-xs font-semibold tracking-wide text-quaternary uppercase">Related guides</h2>
                        <ul className="mt-4 flex flex-col gap-4">
                            {related.map((item) => (
                                <li key={item.slug}>
                                    <Link href={`/blog/${item.slug}`} className="group flex flex-col gap-0.5">
                                        <span className="font-semibold text-primary transition group-hover:text-brand-secondary">{item.title}</span>
                                        <span className="text-sm text-tertiary">{item.dek}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {(previous || next) && (
                    <nav className="mt-10 flex flex-col gap-3 border-t border-secondary pt-8 sm:flex-row sm:justify-between">
                        {previous ? (
                            <Link href={`/blog/${previous.slug}`} className="group flex max-w-xs flex-col gap-0.5">
                                <span className="flex items-center gap-1 text-xs text-quaternary">
                                    <ArrowLeft className="size-3" /> Previous
                                </span>
                                <span className="text-sm font-semibold text-primary transition group-hover:text-brand-secondary">{previous.title}</span>
                            </Link>
                        ) : (
                            <span />
                        )}
                        {next && (
                            <Link href={`/blog/${next.slug}`} className="group flex max-w-xs flex-col gap-0.5 sm:text-right">
                                <span className="flex items-center gap-1 text-xs text-quaternary sm:justify-end">
                                    Next <ArrowRight className="size-3" />
                                </span>
                                <span className="text-sm font-semibold text-primary transition group-hover:text-brand-secondary">{next.title}</span>
                            </Link>
                        )}
                    </nav>
                )}
            </main>

            <SiteFooter />
        </div>
    );
}
