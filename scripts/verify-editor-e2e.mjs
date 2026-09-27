/**
 * End-to-end check of the editor, driven through a real browser.
 *
 * Builds a sample PDF (including a page with /Rotate 90, so the rotation
 * handling is genuinely exercised), opens it, uses every tool, checks undo and
 * redo, exercises the page operations, edits the PDF's own text directly and
 * through find & replace, downloads the result and reads it back to confirm
 * the replaced wording is really gone, and confirms the session survives a
 * reload and is gone after "close document".
 *
 * Playwright is not a dependency of the app, so install it on demand:
 *
 *     npm install --no-save playwright && npx playwright install chromium
 *     npm run build && npm run start -- -p 3100
 *     BASE_URL=http://localhost:3100 node scripts/verify-editor-e2e.mjs
 *
 * Exits non-zero if any check fails or the page logs an error.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? mkdtempSync(join(tmpdir(), "afpe-e2e-"));
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (label, condition, detail = "") => {
    if (!condition) failures++;
    console.log(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

/* -------------------------------------------------------------------------- */

async function buildSamplePdf(path) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const titles = ["Rental Agreement", "Schedule A — Fees", "Sideways Scan", "Signature Page"];
    for (const [index, title] of titles.entries()) {
        const page = doc.addPage([612, 792]);
        // The sideways page is drawn upside-down in its own user space, the
        // way a scanner that fed the sheet in backwards writes it. /Rotate 90
        // shows it sideways; one more quarter turn from the user makes it read
        // upright at a total of 180°, which is what exercises edit-text and
        // find & replace in a rotated frame.
        const flip = index === 2;
        const at = (x, y) => (flip ? { x: 612 - x, y: 792 - y, rotate: degrees(180) } : { x, y });
        page.drawText(title, { ...at(60, 720), size: 24, font: bold, color: rgb(0.35, 0.15, 0.03) });
        page.drawLine({ start: { x: 60, y: flip ? 86 : 706 }, end: { x: 552, y: flip ? 86 : 706 }, thickness: 2, color: rgb(0.95, 0.29, 0.24) });
        for (let line = 0; line < 22; line++) {
            page.drawText(`${line + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.`, {
                ...at(60, 660 - line * 24),
                size: 11,
                font,
                color: rgb(0.2, 0.2, 0.2),
            });
        }
        // One page arrives sideways, the way a scan often does.
        if (index === 2) page.setRotation(degrees(90));
    }

    writeFileSync(path, await doc.save());
}

/* -------------------------------------------------------------------------- */

const samplePath = join(OUT, "sample.pdf");
await buildSamplePdf(samplePath);

const errors = [];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();

// Vercel Analytics only exists on Vercel; its script 404s under `next start`.
// Excused by name so a real 404 still fails the run.
const EXPECTED_OFF_PLATFORM = /_vercel\/insights/;

page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (EXPECTED_OFF_PLATFORM.test(message.location()?.url ?? "")) return;
    errors.push(`console: ${message.text()} @ ${message.location()?.url ?? "?"}`);
});

const editCount = async () => Number(/(\d+)\s+edits?/.exec(await page.locator("header p.text-xs").first().innerText())?.[1] ?? -1);

