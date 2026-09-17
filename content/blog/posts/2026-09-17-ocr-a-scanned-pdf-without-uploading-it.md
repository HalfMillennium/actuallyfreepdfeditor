---
title: "OCR a Scanned PDF Without Uploading It"
dek: "Browser OCR is now good enough for real work, and it means the document never leaves your machine. Here is what it does well, what it does badly, and what it still cannot give you."
date: "2026-09-17"
tags: ["ocr", "privacy", "extraction"]
taskIntent: data-extraction
signalOrigin: backlog
generated: false
runId: "manual-2026-W38"
---

Most free OCR sites work by uploading your document to a server, running recognition there, and mailing you a link. For a recipe clipping that is fine. For a medical letter, a payslip or anything covered by a confidentiality clause, you have just sent the document to a third party in order to read words you could already read.

There is another way to do it. The recognition engine can run inside the browser tab, on your own processor, with the file never leaving the machine.

#### How local recognition works

A PDF page gets drawn to a canvas, exactly as it is drawn to show you the page. That canvas is a bitmap, and a recognition engine compiled to WebAssembly reads it and returns the characters it thinks it sees, with a position and a confidence score for each one. Tesseract, the engine behind most of this, has been in development for decades and handles over a hundred languages.

The consequence worth understanding is that the work happens on your device. A page takes a few seconds on a recent laptop and noticeably longer on a phone or an older machine. A two-hundred-page scan is a coffee break, not an instant. That is the price of the file staying put, and for most documents it is a price worth paying.

#### What it reads well

Clean printed text, scanned straight, at 300 dots per inch or better, comes back close to perfect. Typewritten pages do well. Sans-serif print does slightly better than ornate serif faces. Tables come back as text in roughly the right reading order, though column positions are less exact than a real text layer would give you.

Accuracy falls off with photographs taken at an angle, pages with heavy show-through from the other side, faint carbon copies, text over a stamp or a watermark, and anything at low resolution. If a scan looks marginal to you, it will look marginal to the engine. Rescanning at a higher resolution beats every other intervention.

Handwriting is the hard limit. Engines of this type are trained on printed characters and produce something between poor and comic on cursive. If the thing you need is handwritten, type it out yourself; you will spend less time than you would correcting.

#### What it will not do

Reading a scan and making a scan searchable are different results, and tools blur the line constantly. Local OCR gives you the text: you can copy it, search it, export it, paste it into a spreadsheet. It does not necessarily write that text back into the PDF as an invisible layer behind the picture, which is what "searchable PDF" means and what a document management system indexes.

If your requirement is that the file itself becomes searchable in place, check whether the tool writes a text layer back. If your requirement is that you can read, quote and process the contents, extracted text is all you needed.

#### Checking the result

Never treat OCR output as data without reading it. Proofread numbers specifically, because digit confusions are the errors most likely to survive a skim and most likely to matter: 5 and S, 1 and l, 0 and O, 8 and B. A reference number, an account number or an amount is worth checking character by character.

Confidence scores help but do not substitute for reading. An engine is often confident about a wrong reading of a clean glyph. Use the score to decide which pages to check hardest, not which pages to skip.

#### Practical notes

Run recognition only on the pages that need it. A document with a text layer already contains the exact characters, and OCR over the top of that replaces something certain with something estimated. Any tool that recognises a whole file without checking first is discarding accuracy it already had.

Keep the scan. Recognition is reproducible, so if an export comes back poor you can rescan or retry with different settings, but only if you still have the picture.

[actuallyfreepdfeditor.com/extract](https://actuallyfreepdfeditor.com/extract) reports which pages carry a text layer and which are pictures, then runs recognition in your browser on only the pages that need it. Nothing is uploaded and there is no page limit, because the work is done by your machine rather than by a server somebody has to pay for.
