import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
                // The ops dashboard is an internal view of the pipeline's
                // decisions. It is token-gated as well, but there is no reason
                // for it to be crawled at all.
                disallow: ["/blog/ops"],
            },
        ],
        sitemap: absoluteUrl("/sitemap.xml"),
    };
}
