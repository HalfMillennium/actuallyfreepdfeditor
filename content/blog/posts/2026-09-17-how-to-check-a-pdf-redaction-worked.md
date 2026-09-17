---
title: "How to Check a Redaction Actually Worked"
dek: "Every serious redaction failure looked correct on screen. Four checks take two minutes and would have caught all of them."
date: "2026-09-17"
tags: ["redaction", "privacy", "verification"]
taskIntent: redaction
signalOrigin: backlog
generated: false
runId: "manual-2026-W38"
---

The redaction failures that make the news share one property: the file looked right. Black boxes in the correct places, sent in good faith, and the covered text extractable by anyone who selected it or opened the file in a text editor. Nobody in any of those stories was careless about the redaction. They were careless about verifying it, which is a separate task and the only one that produces evidence.

Do these four checks on the file you are about to send, not on the file in the editor.

#### Select the page

Open the finished document in a normal viewer. Drag across the black box as though you were selecting text to copy. If anything highlights, the text is still there. Paste it somewhere to see what it says.

This catches the most common failure by a wide margin: an annotation or a filled rectangle drawn on top of text that was never removed. It takes five seconds and it is the check almost nobody does.

#### Search for the words

Selection can miss text that a viewer draws but does not offer for selection, so search as well. Use the viewer's find function and type the exact string you removed — the surname, the account number, the address. A hit anywhere in the document, including on a page you did not touch, means the file is not ready.

Search the whole document rather than the redacted page. Sensitive strings repeat: a name blacked out on page four is often in a header on page nine and in the bookmarks panel.

#### Read the properties

Open the document properties and read every field. Title, author, subject, keywords, producer, and the original filename if your viewer shows it. A PDF exported from a word processor routinely carries the author's full name, and a file called claim-smith-rejected-draft2.pdf discloses plenty before anyone opens it.

Some files also carry XMP metadata and, occasionally, earlier revisions of the document held as incremental updates. If the document matters, a tool that dumps the raw file structure will tell you what is in there; if you do not have one, exporting to a fresh PDF discards most of it.

#### Check the file got bigger

This one is a heuristic rather than proof, but it is informative. Genuine removal usually means the affected pages were rebuilt as images, and images are larger than text. If a redacted file is the same size as the original, or smaller, the pages were probably not rebuilt and something was probably only covered.

The reverse is also worth noting: a file that grew by several megabytes on a two-page redaction is behaving the way real removal behaves.

#### Practical notes

Redaction is irreversible when it works, which means you keep the original somewhere and you send the copy. Name them so the mistake of sending the wrong one is hard to make: the redacted file should be obvious at a glance in a list of attachments.

A flattened page loses selectable text, so a document you have redacted properly is worse to work with afterwards. That is expected. If you need both, keep the working copy for yourself and treat the redacted version as an outbound artefact, not as your file.

If the document is heading into a legal proceeding or a statutory disclosure, the standard is not "I am fairly sure". Use a tool built for it, keep a record of what you removed, and do the four checks above on the exact bytes you are handing over.

[actuallyfreepdfeditor.com/extract](https://actuallyfreepdfeditor.com/extract) does the second check on its own output: after removing what you ticked, it re-reads the file it just built and tells you whether any of those strings survived, so the first thing you see is whether it worked rather than whether it looks like it worked.
