/**
 * What the editor actually does — the anti-hallucination layer.
 *
 * Injected verbatim into the author prompt and, independently, the reviewer
 * prompt. The `cannot` list matters more than the `can` list: without it the
 * author will eventually promise OCR or PDF-to-Word, and shipping that is how
 * the blog stops being trustworthy.
 *
 * Every entry here was checked against the source, not against a plan. When a
 * feature ships or is removed, this file changes in the same commit — a stale
 * manifest is worse than no manifest, because three separate checks trust it.
 */
export const CAPABILITIES = {
    can: [
        "add text anywhere on a page, with control over font, size, weight, slant, colour and alignment",
        "draw a signature with a mouse, trackpad or finger",
        "type a signature in a handwriting-style face",
        "upload a photo of a signature and place it, with a near-white background removed automatically",
        "highlight passages in a chosen colour and opacity",
        "white-out (cover) a region so the content underneath is not visible in the exported file",
        "draw freehand on a page with a pen, in a chosen colour and stroke width",
        "place an image on a page",
        "move, resize and delete anything you add",
        "undo and redo every edit",
        "reorder pages",
        "rotate pages",
        "duplicate pages",
        "delete pages",
        "zoom, and fit the page to the window",
        "download the edited PDF with no watermark and no sign-up",
    ],
    cannot: [
        "OCR scanned documents or make scanned text searchable",
        "convert a PDF to Word, Excel, PowerPoint or any other format",
        "edit the text that is already in the original PDF — added text sits on top as a new layer",
        "fill interactive AcroForm fields as form data (text can be placed over them visually instead)",
        "merge two separate PDF files into one",
        "split one PDF into several separate files",
        "compress a PDF or reduce its file size",
        "apply a cryptographic or certificate-based digital signature",
        "open, decrypt or remove the password from a password-protected PDF",
        "add a password to a PDF",
        "extract images from a PDF as separate files",
        "translate a document",
    ],
    constraints: [
        "files up to 100 MB",
        "all processing happens in the browser; the file is never uploaded to a server",
        "no account, no upload, no watermark, no trial",
        "work is kept in the browser for 24 hours so a refresh does not lose it, then dropped",
    ],
    url: "https://actuallyfreepdfeditor.com",
} as const;

/**
 * The `cannot` list read as prose, for the prompts.
 *
 * Phrased as an instruction to *use* the limitations rather than route around
 * them: "this tool can't OCR a scan, here's what to do instead" is a genuinely
 * useful paragraph, and it is the thing that makes the rest of the article
 * credible.
 */
export function capabilityBriefing(): string {
    return [
        "WHAT THE EDITOR AT actuallyfreepdfeditor.com CAN DO:",
        ...CAPABILITIES.can.map((item) => `  - ${item}`),
        "",
        "WHAT IT CANNOT DO — never imply otherwise, in any phrasing:",
        ...CAPABILITIES.cannot.map((item) => `  - it cannot ${item}`),
        "",
        "CONSTRAINTS:",
        ...CAPABILITIES.constraints.map((item) => `  - ${item}`),
        "",
        "Treat the 'cannot' list as material, not as an obstacle. An article that",
        "says plainly where this tool is the wrong choice, and names what the",
        "reader should reach for instead, is more useful and more credible than",
        "one that quietly avoids the subject.",
    ].join("\n");
}
