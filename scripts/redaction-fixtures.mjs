/**
 * Builds the redaction-checker fixtures.
 *
 *     node scripts/redaction-fixtures.mjs <out-dir>
 *
 * Each fixture is one way a redaction goes wrong (or right). They are generated
 * rather than committed so it is obvious what each one contains, and so the
 * set can grow without binary blobs in the repo. `verify-redaction-check.mjs`
 * imports `buildFixtures` directly.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

import { PDFDocument, PDFName, StandardFonts, TextRenderingMode, degrees, rgb, setTextRenderingMode } from "pdf-lib";

const SECRET = "Jane Q. Doe";
const ACCOUNT = "GB29NWBK60161331926819";

/* -------------------------------------------------------------------------- */
/* A tiny PNG encoder, so fixtures need no image dependency.                  */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
}
/** `pixel(x, y)` returns [r, g, b]. */
function png(width, height, pixel) {
    const raw = Buffer.alloc((width * 3 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 3 + 1)] = 0;
        for (let x = 0; x < width; x++) {
            const [r, g, b] = pixel(x, y);
            const i = y * (width * 3 + 1) + 1 + x * 3;
            raw[i] = r;
            raw[i + 1] = g;
            raw[i + 2] = b;
        }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8; // bit depth
    header[9] = 2; // RGB
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/* -------------------------------------------------------------------------- */

async function base({ title = "Statement of account" } = {}) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.addPage([612, 792]);
    page.drawText(title, { x: 72, y: 720, size: 20, font: bold });
    page.drawText("This letter confirms the details below.", { x: 72, y: 690, size: 12, font });
    return { doc, page, font };
}

/** "Account holder: <secret>" at y 660, returning where the secret sits. */
function secretLine(page, font, secret = SECRET) {
    const label = "Account holder: ";
    page.drawText(label + secret, { x: 72, y: 660, size: 12, font });
    const x = 72 + font.widthOfTextAtSize(label, 12);
    return { x: x - 1, y: 656, width: font.widthOfTextAtSize(secret, 12) + 2, height: 16 };
}

function addAnnotation(doc, page, dict) {
    const ref = doc.context.register(doc.context.obj(dict));
    const annots = page.node.lookup(PDFName.of("Annots"));
    if (annots) annots.push(ref);
    else page.node.set(PDFName.of("Annots"), doc.context.obj([ref]));
}

/**
 * Appends a hand-written incremental update that replaces one content stream.
 * pdf-lib always rewrites whole files, so this is done at the byte level:
 * new object, xref section, trailer with /Prev, startxref, %%EOF.
 */