/** Bring page 1 back into view and re-measure it; gestures need current coordinates. */
const firstPageBox = async () => {
    await page.evaluate(() => document.querySelector("[data-page-id]")?.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(400);
    return page.locator("[data-page-id]").first().locator("div.absolute.inset-0").last().boundingBox();
};

const tool = (name) => page.getByRole("button", { name, exact: true });

await page.goto(BASE_URL, { waitUntil: "networkidle" });
check("landing renders", (await page.title()).includes("actuallyfreepdfeditor"));

await page.setInputFiles('input[type="file"][accept*="pdf"]', samplePath);
await page.waitForSelector("[data-page-id]", { timeout: 20000 });
await page.waitForTimeout(2500);
check("all four pages render", (await page.locator("[data-page-id]").count()) === 4);

const canvases = await page.$$eval("[data-page-id] canvas", (els) => els.map((c) => `${c.width}x${c.height}`));
check("the /Rotate 90 page renders landscape", canvases[2] === "792x612", canvases.slice(0, 4).join(" "));

/* --- text ---------------------------------------------------------------- */
await tool("Add text").click();
let box = await firstPageBox();
await page.mouse.click(box.x + 120, box.y + 200);
await page.waitForTimeout(500);
check("a new text box opens ready to type", (await page.evaluate(() => document.activeElement?.tagName)) === "TEXTAREA");
await page.keyboard.type("APPROVED 22 Aug");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check("text is kept", (await editCount()) === 1, `${await editCount()} edits`);

await tool("Add text").click();
box = await firstPageBox();
await page.mouse.click(box.x + 300, box.y + 120);
await page.waitForTimeout(400);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
check("an abandoned empty text box is discarded", (await editCount()) === 1, `${await editCount()} edits`);

/* --- highlight, white-out, drawing --------------------------------------- */
const dragOut = async (label, toolName, y0, y1, expected) => {
    await tool(toolName).click();
    const b = await firstPageBox();
    await page.mouse.move(b.x + 60, b.y + y0);
    await page.mouse.down();
    await page.mouse.move(b.x + 400, b.y + y1, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    check(label, (await editCount()) === expected, `${await editCount()} edits`);
};

await dragOut("highlight is created by dragging", "Highlight", 300, 322, 2);
await dragOut("white-out is created by dragging", "White-out", 355, 375, 3);

await tool("Draw").click();
box = await firstPageBox();
await page.mouse.move(box.x + 80, box.y + 460);
await page.mouse.down();
for (let i = 0; i < 26; i++) await page.mouse.move(box.x + 80 + i * 9, box.y + 460 + Math.sin(i / 2.5) * 20);
await page.mouse.up();
await page.waitForTimeout(400);
check("freehand drawing is created", (await editCount()) === 4, `${await editCount()} edits`);

/* --- signature ----------------------------------------------------------- */
await firstPageBox();
await tool("Sign").click();
await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
await page.getByRole("tab", { name: "Type" }).click();
await page.getByLabel("Your name").fill("Jamie Rivera");
await page.getByRole("button", { name: "Use signature" }).click();
await page.waitForTimeout(1500);
check("signature is placed", (await editCount()) === 5, `${await editCount()} edits`);

/* --- dragging, undo, redo ------------------------------------------------ */
const signature = page.locator('[data-page-id] [role="button"][aria-label="Signature"]').first();
const before = await signature.boundingBox();
await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
await page.mouse.down();
await page.mouse.move(before.x + before.width / 2 - 120, before.y + before.height / 2 + 60, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(400);
const after = await signature.boundingBox();
check("an annotation can be dragged", Math.abs(after.x - before.x) > 80, `moved ${Math.round(after.x - before.x)}px`);

await page.keyboard.press("Control+z");
await page.waitForTimeout(400);
check("undo restores the position", Math.abs((await signature.boundingBox()).x - before.x) < 3);
await page.keyboard.press("Control+Shift+z");
await page.waitForTimeout(400);
check("redo re-applies the move", Math.abs((await signature.boundingBox()).x - after.x) < 3);

/* --- page operations ----------------------------------------------------- */
const thumbnail = (index) => page.locator("aside li").nth(index);

await thumbnail(2).hover();
await thumbnail(2).getByRole("button", { name: "Rotate" }).click();
await page.waitForTimeout(1000);
const rotated = await page.$$eval("[data-page-id] canvas", (els) => els.map((c) => `${c.width}x${c.height}`));
check("rotating the sideways page turns it portrait", rotated[2] === "612x792", rotated[2]);

await thumbnail(0).hover();
await thumbnail(0).getByRole("button", { name: "Duplicate" }).click();
await page.waitForTimeout(800);
check("duplicating adds a page", (await page.locator("aside li").count()) === 5);
await page.keyboard.press("Control+z");
await page.waitForTimeout(600);
check("undo removes the duplicate", (await page.locator("aside li").count()) === 4);

/* --- editing the document's own text -------------------------------------- */
await tool("Edit text").click();
await firstPageBox();
const line3 = page.locator('[data-page-id]').first().getByRole("button", { name: /^Edit text: 3\. Lorem ipsum/ });
check("the edit-text tool offers the page's own lines", (await line3.count()) === 1);
await line3.click();
await page.waitForTimeout(700);
const opened = await page.evaluate(() => (document.activeElement instanceof HTMLTextAreaElement ? document.activeElement.value : null));
check("clicking a line opens it for editing, pre-filled", opened?.startsWith("3. Lorem ipsum dolor sit amet"), String(opened));
await page.keyboard.press("Control+a");
await page.keyboard.type("3. Rent is due on the first of each month.");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check("the edit is recorded", (await editCount()) === 6, `${await editCount()} edits`);

/* --- shapes ------------------------------------------------------------- */
await tool("Shapes").click();
await page.getByRole("button", { name: "Arrow", exact: true }).click();
box = await firstPageBox();
await page.mouse.move(box.x + 420, box.y + 560);
await page.mouse.down();
await page.mouse.move(box.x + 520, box.y + 500, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(400);
check("an arrow is drawn by dragging", (await editCount()) === 7, `${await editCount()} edits`);
check("the arrow is selectable as an annotation", (await page.locator('[role="button"][aria-label="Arrow"]').count()) === 1);

/* --- find & replace ----------------------------------------------------- */
// Runs after the sideways page was turned upright, so its text is horizontal
// on screen and must be found and replaced in the rotated frame.
await page.getByRole("button", { name: /Find & replace/ }).click();
await page.getByRole("textbox", { name: "Find", exact: true }).fill("consectetur");
await page.getByRole("textbox", { name: "Replace with" }).fill("CONSECTETUR");
await page.waitForFunction(() => /\d+ matches on 4 pages/.test(document.querySelector('[role="dialog"]')?.textContent ?? ""), null, { timeout: 15000 });
const summary = await page.locator('[role="dialog"]').innerText();
// 22 body lines on each of 4 pages, less the one line already edited above.
check("find reports every match across the document", /87 matches on 4 pages/.test(summary), summary.match(/\d+ matches[^\n]*/)?.[0]);
await page.getByRole("button", { name: "Replace all" }).click();
await page.waitForTimeout(1500);
check("replace all is a single batch of edits", (await editCount()) === 7 + 87, `${await editCount()} edits`);
await page.getByRole("button", { name: "Done" }).click();
await page.keyboard.press("Control+z");
await page.waitForTimeout(500);
check("one undo reverses every replacement", (await editCount()) === 7, `${await editCount()} edits`);
await page.keyboard.press("Control+Shift+z");
await page.waitForTimeout(500);

/* --- page numbers ------------------------------------------------------- */
await page.getByRole("button", { name: /Page numbers/ }).click();
await page.getByRole("button", { name: "Add numbers" }).click();
await page.waitForTimeout(500);
check("page numbers are stamped on every page", (await editCount()) === 7 + 87 + 4, `${await editCount()} edits`);

/* --- export -------------------------------------------------------------- */
const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.getByRole("button", { name: /Download/ }).click(),
]);
const exported = join(OUT, "exported.pdf");
await download.saveAs(exported);
check(
    "the download is a non-trivial PDF",
    download.suggestedFilename() === "sample-edited.pdf" && readFileSync(exported).length > 5000,
    `${readFileSync(exported).length} bytes`,
);

/* Read the file back: edited wording must be gone from the text layer, not hidden. */
{
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const exportedDoc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(exported)), useSystemFonts: false }).promise;
    const texts = [];
    for (let i = 1; i <= exportedDoc.numPages; i++) {
        const content = await (await exportedDoc.getPage(i)).getTextContent();
        texts.push(content.items.map((item) => item.str).join(" "));
    }
    const all = texts.join("\n");
    check("the replaced line's original text is gone from the file", !/(?<!\d)3\. Lorem ipsum/.test(texts[0]), texts[0].slice(0, 160));
    check("the new wording is in the file", texts[0].includes("Rent is due on the first of each month"));
    check("find & replace removed the old word everywhere, including the rotated page", !all.includes("consectetur"), `${(all.match(/consectetur/g) ?? []).length} left`);
    check("…and wrote the new one", (all.match(/CONSECTETUR/g) ?? []).length === 87, `${(all.match(/CONSECTETUR/g) ?? []).length} found`);
    check("untouched wording survives", (all.match(/adipiscing elit/g) ?? []).length === 87, `${(all.match(/adipiscing elit/g) ?? []).length} found`);
    check("page numbers are in the file", texts.every((text, i) => text.includes(`Page ${i + 1} of 4`)));
}

