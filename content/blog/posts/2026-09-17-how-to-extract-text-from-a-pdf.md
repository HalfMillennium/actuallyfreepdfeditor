---
title: "How to Extract Text From a PDF"
dek: "Two entirely different jobs share one name. Which one you have depends on whether the PDF contains text or a picture of text, and you can tell in about three seconds."
date: "2026-09-17"
tags: ["extraction", "text", "ocr"]
taskIntent: data-extraction
signalOrigin: backlog
generated: false
runId: "manual-2026-W38"
---

Open the file and try to drag-select a sentence. If the words highlight, the text is already in there and getting it out is a copy operation. If your cursor draws a rectangle across the page instead, there is no text to copy and you need optical character recognition. These are different jobs with different failure modes, and starting the wrong one is why people end up with a file full of nothing.

#### The copy that works

A PDF with a text layer stores the actual characters along with instructions for where to draw them. Select all, copy, paste, and you have the words. What you will not have is the layout: two columns become interleaved nonsense, a table collapses into a single run of numbers, and headers and footers land in the middle of sentences.

That happens because the file records drawing order, not reading order. A tool that sorts the text into rows before emitting it produces something readable; one that dumps the content stream in order does not. If a copy-paste comes out scrambled, the fix is a better extractor, not a better PDF.

#### When nothing selects

A scan is a photograph. The page is one big image, and the characters you can plainly read are not characters as far as the file is concerned — they are dark pixels. No amount of selecting will produce text, because there is no text.

OCR looks at that image and guesses which letters the shapes represent. It is genuinely good on clean, straight, printed pages at 300 dots per inch or better. It degrades on photographs taken at an angle, on faint carbon copies, on stamps overlapping print, and on handwriting, where most engines are close to useless. Expect to proofread numbers in particular: a 5 read as an S in a reference number is the kind of error that survives a skim.

#### Mixed documents are normal

A contract that has been signed, scanned and re-sent will often have thirty pages of real text and two pages that are photographs of the pages someone printed and signed. The same document can need both approaches on different pages.

This is worth checking before you run anything, because OCR on a page that already has text is strictly worse than reading the text. The text layer is exact; OCR is an estimate. Any tool that runs recognition across a whole document without looking first is throwing away accuracy it already had.

#### What to ask for

Decide what shape you want before you extract, because it changes which tool suits. Plain text is right for reading and searching. Markdown keeps headings and gives you something to paste into a document. CSV is right when the thing you want is a table and you intend to open it in a spreadsheet. JSON is right when a script is going to read it.

Asking for CSV from a page that is not a table gets you one column of lines, which is technically correct and useless. Point at the table specifically — most tools let you draw a box round it — and the columns come out as columns.

#### Practical notes

Check the character count, not the page count. A scanned page with a typed footer added by the scanner will report a text layer that contains eleven characters of copyright notice and nothing else, which some tools will happily call a success. If a hundred-page document yields four hundred characters, it is a scan with a decoration, not a document with text.

Keep the original. Every extraction is lossy in some direction, and you will want to go back and try a different approach at least once.

[actuallyfreepdfeditor.com/extract](https://actuallyfreepdfeditor.com/extract) opens a PDF in your browser, reports page by page whether it found a real text layer, and reads the pages that have one exactly. Where a page turns out to be a scan it will run OCR on your own machine rather than uploading anything, and exports come out as text, Markdown, CSV or JSON.
