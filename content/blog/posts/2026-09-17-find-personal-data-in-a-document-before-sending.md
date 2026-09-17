---
title: "Find the Personal Data Before You Send It"
dek: "The disclosure that causes trouble is almost never the one on page one. A pass for email addresses, card numbers and national IDs takes a minute and catches most of it."
date: "2026-09-17"
tags: ["privacy", "redaction", "compliance"]
taskIntent: redaction
signalOrigin: backlog
generated: false
runId: "manual-2026-W38"
---

Nobody sends a forty-page bundle having read all forty pages that morning. The name and address on the cover get checked; the account number in a payment confirmation on page thirty-one does not. That is the shape of almost every accidental disclosure — not carelessness about the obvious thing, but a document longer than anyone's attention.

A pattern search fixes most of it in about a minute, and it is worth knowing exactly how much it fixes.

#### What patterns catch

Some personal data has a shape a machine can recognise reliably. Email addresses have a fixed form. Payment card numbers are thirteen to nineteen digits and satisfy a checksum, which is what separates a real card number from an order reference of the same length. IBANs carry a country code and a length that varies by country. US Social Security numbers, UK National Insurance numbers and UK postcodes all have defined formats. IP addresses and dates of birth are recognisable within limits.

These are worth searching for first because the search is exact and the cost is nothing. Run it across the whole document, not the pages you think matter, because the pages you think matter are the ones you already checked.

#### What patterns miss

A name is not a pattern. Neither is a job title, a medical condition, a salary, a home address written the way people actually write addresses, or the sentence that identifies somebody by describing them. No rule-based search finds those, and any tool implying otherwise is selling you a feeling.

There is a second category that is worse: the number that has a pattern but the wrong one. A ten-digit customer reference looks like nothing in particular and identifies a person perfectly. An internal case number, a policy number, a booking reference — all invisible to a pattern search and all directly identifying in the system they came from.

So treat the pattern pass as the first of two passes, never as the whole job. It clears the mechanical work so your reading attention goes to the things only reading finds.

#### The false positive problem

A search tuned to find everything also finds a great deal that is nothing. An invoice number that happens to pass the card checksum. A version string that reads as an IP address. A date in a footer read as a date of birth.

This is why a tool should never redact automatically. Every match needs to be shown to you in place, with the surrounding text, so you can see that this sixteen-digit number is a card and that one is a shipping reference. A silent auto-redaction either removes something you needed or, far worse, gives you confidence that everything sensitive has gone.

#### Redacting properly

Once you know what to remove, remove it rather than covering it. A black rectangle drawn over text leaves the text in the file, where it can be selected, copied or recovered by anything that reads the content stream. That has embarrassed government departments and law firms repeatedly, and it will keep happening because the result looks identical on screen.

Real removal means the text is no longer in the file. The usual mechanism is to rebuild the affected pages as images, so the characters are gone and only pixels remain. That makes the file larger and those pages no longer selectable, which is a real cost and the right trade when the file is leaving your control. Check the result afterwards by searching the output for what you removed.

#### Practical notes

Check the metadata as well as the pages. Author name, the software that produced the file, the original filename and in some cases revision history all travel with a PDF and none of it appears on the page. A document that says nothing incriminating can still name the person who drafted it at half past eleven at night.

When you are sending a batch, do the pass on every file rather than the first one. Documents from the same source are usually laid out the same way, which means they hide the same field in the same place, on every one of them.

[actuallyfreepdfeditor.com/extract](https://actuallyfreepdfeditor.com/extract) reads a document in your browser, highlights every match for those patterns in place, and leaves all of them alone until you tick the ones that are real. What you tick is removed rather than covered, and the result is re-read afterwards to confirm the text is gone.
