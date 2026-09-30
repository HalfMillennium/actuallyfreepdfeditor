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
        "edit the text already in a PDF: click a line to reword or delete it, and the original words are removed from the exported file rather than covered — on pages that have a real text layer, not scans",
        "find and replace a word or phrase across every page at once, with match-case and whole-word options, as a single undoable step",
        "add text anywhere on a page, with control over font, size, weight, slant, colour and alignment",
        "draw a signature with a mouse, trackpad or finger",
        "type a signature in a handwriting-style face",
        "upload a photo of a signature and place it, with a near-white background removed automatically",
        "highlight passages in a chosen colour and opacity",
        "white-out (cover) a region so the content underneath is not visible in the exported file — this covers, it does not remove",
        "draw freehand on a page with a pen, in a chosen colour and stroke width",
        "draw rectangles, ellipses, lines and arrows, with a chosen stroke colour, stroke width and optional fill",
        "stamp page numbers on every page (1, Page 1, Page 1 of N, 1 / N) or Bates numbers with a prefix and zero-padding, in any corner or centred, optionally skipping the first page",
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
        "clear a redacted file's title, author, subject, keywords, creator and producer, and leave out its XMP metadata, attachments, bookmarks and earlier saved versions, so the file does not carry what the pages no longer say",
        "check any PDF, redacted with any tool, for text that can still be pulled out: text under a black or white box, redaction marks that were never applied, boxes added as comments, hidden OCR text under a blacked-out scan, and text left in earlier saved versions inside the file",
        "list a PDF's metadata (title, author, subject, keywords, creator, producer and XMP fields), attachments, filled-in form field values and bookmark titles, as things to review before sending",
        "remove a PDF's metadata by saving a fresh copy of its pages without the document properties, XMP metadata, attachments, bookmarks or earlier saved versions, then re-read the copy to confirm the properties are empty",
        "hand a file the checker found leaking straight to the redaction tool, with the recovered text listed as matches to review",
        "open several files at once and run the same export across all of them",
    ],
    cannot: [
        "make a scan searchable: OCR text can be exported, but it is not written back into the PDF as a selectable text layer, so the file itself stays a picture",
        "OCR anything other than English — only the English training data is shipped",
        "convert a PDF to Word, PowerPoint or a formatted spreadsheet (.docx, .pptx, .xlsx); extraction produces plain text, Markdown, CSV and JSON instead",
        "edit text in a scanned page — there is no text layer to edit, so text can only be typed over it",
        "keep the document's own font when text is edited: the new wording is set in the closest of Helvetica, Times or Courier, because embedded fonts are almost always subset to the characters already used",
        "reflow a paragraph when edited text gets longer: each line is edited on its own and does not push the lines below it down",
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
        "find names, addresses written in a sentence, salaries, medical details or anything else that depends on context — the pattern search only finds fixed-format data",
        "promise a redacted document is legally compliant, court-ready, or certified for HIPAA, GDPR or any other regime; it is not a substitute for a legal-disclosure tool",
        "prove a document is safe with a checker pass: a pass means no hidden text was found, not that nothing sensitive is still visible on the page",
        "keep a redacted page's remaining text selectable or searchable: a page with any redaction on it is rebuilt as an image",
    ],
    constraints: [
        "files up to 100 MB",
        "all processing happens in the browser; the file is never uploaded to a server",
        "no account, no upload, no watermark, no trial",
        "work is kept in the browser for 24 hours so a refresh does not lose it, then dropped",
        "OCR runs on your own processor, so a long scan takes minutes rather than seconds",
        "redacted pages are flattened to images, which makes the file larger and stops the text on those pages being selectable — that is the cost of the text genuinely being gone",
        "edited and replaced text uses Latin characters (Windows-1252); characters outside that set come out as a question mark",
        "the editor is at the site root; redaction, plus text and table extraction and OCR, are at /redact (formerly /extract), and the redaction checker is at /check-redaction, all on the same site",
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
