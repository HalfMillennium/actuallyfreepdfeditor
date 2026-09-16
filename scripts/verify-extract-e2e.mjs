/**
 * End-to-end check of the extraction workspace, driven through a real browser.
 *
 * The important claim this product makes is that redaction *removes* text
 * rather than covering it. That claim cannot be checked by reading the code —
 * it has to be checked by re-parsing the file the user actually receives. So
 * this script does the whole round trip: build a PDF containing known secrets,
 * drive the real UI, catch the download, and re-read it with pdf.js to prove
 * the strings are gone and that untouched pages kept their real text.
 *
 * Playwright is not a dependency of the app, so install it on demand:
 *
 *     npm install --no-save playwright
 *     npm run build && npm run start -- -p 3100
 *     BASE_URL=http://localhost:3100 node scripts/verify-extract-e2e.mjs
 *
 * Exits non-zero if any check fails or the page logs an error.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? mkdtempSync(join(tmpdir(), "afpe-extract-"));
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (label, condition, detail = "") => {
    if (!condition) failures++;
    console.log(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

/* -------------------------------------------------------------------------- */

/** Invented, but Luhn-valid — an invalid number would never be flagged. */
const SECRETS = {
    email: "dana.okafor@example.com",
    ssn: "482-16-9073",
    card: "4539578763621486",
    iban: "GB29NWBK60161331926819",
};

const TABLE = [
    ["Invoice", "Client", "Net", "VAT"],
    ["INV-2031", "Harbour Ltd", "1420.00", "284.00"],
    ["INV-2032", "Calder Group", "980.50", "196.10"],
    ["INV-2033", "Penn & Rowe", "2310.75", "462.15"],
];

/** Text that lives on an untouched page, to prove those pages are not flattened. */
const SURVIVOR = "Clause 14 governs the termination notice period.";

async function buildSamplePdf(path) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    // Page 1 — the sensitive one.
    const one = doc.addPage([612, 792]);
    one.drawText("Client record", { x: 60, y: 720, size: 22, font: bold, color: rgb(0.35, 0.15, 0.03) });
    const lines = [
        `Email: ${SECRETS.email}`,
        `SSN: ${SECRETS.ssn}`,
        `Card: ${SECRETS.card}`,
        `IBAN: ${SECRETS.iban}`,
        "Reference: HR-2031 (not personal data)",
    ];
    lines.forEach((line, index) => one.drawText(line, { x: 60, y: 660 - index * 28, size: 12, font, color: rgb(0.15, 0.15, 0.15) }));

    // Page 2 — a table, laid out on a grid with real gutters between columns.
    const two = doc.addPage([612, 792]);
    two.drawText("Schedule A", { x: 60, y: 720, size: 22, font: bold, color: rgb(0.35, 0.15, 0.03) });
    const columnX = [60, 190, 360, 460];
    TABLE.forEach((row, rowIndex) => {
        row.forEach((cell, columnIndex) => {
            two.drawText(cell, {
                x: columnX[columnIndex],
                y: 660 - rowIndex * 30,
                size: 12,
                font: rowIndex === 0 ? bold : font,
                color: rgb(0.15, 0.15, 0.15),
            });
        });
    });

    // Page 3 — ordinary text, never touched.
    const three = doc.addPage([612, 792]);
    three.drawText("Terms", { x: 60, y: 720, size: 22, font: bold, color: rgb(0.35, 0.15, 0.03) });
    three.drawText(SURVIVOR, { x: 60, y: 660, size: 12, font, color: rgb(0.15, 0.15, 0.15) });

    writeFileSync(path, await doc.save());
}

async function textOf(bytes) {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
    let out = "";
    for (let i = 1; i <= doc.numPages; i++) {
        const content = await (await doc.getPage(i)).getTextContent();
        out += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n";
    }
    return out.replace(/\s+/g, " ");
}

/* -------------------------------------------------------------------------- */

const samplePath = join(OUT, "record.pdf");
await buildSamplePdf(samplePath);

const errors = [];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();

// Vercel Analytics only exists on Vercel; its script 404s under `next start`
// and takes the console error with it. Nothing else is excused.
const EXPECTED_OFF_PLATFORM = /_vercel\/insights/;

page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (message.location()?.url && EXPECTED_OFF_PLATFORM.test(message.location().url)) return;
    if (/Failed to load resource/.test(message.text()) && EXPECTED_OFF_PLATFORM.test(message.location()?.url ?? "")) return;
    errors.push(`console: ${message.text()} @ ${message.location()?.url ?? "?"}`);
});
// Named rather than left to the generic console message, which only says "404".
page.on("response", (response) => {
    if (response.status() === 404 && !EXPECTED_OFF_PLATFORM.test(response.url())) errors.push(`404: ${response.url()}`);
});

