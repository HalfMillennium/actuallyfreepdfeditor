/**
 * End-to-end check of the editor, driven through a real browser.
 *
 * Builds a sample PDF (including a page with /Rotate 90, so the rotation
 * handling is genuinely exercised), opens it, uses every tool, checks undo and
 * redo, exercises the page operations, downloads the result, and confirms the
 * session survives a reload and is gone after "close document".
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
        page.drawText(title, { x: 60, y: 720, size: 24, font: bold, color: rgb(0.35, 0.15, 0.03) });
        page.drawLine({ start: { x: 60, y: 706 }, end: { x: 552, y: 706 }, thickness: 2, color: rgb(0.95, 0.29, 0.24) });
        for (let line = 0; line < 22; line++) {
            page.drawText(`${line + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.`, {
                x: 60,
                y: 660 - line * 24,
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

page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => message.type() === "error" && errors.push(`console: ${message.text()}`));

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
await tool("Text").click();
let box = await firstPageBox();
await page.mouse.click(box.x + 120, box.y + 200);
await page.waitForTimeout(500);
check("a new text box opens ready to type", (await page.evaluate(() => document.activeElement?.tagName)) === "TEXTAREA");
await page.keyboard.type("APPROVED 22 Aug");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check("text is kept", (await editCount()) === 1, `${await editCount()} edits`);

await tool("Text").click();
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

await browser.close();

if (errors.length) {
    failures += errors.length;
    console.log("\nPage errors:\n" + errors.join("\n"));
}

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} failure(s).`}  Artifacts in ${OUT}`);
process.exit(failures === 0 ? 0 : 1);
