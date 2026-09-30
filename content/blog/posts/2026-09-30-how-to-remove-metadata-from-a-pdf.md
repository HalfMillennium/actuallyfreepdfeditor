---
title: "How to Remove Metadata From a PDF"
dek: "A PDF can carry your name, the software you used, the file's original name and its edit history, none of it visible on the page. Here's where to see it and how to get rid of it."
date: "2026-09-30"
tags: ["privacy", "metadata", "redaction"]
taskIntent: redaction
signalOrigin: backlog
generated: false
runId: "manual-2026-W40"
---

To remove metadata from a PDF, save a fresh copy of its pages without the document properties that came with them, then open the copy and check the properties are empty. Clearing the fields one by one in a viewer is the slower route, and it often misses the XMP copy of the same information and any earlier versions saved inside the file.

#### What's in there

Every PDF has room for a small set of document properties: title, author, subject, keywords, the program that created it and the program that produced the PDF. Word fills in the author from your account name. Scanners and print drivers add their own names. A title field often holds whatever the document was first called, which is how a file named statement.pdf ends up with "Smith divorce — draft 4" in its properties.

Many files also carry XMP metadata, a second copy of the same details in a different format, sometimes with more: the original filename, editing software and a history of saves. And a file that was edited and saved more than once can hold its earlier versions too. More on that below.

None of it shows on the page. All of it goes wherever the file goes.

#### Where to see it

In Adobe Acrobat Reader, open the file and choose Menu, then Document properties (in the older layout, File, then Properties, or press Ctrl+D). The Description tab lists title, author, subject and keywords, and the producing software. Additional Metadata shows the XMP details.

In Preview on a Mac, choose Tools, then Show Inspector, and look at the general and keywords tabs. Preview shows less than Acrobat, so an empty-looking inspector isn't proof the file is clean.

Firefox's built-in PDF viewer has Document Properties in its menu, which shows the same basic fields.

#### How to strip it

You can edit the fields in Acrobat's properties dialog and delete what's there. That clears the visible fields, but it's easy to leave the XMP copy behind, and saving in place can keep the old values in the file as an earlier version.

The thorough way is a clean copy: copy the pages into a brand new PDF and carry nothing else across. The new file has empty properties, no XMP, no attachments, no bookmarks and no history, because none of that was ever written into it. Then open the copy and look at its properties again to confirm.

Printing to PDF gets you most of the way too, since the print driver builds a new file. It stamps its own producer name on, and it can flatten form fields and links, so check what came out.

#### The part people miss

When you edit a PDF and save it, many programs don't rewrite the file. They add the changes to the end and leave the original bytes where they were. That's called an incremental save, and it means the version before your edit is still in the file.

So if you deleted a name, or cleared the author field, and saved in place, the old name may still be sitting in an earlier revision. A normal viewer shows you only the latest one. Anyone who looks at the raw file, or runs it through a tool that reads earlier revisions, can see the rest.

A clean copy fixes this, because it writes a new file from scratch rather than adding to the old one.

#### Practical notes

Remove metadata last. If you redact, fill in or sign a file after stripping it, the software you use may add its own details back.

Keep the original with its properties intact for your records. There's nothing wrong with metadata in your own copy. The point is what leaves your hands.

Check the result rather than trusting the button. Open the cleaned file's properties, and if you can, look at the XMP section and whether the file holds earlier versions.

[actuallyfreepdfeditor.com/check-redaction](https://actuallyfreepdfeditor.com/check-redaction) lists a PDF's properties, XMP fields, attachments and bookmarks, and looks for earlier versions saved inside it. If there's metadata, it can save a clean copy of the pages without it and check that copy before you download it. The file is read in your browser and isn't uploaded.
