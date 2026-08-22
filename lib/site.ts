/**
 * Canonical site identity.
 *
 * `NEXT_PUBLIC_SITE_URL` lets preview deployments generate correct absolute
 * URLs; the production domain is the fallback so a plain `next build` is right
 * without any environment at all.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://actuallyfreepdfeditor.com").replace(/\/$/, "");

export const SITE_NAME = "actuallyfreepdfeditor";

export const SITE_TAGLINE = "A PDF editor that is actually free";

export const SITE_DESCRIPTION =
    "Add text, drop in a signature, highlight, white-out and reorder pages. Everything runs in your browser: your file is never uploaded anywhere.";

export function absoluteUrl(path: string): string {
    return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
