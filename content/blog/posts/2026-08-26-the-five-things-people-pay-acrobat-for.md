---
title: "The Five Things People Pay Acrobat For"
dek: "Most PDF tasks have a free answer that works. Five of them genuinely do not. Here is which is which, so you know what a subscription actually buys."
date: "2026-08-26"
tags: ["comparison", "tools", "redaction"]
taskIntent: comparison
signalOrigin: backlog
generated: true
runId: "manual-2026-W35"
---

Most of what people open Acrobat for has a free equivalent that works perfectly well. A handful of things did not, and they are worth knowing by name, so you can tell the difference between needing the subscription and merely being used to it. Two of the five have since acquired usable free versions, with caveats named below; the other three have not.

#### Real redaction

Covering text with a black box is not the same as removing it, and the difference has ended careers. Real redaction deletes the underlying content from the file and scrubs the metadata, so there is nothing left to recover by selecting the text or dumping the file.

Acrobat Pro does this properly. A handful of specialist tools do, and a small number of free ones now do too — the test is not the price but whether the tool will let you check its own output afterwards. Most free editors only cover, which is fine for a screenshot in a slide deck and not fine for a court filing. If you handle documents where the hidden thing must genuinely be gone, either pay for the tool or use one that shows you the result and lets you search it for what you removed.

#### Certificate signatures

A drawn or typed signature is an image, and for most documents that is exactly what is being asked for. It carries the same weight as signing paper and scanning it.

Some processes want something else: a cryptographic signature backed by a certificate, which a recipient can verify and which proves the document has not changed since it was signed. That is a different mechanism with an entire infrastructure behind it, and it is not something a browser editor produces. If a form asks for a digital certificate or a qualified electronic signature by name, take it literally and check with whoever issued the form.

#### Turning scans into text

Optical character recognition reads the words in a scanned image. What you do with the result is where tools diverge. Acrobat lays a searchable text layer behind the picture, so the original file becomes searchable in place — that is the expensive half, and it does it across hundreds of pages without complaint.

Free tools, including the one below, will read the same pages and hand you the text to copy, export or search elsewhere. That covers most of what people actually want. It does not make the PDF itself searchable, so if your requirement is a filing system that indexes documents in place, the distinction matters and this is a real reason to pay somebody.

#### Editing the original text

Changing a word already set in a PDF, and having the paragraph reflow around it, is genuinely difficult. The format stores instructions for drawing letters at positions, not paragraphs, so the software has to reconstruct the layout well enough to guess where a paragraph begins and ends. Acrobat is decent at this and still gets confused by anything unusual.

Almost everyone who says they want this actually wants something easier: adding text, not editing existing text. Filling a form, dating a page, correcting a figure by covering it and typing over. The two get conflated constantly, and only one of them is hard.

#### Print production

Preflight checks, colour separations, ink coverage, conformance to the PDF/X profiles a commercial printer asks for. If you send files to a print shop these matter and there is no casual substitute for the tooling.

If you do not, you will never open this menu, and it is worth being honest that a large share of Acrobat's price tag is this professional half of the product.

#### Practical notes

The honest test is how often you hit one of those five. Most people paying for Acrobat are paying to add a signature and fill in a form, which has been free for years in several places. Cancel and find out what breaks. The usual answer is nothing, and if something does break you will know precisely which of the five you needed, which is a better position than guessing.

[actuallyfreepdfeditor.com](https://actuallyfreepdfeditor.com) covers the everyday half — adding text, signing, highlighting, covering things over, reordering and rotating pages — in the browser, with no account and no watermark. Its /extract page now covers two of the five, in the narrow sense described above: it reads scanned pages and it redacts properly, rebuilding the affected pages so the text is gone and then re-reading the result to prove it. The other three, and the searchable-scan half of OCR, are still reasons people pay.