/* --- session persistence ------------------------------------------------- */
const editsBefore = await editCount();
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("[data-page-id]", { timeout: 20000 });
await page.waitForTimeout(2500);
check("the session survives a reload", (await editCount()) === editsBefore, `${await editCount()} vs ${editsBefore}`);

await page.getByRole("button", { name: /Close document/ }).click();
await page.waitForTimeout(800);
check("closing returns to the landing page", await page.getByRole("heading", { level: 1 }).isVisible());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
check("a closed session does not come back", (await page.locator("[data-page-id]").count()) === 0);

/* --- phone-sized screen ---------------------------------------------------- */
{
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const mobile = await phone.newPage();
    mobile.on("pageerror", (error) => errors.push(`mobile pageerror: ${error.message}`));
    await mobile.goto(BASE_URL, { waitUntil: "networkidle" });
    await mobile.setInputFiles('input[type="file"][accept*="pdf"]', samplePath);
    await mobile.waitForSelector("[data-page-id]", { timeout: 20000 });
    await mobile.waitForTimeout(2000);

    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("phone: the editor does not scroll sideways", overflow <= 0, `${overflow}px wider`);
    for (const title of ["Edit text", "Shapes", "Find and replace", "Stamp page numbers"]) {
        const control = mobile.locator(`button[title^="${title}"]`);
        const b = await control.boundingBox();
        check(`phone: "${title}" is on screen`, Boolean(b) && b.x >= 0 && b.x + b.width <= 390, b ? `x ${Math.round(b.x)}` : "missing");
    }

    await mobile.locator('button[title^="Edit text"]').tap();
    await mobile.waitForTimeout(1200);
    await mobile.getByRole("button", { name: /^Edit text: 5\. Lorem/ }).first().tap();
    await mobile.waitForTimeout(800);
    check("phone: tapping a line opens it for editing", (await mobile.evaluate(() => document.activeElement?.tagName)) === "TEXTAREA");

    await mobile.keyboard.press("Escape");
    await mobile.locator('button[title^="Find and replace"]').tap();
    const dialog = await mobile.locator('[role="dialog"]').boundingBox();
    check("phone: dialogs fit the screen", dialog && dialog.x >= 0 && dialog.x + dialog.width <= 390, dialog ? `${Math.round(dialog.width)}px wide` : "missing");
    await phone.close();
}

await browser.close();

if (errors.length) {
    failures += errors.length;
    console.log("\nPage errors:\n" + errors.join("\n"));
}

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} failure(s).`}  Artifacts in ${OUT}`);
process.exit(failures === 0 ? 0 : 1);
