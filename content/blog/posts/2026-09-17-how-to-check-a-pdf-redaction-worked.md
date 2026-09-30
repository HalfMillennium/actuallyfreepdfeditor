---
title: "How to Check If a PDF Is Properly Redacted"
dek: "Every serious redaction failure looked correct on screen. Two quick tests catch the common one; the rest hides in places you have to go looking for."
date: "2026-09-17"
tags: ["redaction", "privacy", "verification"]
taskIntent: redaction
signalOrigin: backlog
generated: false
runId: "manual-2026-W38"
---

To check a PDF is properly redacted, select across each black box and copy, then search the document for a word you meant to hide. If either turns anything up, the text is still in the file. Then look in the places those two tests can't see: earlier saved versions, the document's properties, attachments, form fields, and text hidden under scanned pages.

Do all of it on the file you're about to send, not the one in your editor.

#### The copy-paste test

Open the finished PDF in an ordinary viewer. Drag across the black box as though you were selecting text to copy. If anything highlights, the text is still there. Copy it and paste it into a plain text editor to see exactly what leaked.

This catches the most common failure by a wide margin: a rectangle or comment box drawn on top of text that was never removed. It takes five seconds, and almost nobody does it.

#### The search test

Some viewers draw text they won't let you select, so search as well. Press Ctrl+F (Cmd+F on a Mac) and type the exact thing you removed: the surname, the account number, the address. A hit anywhere means the file isn't ready, including on a page you never touched.

Search the whole document, not just the redacted page. Sensitive strings repeat. A name blacked out on page four is often in a header on page nine and in the bookmarks panel.

#### The hidden places

Copy-paste and search only see the current version of the page. A PDF can hold more than that.

Earlier versions come first. Many programs save changes by adding them to the end of the file and leaving the old version in place, so the page before your redaction can still be inside the file you send. A normal viewer won't show it.

Then the properties. Title, author, subject and keywords often name people, and the XMP metadata can carry the original filename and edit history.

Attachments, form fields and bookmarks come next. A filled-in form field can repeat a value you blacked out on the page, and a bookmark title can quote a heading you hid.

Last, scans. A scanned page that's been run through OCR carries an invisible text layer so it can be searched. If someone blacked out a name on the scan image, the OCR text underneath may still spell it out. The copy-paste test usually catches this one, but only if you try it on the scanned page.

#### The limit of checking

A checker can prove text is hidden but recoverable. It can't know what you meant to hide. If a name is still sitting in plain view in paragraph three, every test above passes, because nothing is hidden. Read the document once, start to finish, as the person receiving it.

#### Practical notes

Keep the original and send a copy, named so the difference is obvious in a list of attachments.

A properly redacted page is often rebuilt as an image, so it can't be selected or searched afterwards and the file gets bigger. That's expected. If a redacted file is exactly the same size as the original, be suspicious.

If the document is heading into a legal proceeding or a statutory disclosure, use a tool built for that, keep a record of what you removed, and still run these checks on the exact file you hand over.

[actuallyfreepdfeditor.com/check-redaction](https://actuallyfreepdfeditor.com/check-redaction) runs all of this on any PDF, redacted with any tool: text under boxes, unapplied redaction marks, comment boxes, earlier versions saved in the file, hidden OCR text, metadata, attachments, form fields and bookmarks. It works in your browser, shows what it recovered masked until you ask to see it, and can hand a leaking file to its redaction page to be fixed.
