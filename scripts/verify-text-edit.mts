/**
 * Checks that "edit text" genuinely removes the original glyphs on export.
 *
 *     npm run verify:text-edit
 *
 * The browser-made case needs Playwright, which is not an app dependency (see
 * verify-editor-e2e.mjs); without it that case is skipped, not failed.
 *
 * Builds PDFs the way three kinds of producer write them (pdf-lib's standard
 * fonts with no /Widths, a browser's Type0/Identity-H subset, and a TJ array
 * with kerning), removes one word from the middle of a line, and reads the
 * result back with pdf.js: the word must be gone, and every glyph after it on
 * the line must still be within 0.05 pt of where it was.
 */
import { Encodings, Font } from "@pdf-lib/standard-fonts";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { removeTextInRegions } from "../lib/text-edit/remove-text";

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

let failures = 0;
const check = (label: string, condition: boolean, detail = "") => {
    if (!condition) failures++;
    console.log(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

/**
 * Unkerned advance of `text`, which is what a PDF viewer actually lays out.
 * (pdf-lib's own `widthOfTextAtSize` adds AFM kerning that `drawText` never
 * applies, so it is the wrong yardstick here.)
 */
function advance(font: "Helvetica" | "Times-Roman", text: string, size: number): number {
    const afm = Font.load(font);
    return [...text].reduce((sum, ch) => sum + (afm.getWidthOfGlyph(Encodings.WinAnsi.encodeUnicodeCodePoint(ch.codePointAt(0)!).name) as number), 0) * size / 1000;
}

interface Glyphs {
    text: string;
    items: Array<{ str: string; x: number; y: number }>;
}

async function readBack(bytes: Uint8Array): Promise<Glyphs> {
    const doc = await pdfjs.getDocument({ data: bytes.slice(0), useSystemFonts: false, disableFontFace: true }).promise;
    const page = await doc.getPage(1);
    const content = await page.getTextContent({ disableNormalization: true } as never);
    const items = content.items
        .filter((item): item is typeof item & { str: string; transform: number[] } => "str" in item && item.str.trim() !== "")
        .map((item) => ({ str: item.str, x: item.transform[4], y: item.transform[5] }));
    return { text: items.map((i) => i.str).join("|"), items };
}

/** Positions of each word by splitting items on spaces is unreliable; compare per-item start x instead. */
interface Built {
    bytes: Uint8Array;
    region: { x0: number; y0: number; x1: number; y1: number };
    gone: string;
    kept: string[];
    /** Where the first surviving item after the removed word must start, worked out independently. */
    expect?: { startsWith: string; x: number; spaceWidth: number };
}

async function scenario(name: string, build: () => Promise<Built>) {
    const { bytes, region, gone, kept, expect } = await build();
    const before = await readBack(bytes);

    const doc = await PDFDocument.load(bytes);
    const [result] = removeTextInRegions(doc.getPage(0), [region]);
    const out = await doc.save();
    const after = await readBack(out);

    check(`${name}: glyphs removed`, result.removed > 0, `removed ${result.removed}, uncertain ${result.uncertain}`);
    check(`${name}: region not uncertain`, !result.uncertain);
    check(`${name}: "${gone}" is gone`, !after.text.includes(gone), after.text);
    for (const word of kept) check(`${name}: "${word}" survives`, after.text.includes(word), after.text);

    // Every item that survives whole must start where it started before.
    for (const item of after.items) {
        const match = before.items.find((b) => b.str === item.str);
        if (!match) continue;
        const drift = Math.hypot(match.x - item.x, match.y - item.y);
        check(`${name}: "${item.str.slice(0, 24)}" did not move`, drift < 0.05, `drift ${drift.toFixed(4)}`);
    }
    if (expect) {
        const item = after.items.find((i) => i.str.trimStart().startsWith(expect.startsWith));
        // pdf.js may start the item on the space before the word.
        const wordX = item ? item.x + (item.str.startsWith(" ") ? expect.spaceWidth : 0) : NaN;
        const drift = item ? Math.abs(wordX - expect.x) : Infinity;
        check(`${name}: text after the removed word kept its position`, drift < 0.05, `expected x ${expect.x.toFixed(3)}, got ${wordX.toFixed(3)} for "${item?.str}"`);
    }
    return out;
}

// 1. pdf-lib standard font: Type1 with no /Widths, so the AFM path is used.
await scenario("standard-14", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const FONT = "Helvetica";
    page.drawText("Total due: 1,250.00 USD by Friday", { x: 72, y: 700, size: 14, font, color: rgb(0, 0, 0) });
    page.drawText("Line below stays", { x: 72, y: 680, size: 14, font });
    const start = 72 + advance(FONT, "Total due: ", 14);
    const end = start + advance(FONT, "1,250.00", 14);
    return {
        bytes: await doc.save(),
        region: { x0: start - 0.5, y0: 700 - 3, x1: end + 0.5, y1: 700 + 11 },
        gone: "1,250.00",
        kept: ["Total due:", "USD by Friday", "Line below stays"],
        expect: { startsWith: "USD", x: 72 + advance(FONT, "Total due: 1,250.00 ", 14), spaceWidth: advance(FONT, " ", 14) },
    };
});

// 2. Hand-written content stream: TJ with kerning, Tc/Tw, ' and " operators, and a q/cm.
await scenario("hand-written TJ", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.TimesRoman);
    const FONT = "Times-Roman";
    page.drawText(" ", { x: 0, y: 0, size: 1, font }); // registers the font as F1-ish
    const fontName = [...page.node.normalizedEntries().Font.keys()][0].decodeText();
    const stream = doc.context.flateStream(
        `q 1 0 0 1 10 20 cm BT /${fontName} 12 Tf 0.5 Tc 1.5 Tw 14 TL 62 680 Td [(Pay) -250 (Alice) 120 ( Smith) -300 (now)] TJ ` +
            `(second line) ' 2 0.1 (third line here) " ET Q`,
    );
    page.node.addContentStream(doc.context.register(stream));
    // "Alice" sits at roughly x 72+ (Pay width + 3) … find it via pdf.js instead of guessing.
    const tmp = await doc.save();
    const probe = await readBack(tmp);
    const alice = probe.items.find((i) => i.str.includes("Alice"))!;
    const startX = alice.str.startsWith("Alice") ? alice.x : alice.x + advance(FONT, alice.str.split("Alice")[0], 12);
    const aliceEnd = startX + advance(FONT, "Alice", 12) + 0.5 * 5;
    return {
        bytes: tmp,
        region: { x0: startX - 0.3, y0: 700 - 3, x1: aliceEnd - 0.5, y1: 700 + 9 },
        gone: "Alice",
        kept: ["Pay", "Smith", "now", "second line", "third line here"],
        // Pay, then -250, then Alice (5 glyphs, Tc 0.5 each), then +120, then " Smith"
        // (the space takes Tw too). The +10 is the cm translation.
        expect: {
            startsWith: "Smith",
            x: 10 + 62 + advance(FONT, "Pay", 12) + 3 * 0.5 + 250 / 1000 * 12 + advance(FONT, "Alice", 12) + 5 * 0.5 - 120 / 1000 * 12 + advance(FONT, " ", 12) + 0.5 + 1.5,
            spaceWidth: advance(FONT, " ", 12) + 0.5 + 1.5,
        },
    };
});

// 3. A browser-made PDF: Type0 / Identity-H with a /W array.
try {
    const { chromium } = await import("playwright");
    await scenario("chromium Type0", async () => {
        const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
        const page = await browser.newPage();
        await page.setContent(`<p style="font: 16px 'DejaVu Sans', sans-serif; margin: 72px">Contract value: <span id=v>$98,400</span> payable quarterly.</p>`);
        const box = await page.locator("#v").boundingBox();
        const pdf = await page.pdf({ width: "8.5in", height: "11in", printBackground: true });
        await browser.close();
        // CSS px → pt is 0.75; PDF y is from the bottom.
        const k = 0.75;
        return {
            bytes: new Uint8Array(pdf),
            region: { x0: box!.x * k, x1: (box!.x + box!.width) * k, y0: 792 - (box!.y + box!.height) * k, y1: 792 - box!.y * k },
            gone: "98,400",
            kept: ["Contract value:", "payable quarterly."],
        };
    });
} catch (error) {
    console.log(`SKIP  chromium Type0 (${(error as Error).message.split("\n")[0]})`);
}

if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
}
console.log("\nAll text-removal checks passed.");
