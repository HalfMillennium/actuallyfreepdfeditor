---
title: How to Black Out Information in a PDF (and What Redaction Really Means)
dek: Drawing a black box over an account number is not the same as removing it. Here is the difference, and how to make sure the number is actually gone.
date: "2026-08-20"
tags: ["redaction", "privacy", "security"]
taskIntent: redaction
signalOrigin: backlog
---

Covering something on a PDF page and deleting it from the file are two different operations, and most free tools only do the first. If you are hiding an account number, a home address, or a salary before passing a document on, that distinction is the entire question.

#### What a black box does

A PDF is a set of drawing instructions layered onto a page. When you draw a filled rectangle over a line of text, you add an instruction that says "paint this area black". The instruction that draws the text underneath is still there, unchanged, sitting below the rectangle in the layer order.

Anyone can get it back. Select the text and copy it. Open the file in a reader that extracts text. Run it through any of the command-line tools that dump a PDF's content stream. The box is a visual cover, not a deletion, and the text survives all of it.

This is not a hypothetical failure. Court filings, government reports, and corporate disclosures have leaked this way repeatedly, and in most cases the person who did it believed the information was gone.

#### What real redaction does

Real redaction removes the underlying content and then draws the box. The text is deleted from the content stream, the metadata is scrubbed, and what remains is a file where the information does not exist to be recovered. Acrobat Pro does this, as do a handful of specialist tools. Most browser-based editors do not.

#### The reliable workaround

If you do not have redaction software, do not try to be clever with layers. Flatten the page into an image instead:

- Cover the sensitive area with an opaque box in whatever editor you have.
- Print the file to PDF, or export it as an image and rebuild the PDF from that.
- Open the result and try to select the text you covered. If nothing selects, it is gone.

Printing to PDF rasterises the page — the text becomes pixels — and the pixels under a black box are simply black. The file gets larger and the remaining text stops being selectable or searchable, which is a genuine cost. For a document you are sending once, it is usually the right trade.

#### When covering is fine

Not every case needs deletion. If you are marking up a printout for yourself, hiding a name in a screenshot for a slide, or covering something in a document that will only ever be looked at, a box is fine and takes five seconds.

The test is who receives the file and what they could do with it. A colleague reading it on screen sees a black box. A file posted publicly, sent to an opposing party, or handed to anyone with a reason to look harder should be flattened or properly redacted.

#### Metadata is the other half

Even a properly flattened page leaves the document's metadata untouched. The author name, the software that produced it, revision history in some files, and the original filename all travel with the PDF. A document that says nothing on the page can still say plenty in its properties. Check them before sending anything sensitive.

actuallyfreepdfeditor.com has a white-out tool that paints an opaque block over a region, and the block is written into the exported file rather than kept as a separate annotation a reader could switch off. It covers rather than deletes, which is exactly why the flattening step above matters when the file is going somewhere you do not control.

If the document is genuinely sensitive — medical records, anything heading into a legal proceeding, anything covered by a disclosure obligation — use software built for redaction and verify the output afterwards. The flattening trick is sound, but "sound" and "defensible if it goes wrong" are not the same standard.
