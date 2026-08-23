import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { Analytics } from "@vercel/analytics/next";

import "@/styles/globals.css";

const inter = Inter({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-inter",
});

export const metadata: Metadata = {
    title: "actuallyfreepdfeditor — edit PDFs in your browser, for free",
    description:
        "Add text, drop in a signature, highlight, white-out and reorder pages. Everything runs in your browser: your file is never uploaded anywhere.",
};

export const viewport: Viewport = {
    themeColor: "#E8431C",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={inter.variable}>
            <body className="bg-primary text-primary antialiased">
                {children}
                {/* Page-view analytics. Inert outside Vercel, so local builds and
                    `next start` are unaffected. */}
                <Analytics />
            </body>
        </html>
    );
}