await page.goto(`${BASE_URL}/extract`, { waitUntil: "networkidle" });
check("the workspace landing renders", (await page.title()).toLowerCase().includes("extract"));

await page.setInputFiles('input[type="file"][accept*="pdf"]', samplePath);
await page.waitForSelector("[data-extract-page]", { timeout: 20000 });
await page.waitForTimeout(2000);

check("all three pages render", (await page.locator("[data-extract-page]").count()) === 3);

/* --- the text-layer survey ------------------------------------------------ */
const banner = await page.locator("[data-text-banner]").innerText();
check("the text layer is recognised, so OCR is not offered", banner.includes("already carries its own text layer"), banner);

/* --- PII discovery -------------------------------------------------------- */
const panel = page.locator("aside").last();
const panelText = await panel.innerText();
for (const kind of ["Email address", "US Social Security number", "Payment card number", "IBAN"]) {
    check(`${kind} is found`, panelText.includes(kind));
}
check("nothing is selected by default", (await panel.locator('input[type="checkbox"]:checked').count()) === 0);
check(
    "the redact button is inert until something is ticked",
    await panel.getByRole("button", { name: /Redact/ }).isDisabled(),
);

/* --- region selection and CSV export -------------------------------------- */
const tablePage = page.locator("[data-extract-page]").nth(1);
await tablePage.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
const box = await tablePage.boundingBox();

// The table sits between y=630 and y=675 in PDF user space on a 792pt page;
// drag a generous box around it in screen space.
const scale = box.height / 792;
await page.mouse.move(box.x + 40 * scale, box.y + 90 * scale);
await page.mouse.down();
await page.mouse.move(box.x + 560 * scale, box.y + 250 * scale, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(400);

check("a drag creates a selection", (await page.getByText(/selections? — exports will cover/).count()) > 0);

await panel.getByRole("button", { name: "CSV" }).click();
const [csvDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    panel.getByRole("button", { name: /Download \.csv/ }).click(),
]);
const csvPath = join(OUT, "table.csv");
await csvDownload.saveAs(csvPath);
const csv = readFileSync(csvPath, "utf8");

check("the CSV export is named after the file", csvDownload.suggestedFilename() === "record.csv", csvDownload.suggestedFilename());
check("the table's header row survives as CSV columns", /Invoice.*Client.*Net.*VAT/.test(csv.split("\n")[0] ?? ""), (csv.split("\n")[0] ?? "").slice(0, 80));
check("a data row is split into four columns", (csv.split("\n")[1] ?? "").split(",").length === 4, (csv.split("\n")[1] ?? "").slice(0, 80));

/* --- redaction ------------------------------------------------------------ */
// Tick every kind found, then redact. The drawn selection is left out so the
// table page stays untouched and can be checked for survival too.
for (const kind of ["email", "ssn", "card", "iban"]) await panel.locator(`[data-pii-kind="${kind}"] input`).check();
await page.waitForTimeout(300);

check("ticking a kind arms the redact button", !(await panel.getByRole("button", { name: /Redact/ }).isDisabled()));

const [pdfDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    panel.getByRole("button", { name: /Redact/ }).click(),
]);
const redactedPath = join(OUT, "record-redacted.pdf");
await pdfDownload.saveAs(redactedPath);

check("the redacted file is named clearly", pdfDownload.suggestedFilename() === "record-redacted.pdf", pdfDownload.suggestedFilename());

const redactedText = await textOf(readFileSync(redactedPath));
for (const [label, secret] of Object.entries(SECRETS)) {
    check(`the ${label} is gone from the file, not covered up`, !redactedText.includes(secret));
}
check("the untouched page keeps real, selectable text", redactedText.includes(SURVIVOR));
check("the untouched table page is not flattened", redactedText.includes("Harbour Ltd"));

const confirmation = await panel.innerText();
check("the UI confirms removal only after verifying it", /removed and verified gone/.test(confirmation), confirmation.split("\n").find((l) => /verified|still readable/.test(l)) ?? "");

/* --- batch ---------------------------------------------------------------- */
await page.setInputFiles('input[type="file"][accept*="pdf"]', samplePath);
await page.waitForTimeout(2500);
check("a second file joins the batch", (await page.locator("aside").first().locator("li").count()) === 2);

/* -------------------------------------------------------------------------- */

await browser.close();

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}  Artefacts in ${OUT}`);
process.exit(failures === 0 ? 0 : 1);