function incrementalUpdate(v1, { objectNumber, content, size, root }) {
    const text = Buffer.from(v1).toString("latin1");
    const prev = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(text)[1]);
    let tail = "\n";
    const objOffset = v1.length + Buffer.byteLength(tail, "latin1");
    tail += `${objectNumber} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`;
    const xrefOffset = v1.length + Buffer.byteLength(tail, "latin1");
    tail +=
        `xref\n0 1\n0000000000 65535 f \n${objectNumber} 1\n${String(objOffset).padStart(10, "0")} 00000 n \n` +
        `trailer\n<< /Size ${size} /Root ${root} /Prev ${prev} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return Buffer.concat([Buffer.from(v1), Buffer.from(tail, "latin1")]);
}

export async function buildFixtures(dir) {
    mkdirSync(dir, { recursive: true });
    const fixtures = [];
    const save = async (name, doc, expected) => {
        const path = join(dir, `${name}.pdf`);
        writeFileSync(path, await doc.save({ useObjectStreams: false }));
        fixtures.push({ name, path, ...expected });
    };

    /* 1. Black rectangle over live text. */
    {
        const { doc, page, font } = await base();
        const box = secretLine(page, font);
        page.drawRectangle({ ...box, color: rgb(0, 0, 0) });
        await save("1-black-box-over-text", doc, { verdict: "fail", check: "covered-text", secret: SECRET });
    }

    /* 2. White rectangle over live text. */
    {
        const { doc, page, font } = await base();
        const box = secretLine(page, font);
        page.drawRectangle({ ...box, color: rgb(1, 1, 1) });
        await save("2-white-box-over-text", doc, { verdict: "fail", check: "covered-text", secret: SECRET });
    }

    /* 3. Done properly: text removed, box drawn. */
    {
        const { doc, page, font } = await base();
        const label = "Account holder: ";
        page.drawText(label, { x: 72, y: 660, size: 12, font });
        page.drawRectangle({ x: 72 + font.widthOfTextAtSize(label, 12), y: 656, width: 70, height: 16, color: rgb(0, 0, 0) });
        await save("3-removed-then-boxed", doc, { verdict: "pass" });
    }

    /* 4. A filled Square annotation over text. */
    {
        const { doc, page, font } = await base();
        const b = secretLine(page, font);
        addAnnotation(doc, page, { Type: "Annot", Subtype: "Square", Rect: [b.x, b.y, b.x + b.width, b.y + b.height], C: [0, 0, 0], IC: [0, 0, 0], F: 4 });
        await save("4-square-annotation-cover", doc, { verdict: "fail", check: "annotation-cover", secret: SECRET });
    }

    /* 5. A Redact annotation marked but never applied. */
    {
        const { doc, page, font } = await base();
        const b = secretLine(page, font);
        addAnnotation(doc, page, { Type: "Annot", Subtype: "Redact", Rect: [b.x, b.y, b.x + b.width, b.y + b.height], IC: [0, 0, 0], F: 4 });
        await save("5-unapplied-redact-annotation", doc, { verdict: "fail", check: "unapplied-redaction", secret: SECRET });
    }

    /* 6. Nothing hidden, but the properties name the author. */
    {
        const { doc } = await base();
        doc.setAuthor("Priya Raman");
        doc.setTitle("Raman v Northwind - draft 3");
        await save("6-metadata", doc, { verdict: "pass", warn: "metadata" });
    }

    /* 7. Two revisions: the name is in v1, "removed" by an incremental save. */
    {
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([612, 792]);
        page.drawText("Statement of account", { x: 72, y: 720, size: 20, font });
        page.drawText(`Account holder: ${SECRET}`, { x: 72, y: 660, size: 12, font });
        const v1 = await doc.save({ useObjectStreams: false });

        const reloaded = await PDFDocument.load(v1);
        const p = reloaded.getPage(0);
        const contents = p.node.Contents();
        const refs = contents.asArray ? contents.asArray() : [contents];
        // pdf-lib writes every drawText on a page into one stream: the last.
        const target = refs[refs.length - 1];
        const fontName = [...p.node.Resources().lookup(PDFName.of("Font")).keys()][0].decodeText();
        const root = reloaded.context.trailerInfo.Root;

        const bytes = incrementalUpdate(v1, {
            objectNumber: target.objectNumber,
            content: `BT /${fontName} 20 Tf 72 720 Td (Statement of account) Tj ET BT /${fontName} 12 Tf 72 660 Td (Account holder: [removed]) Tj ET`,
            size: reloaded.context.largestObjectNumber + 1,
            root: `${root.objectNumber} ${root.generationNumber} R`,
        });
        const path = join(dir, "7-earlier-revision.pdf");
        writeFileSync(path, bytes);
        fixtures.push({ name: "7-earlier-revision", path, verdict: "fail", check: "old-revision", secret: SECRET });
    }

    /* 8. A scan with a black box painted into the image, and an OCR layer under it. */
    {
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([612, 792]);
        // 2 px per point. "Ink" stripes where the OCR lines sit, and a solid
        // black box where the name was blacked out before scanning.
        const W = 1224;
        const H = 1584;
        const inkRow = (py) => (py >= 1584 - 2 * 734 && py <= 1584 - 2 * 720) || (py >= 1584 - 2 * 674 && py <= 1584 - 2 * 660);
        const image = await doc.embedPng(
            png(W, H, (x, y) => {
                const pt = { x: x / 2, y: 792 - y / 2 };
                if (pt.x >= 170 && pt.x <= 250 && pt.y >= 656 && pt.y <= 674) return [0, 0, 0];
                if (inkRow(y) && x > 144 && x < 1000 && (x >> 2) % 3 !== 0) return [40, 40, 40];
                return [250, 248, 244];
            }),
        );
        page.drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
        page.pushOperators(setTextRenderingMode(TextRenderingMode.Invisible));
        page.drawText("Scanned letter from the council", { x: 72, y: 722, size: 14, font });
        page.drawText("Account holder:", { x: 72, y: 662, size: 12, font });
        page.drawText(SECRET, { x: 172, y: 662, size: 12, font });
        page.pushOperators(setTextRenderingMode(TextRenderingMode.Fill));
        await save("8-scan-with-hidden-ocr", doc, { verdict: "fail", check: "hidden-ocr", secret: SECRET });
    }

    /* 9. Unredacted, but full of dark photos and dark slides: must not false-positive. */
    {
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);

        const photo = await doc.embedPng(
            png(400, 260, (x, y) => {
                // A dark, low-contrast "night" photo with a flat sky band.
                if (y < 70) return [12, 14, 22];
                const n = (Math.sin(x / 7) + Math.cos(y / 5) + Math.sin((x + y) / 11)) * 10;
                return [30 + n, 34 + n, 40 + n].map((v) => Math.max(0, Math.min(255, Math.round(v))));
            }),
        );

        const p1 = doc.addPage([612, 792]);
        p1.drawText("Quarterly review", { x: 72, y: 720, size: 22, font: bold });
        p1.drawImage(photo, { x: 72, y: 380, width: 468, height: 304 });
        p1.drawText("Caption over the photo, in white", { x: 90, y: 400, size: 14, font, color: rgb(1, 1, 1) });
        p1.drawText("Body text on paper below the picture.", { x: 72, y: 340, size: 12, font });

        const slide = doc.addPage([792, 612]);
        slide.drawRectangle({ x: 0, y: 0, width: 792, height: 612, color: rgb(0.07, 0.08, 0.12) });
        slide.drawText("Results", { x: 60, y: 520, size: 40, font: bold, color: rgb(1, 1, 1) });
        slide.drawText("Revenue up 12% on last quarter", { x: 60, y: 460, size: 20, font, color: rgb(0.85, 0.85, 0.9) });
        slide.drawText("Small print in grey on the dark background", { x: 60, y: 60, size: 9, font, color: rgb(0.6, 0.6, 0.65) });

        await save("9-dark-photos-and-slides", doc, { verdict: "pass" });
    }

    /* 10. Sideways text (a /Rotate 90 page and a vertical label): must not false-positive. */
    {
        const { doc, page, font } = await base({ title: "Scanned in landscape" });
        page.drawText("A label running up the margin", { x: 40, y: 200, size: 10, font, rotate: degrees(90) });
        page.setRotation(degrees(90));
        await save("10-sideways-text", doc, { verdict: "pass" });
    }

    return fixtures;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const dir = process.argv[2] ?? "redaction-fixtures";
    const fixtures = await buildFixtures(dir);
    for (const f of fixtures) console.log(`${f.name}  →  expect ${f.verdict}${f.check ? ` (${f.check})` : ""}`);
    void ACCOUNT;
}
