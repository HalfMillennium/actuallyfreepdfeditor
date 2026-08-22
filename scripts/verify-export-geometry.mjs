/**
 * Round-trip check for the display-space -> user-space matrices in
 * lib/export-pdf.ts.
 *
 * Places a text annotation at a known position in *display* space on pages with
 * every /Rotate value, exports, then reads the result back with pdf.js and asks
 * where the glyphs actually ended up in display space. The two should agree.
 */
import { PDFDocument, degrees, StandardFonts } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

// --- inline copies of the pieces under test (the app files are TS) ----------
function displayToUserSpace(rotation, pw, ph) {
    switch (rotation) {
        case 90: return [0, 1, -1, 0, pw, 0];
        case 180: return [-1, 0, 0, -1, pw, ph];
        case 270: return [0, -1, 1, 0, 0, ph];
        default: return [1, 0, 0, 1, 0, 0];
    }
}
const LINE_HEIGHT_RATIO = 1.25;
const HELV = { ascent: 0.718, descent: 0.207 };
function baselineOffset(fontSize) {
    const halfLeading = (LINE_HEIGHT_RATIO - (HELV.ascent + HELV.descent)) / 2;
    return (halfLeading + HELV.ascent) * fontSize;
}

const { concatTransformationMatrix, pushGraphicsState, popGraphicsState, rgb } = await import("pdf-lib");

const PW = 612, PH = 792;
const ROTATIONS = [0, 90, 180, 270];
// Annotation box in display space (origin top-left of the page as displayed).
const ANN = { x: 100, y: 50, width: 240, height: 30, fontSize: 20 };

// 1. Build a source document, one page per rotation.
const src = await PDFDocument.create();
for (const r of ROTATIONS) {
    const p = src.addPage([PW, PH]);
    p.setRotation(degrees(r));
}
const srcBytes = await src.save();

// 2. Export it the way the app does.
const source = await PDFDocument.load(srcBytes);
const out = await PDFDocument.create();
const font = await out.embedFont(StandardFonts.Helvetica);
const copied = await out.copyPages(source, ROTATIONS.map((_, i) => i));

for (const [i, rotation] of ROTATIONS.entries()) {
    const page = out.addPage(copied[i]);
    page.setRotation(degrees(rotation));
    const dh = rotation === 90 || rotation === 270 ? PW : PH;

    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...displayToUserSpace(rotation, PW, PH)));
    page.drawText("Xg", {
        x: ANN.x,
        y: dh - ANN.y - baselineOffset(ANN.fontSize),
        size: ANN.fontSize,
        font,
        color: rgb(0, 0, 0),
    });
    page.pushOperators(popGraphicsState());
}
const outBytes = await out.save();

// 3. Read it back and ask pdf.js where the text is, in display space.
const doc = await pdfjs.getDocument({ data: outBytes, useSystemFonts: false }).promise;
let failures = 0;
const expectedBaselineY = ANN.y + baselineOffset(ANN.fontSize);

for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    // Default viewport honours the page's /Rotate, so its coordinate system IS
    // our display space (top-left origin, y down).
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const item = content.items[0];

    // item.transform is [a b c d e f] in PDF space; compose with the viewport.
    const [a, b, c, d, e, f] = item.transform;
    const [va, vb, vc, vd, ve, vf] = viewport.transform;
    const x = va * e + vc * f + ve;
    const y = vb * e + vd * f + vf;

    const dw = ROTATIONS[i] === 90 || ROTATIONS[i] === 270 ? PH : PW;
    const dh = ROTATIONS[i] === 90 || ROTATIONS[i] === 270 ? PW : PH;

    const dx = Math.abs(x - ANN.x);
    const dy = Math.abs(y - expectedBaselineY);
    const ok = dx < 0.5 && dy < 0.5;
    if (!ok) failures++;

    console.log(
        `/Rotate ${String(ROTATIONS[i]).padStart(3)}  display ${dw}x${dh}  ` +
        `baseline at (${x.toFixed(2)}, ${y.toFixed(2)})  ` +
        `expected (${ANN.x.toFixed(2)}, ${expectedBaselineY.toFixed(2)})  ` +
        `${ok ? "OK" : "MISMATCH"}`
    );
    console.log(`            viewport ${viewport.width}x${viewport.height}, glyph matrix scale ${a.toFixed(2)},${b.toFixed(2)},${c.toFixed(2)},${d.toFixed(2)}`);
}

console.log(failures === 0 ? "\nAll rotations round-trip correctly." : `\n${failures} rotation(s) WRONG`);
process.exit(failures === 0 ? 0 : 1);
