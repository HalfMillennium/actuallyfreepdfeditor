/**
 * What the editor actually does — the anti-hallucination layer.
 *
 * Injected verbatim into the author prompt and, independently, the reviewer
 * prompt. The `cannot` list matters more than the `can` list: without it the
 * author will eventually promise PDF-to-Word or a searchable scan, and shipping
 * that is how the blog stops being trustworthy. Note how narrow the OCR entries
 * are — "reads scanned pages" and "makes a scan searchable" are a hair apart in
 * English and a long way apart in fact.
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
        "white-out (cover) a region so the content underneath is not visible in the exported file — this covers, it does not remove",
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
        "say whether a page carries a real text layer or is a picture of a document",
        "read the text a PDF already contains, in reading order, and export it as plain text or Markdown",
        "read scanned pages with OCR in the browser, so a photographed document becomes text",
        "turn a table you draw a box around into CSV or JSON, with the columns worked out from the gaps between the text",
        "find likely personal data — email addresses, phone numbers, card numbers, IBANs, US Social Security numbers, UK National Insurance numbers, UK postcodes, IP addresses and dates of birth — and list every match for review",
        "truly redact ticked matches or a drawn region: the affected pages are rebuilt so the removed text is no longer in the file, and the result is re-read to confirm it is gone",
        "clear a redacted file's title, author, subject and keywords, so the metadata does not carry what the pages no longer say",
        "open several files at once and run the same export across all of them",
    ],
    cannot: [
        "make a scan searchable: OCR text can be exported, but it is not written back into the PDF as a selectable text layer, so the file itself stays a picture",
        "OCR anything other than English — only the English training data is shipped",
        "convert a PDF to Word, PowerPoint or a formatted spreadsheet (.docx, .pptx, .xlsx); extraction produces plain text, Markdown, CSV and JSON instead",
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
        "promise it has found every piece of personal data in a document — it matches the patterns listed above and nothing else, so anything unusual has to be selected by hand",
        "redact anything on its own: nothing is removed until it is ticked",
    ],
    constraints: [
        "files up to 100 MB",
        "all processing happens in the browser; the file is never uploaded to a server",
        "no account, no upload, no watermark, no trial",
        "work is kept in the browser for 24 hours so a refresh does not lose it, then dropped",
        "OCR runs on your own processor, so a long scan takes minutes rather than seconds",
        "redacted pages are flattened to images, which makes the file larger and stops the text on those pages being selectable — that is the cost of the text genuinely being gone",
        "the editor is at the site root; extraction, OCR, table export and redaction are at /extract on the same site",
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
