import type { FaqEntry } from "@/lib/seo";

/**
 * Page copy for /redact and /check-redaction that is shared between the
 * visible page and its structured data.
 *
 * Claims here stay inside the guardrails in `lib/blog/capabilities.ts`: text is
 * removed, not covered; output is re-read; pattern search finds fixed-format
 * data only; nothing is decided for the user; no legal-compliance promises.
 * Redacted pages are flattened to images, so nothing here may claim the rest of
 * a redacted page stays searchable.
 */

export const REDACT_TITLE = "Redact a PDF Free, No Upload — Text Removed, Then Checked";
export const REDACT_DESCRIPTION =
    "Black out names, account numbers and addresses in a PDF. The text is removed, not just covered, and we re-read the file to prove it. Nothing is uploaded.";

export const REDACT_DEFINITION =
    "A black box over text isn't a redaction. The words are still in the file, and selecting and copying the box brings them back. Real redaction deletes the text from the page's content, then paints the box. The two look identical. Only one is safe to send.";

export const REDACT_FAQ: FaqEntry[] = [
    {
        question: "Can someone undo my redaction?",
        answer: "If the text was actually removed, no, because there's nothing left to recover. If it was only covered, yes, in seconds. Not sure which you've got? Run it through the redaction checker at /check-redaction.",
    },
    {
        question: "Does it find names automatically?",
        answer: "No. The pattern search finds things with a fixed shape: email addresses, phone numbers, card numbers, IBANs, US Social Security numbers, UK National Insurance numbers, UK postcodes, IP addresses and dates of birth. Names, addresses written in a sentence, salaries and anything that depends on context need your eyes. Search first, then read the document.",
    },
    {
        question: "Is my file uploaded?",
        answer: "No. It's opened, edited and saved by your browser. There's no server to upload it to.",
    },
    {
        question: "What happens to the pages I redact?",
        answer: "Each page with a redaction on it is rebuilt as an image with the boxes painted in, so the text on that page is gone, not hidden. The trade-off is that the rest of that page can't be selected or searched any more, and the file gets bigger. Pages you don't touch keep their real text.",
    },
    {
        question: "Is this OK for court filings?",
        answer: "If you need a formal record of what was removed, use a tool built for legal disclosure. This is for everything else: bank statements, contracts, forms you're sending to a landlord.",
    },
];

export const CHECK_TITLE = "Check if a PDF Redaction Worked — Free, Nothing Uploaded";
export const CHECK_DESCRIPTION =
    "Drop in a redacted PDF and find out if the hidden text can still be copied out. Checks for covered text, old revisions and metadata. Runs in your browser.";

export const CHECK_LIMIT =
    "A pass means we couldn't pull out any hidden text. It doesn't mean the visible parts are fine. If a name is still showing in paragraph three, we can't know you meant to hide it. Give it a read.";

export const CHECK_LIST = [
    "Text sitting under a black or white box",
    "Redaction marks that were never applied",
    "Boxes added as comments, which readers can hide",
    "Older versions of the file saved inside the new one",
    "Author name, original filename and other metadata",
    "Attachments, form fields and bookmarks",
];

export const CHECK_FAQ: FaqEntry[] = [
    {
        question: "How do I test a redaction myself?",
        answer: "Open the PDF, select across the black box, copy, and paste into a text editor. If words show up, it leaked. The checker does this for every page and also catches the places copy-paste misses: old revisions, metadata, attachments.",
    },
    {
        question: "Can a redacted PDF be unredacted?",
        answer: "Only if it was covered instead of removed. That's the most common mistake, and it's the first thing we check.",
    },
    {
        question: "Why check a file you didn't make?",
        answer: "Because you're often the one receiving it. Lawyers, landlords and HR departments send out badly redacted files all the time.",
    },
    {
        question: "Is my file uploaded?",
        answer: "No. The file is read by your browser, in this tab. Nothing is sent anywhere.",
    },
];
