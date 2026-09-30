---
title: "Why Black Boxes Don't Redact a PDF"
dek: "You drew a black rectangle over the name. The name is still in the file, and anyone who selects the box can copy it back out. Here's why, and the ten-second test that tells you."
date: "2026-09-30"
tags: ["redaction", "privacy", "verification"]
taskIntent: troubleshooting
signalOrigin: backlog
generated: false
runId: "manual-2026-W40"
---

A black box drawn over text in a PDF hides it from your eyes and from nobody else. The words are still in the file. Select across the box, copy, paste into a text editor, and there they are. This is the single most common way a "redacted" document leaks, and it happens because the box and the redaction look exactly the same on screen.

#### What people usually do

The file needs a name or an account number hidden before it goes out. So you open it in whatever is to hand — Preview on a Mac, Word, the free editor that came up first in search — pick the rectangle tool, set the fill to black, and draw over the line. It looks done. You save and send.

Sometimes it is a highlighter set to black. Sometimes it is a black comment box, or a shape added in Word before exporting to PDF. The method changes. The result doesn't: a mark on top, and the text still underneath.

#### Why the text survives

A PDF page isn't a picture. It's a list of drawing instructions: put these letters here in this font, draw this line there, place this image at that spot. A viewer runs the list from top to bottom and paints the result.

Your black rectangle is one more instruction added to the end of that list. It paints over the letters, so on screen they vanish. But the instruction that draws the letters is still in the list, untouched, with the actual characters in it. Copy-paste reads that instruction. So does search, so does every text-extraction tool, and so does anyone who opens the file with software that skips the rectangle.

When the box is added as a comment rather than drawn into the page, it's worse. Most readers have a setting to hide comments, and some let you drag the box aside.

#### It happens to lawyers too

In January 2019, lawyers for Paul Manafort filed a court document with several passages blacked out. The black bars were only drawn on top. Reporters selected the text, copied it, and read what the redactions were meant to hide — including prosecutors' claim that Manafort had shared campaign polling data with a business associate. It was on the news within hours.

Nobody involved thought they'd done it wrong. The page looked redacted. That's the problem with covering: it gives you no sign that it failed.

#### What real redaction does

Real redaction deletes the text from the page's content first, and then paints the box. The drawing instruction with the characters in it is gone, so there's nothing for copy-paste, search or extraction tools to find. On screen, a covered page and a redacted page look the same. Only one of them is safe to send.

The honest way to be sure a tool removed rather than covered is to test what it gave you. Which is the next part.

#### The ten-second test

Open the finished file — the one you're about to send, not the one in your editor. Drag your cursor across the black box as if you were selecting text. If anything highlights, the text is still there. Copy it and paste it into a plain text editor to see what it says.

Then press Ctrl+F (Cmd+F on a Mac) and search for a word you meant to hide. A match anywhere in the document means it isn't redacted, whatever the page looks like.

This catches the rectangle mistake every time. It won't catch everything: older saved versions of the file, the author's name in the properties, or a hidden OCR text layer under a scanned page don't show up in a copy-paste test. For those you need a closer look.

#### Practical notes

Keep the original. Redaction that works can't be undone, so the unredacted copy is yours and the redacted one is what you send. Name them so they're hard to mix up.

Don't try to fix a covered file by drawing a thicker box. Start again from the original with a tool that removes text, or flatten the page to an image as a last resort — the text on a flattened page becomes pixels, which can't be copied, though the page can't be searched afterwards either.

If you already have a file that someone else redacted, test it before you trust it. That goes double if you're the one receiving it.

[actuallyfreepdfeditor.com/check-redaction](https://actuallyfreepdfeditor.com/check-redaction) runs the copy-paste test on every page of a PDF in your browser and also looks in the places it misses: earlier versions saved inside the file, comment boxes, unapplied redaction marks and metadata. If it finds text under a box, its redaction page will remove it properly, and nothing is uploaded at either step.
