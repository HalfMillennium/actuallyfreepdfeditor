/**
 * Verifies the redaction checker against the fixtures in redaction-fixtures.mjs,
 * in a real browser, and closes the loop with the redaction tool.
 *
 * For every fixture: the checker's verdict (and the check that fired) must be
 * the expected one, and recovered text must be masked by default. For every
 * fixture that fails: "Fix it" must carry the file to /redact with the
 * recovered text listed for review, redacting it there must produce a file,
 * and that file — sent back through "second opinion" — must pass. A fixture
 * that still fails after our own redaction is a bug in the redaction tool.
 *
 * Throughout, every network request is recorded: none may carry a body, and
 * none may leave the site's own origin. The document never leaves the tab.
 *
 * Playwright is not an app dependency:
 *
 *     npm install --no-save playwright
 *     npm run build && npm run start -- -p 3100
 *     BASE_URL=http://localhost:3100 npm run verify:redaction-check
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";

import { buildFixtures } from "./redaction-fixtures.mjs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? mkdtempSync(join(tmpdir(), "afpe-redaction-check-"));

let failures = 0;
const check = (label, condition, detail = "") => {
    if (!condition) failures++;
    console.log(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

const fixtures = await buildFixtures(join(OUT, "fixtures"));

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const origin = new URL(BASE_URL).origin;
const leaks = [];
const errors = [];
page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    // Vercel Analytics only exists on Vercel; under `next start` its script
    // 404s. It is a GET with no body either way.
    const body = request.postDataBuffer();
    if (body && body.length > 0) leaks.push(`${request.method()} ${url} carried ${body.length} bytes`);
    if (new URL(url).origin !== origin) leaks.push(`request to another origin: ${url}`);
});
page.on("pageerror", (error) => errors.push(error.message));

/** Runs the checker on a file already chosen, or chooses `path`. Returns the verdict and the checks that fired. */
async function readResult() {
    await page.waitForSelector('[data-checker-state="done"]', { timeout: 60_000 });
    const result = page.locator('[data-checker-state="done"]');
    return {
        verdict: await result.getAttribute("data-verdict"),
        checks: await page.$$eval("[data-check]", (els) => els.map((el) => el.getAttribute("data-check"))),
        visibleText: await result.innerText(),
    };
}

async function checkFile(path) {
    await page.goto(`${BASE_URL}/check-redaction`, { waitUntil: "networkidle" });
    await page.setInputFiles('input[aria-label="Choose a PDF to check"]', path);
    return readResult();
}

for (const fixture of fixtures) {
    const result = await checkFile(fixture.path);
    check(`${fixture.name}: verdict is ${fixture.verdict}`, result.verdict === fixture.verdict, `got ${result.verdict}; checks ${[...new Set(result.checks)].join(", ") || "none"}`);
    if (fixture.check) check(`${fixture.name}: caught by ${fixture.check}`, result.checks.includes(fixture.check), [...new Set(result.checks)].join(", "));
    if (fixture.warn) check(`${fixture.name}: warns about ${fixture.warn}`, result.checks.includes(fixture.warn), [...new Set(result.checks)].join(", "));
    if (fixture.secret) check(`${fixture.name}: recovered text is masked by default`, !result.visibleText.includes(fixture.secret));

    if (fixture.verdict !== "fail") continue;

    // Show reveals it.
    await page.getByRole("button", { name: "Show this text" }).first().click();
    const shown = await page.locator('[data-checker-state="done"]').innerText();
    check(`${fixture.name}: Show reveals the recovered text`, shown.includes(fixture.secret), fixture.secret);

    // Fix it → /redact with the findings prefilled, never pre-ticked.
    await page.getByRole("button", { name: "Fix it in the redaction tool" }).click();
    await page.waitForURL(/\/redact$/);
    await page.waitForSelector("[data-from-checker]", { timeout: 30_000 });
    const checkerGroup = page.locator('[data-pii-kind="checker"] input[type="checkbox"]');
    const prefilled = await checkerGroup.count();
    if (fixture.check !== "old-revision") {
        check(`${fixture.name}: the redaction tool lists the checker's findings`, prefilled === 1);
        check(`${fixture.name}: …unticked until the user ticks them`, prefilled === 1 && !(await checkerGroup.isChecked()));
        if (prefilled) await checkerGroup.check();
    }

    const button = page.getByRole("button", { name: /Redact \d+ and download|Download a clean copy/ });
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), button.click()]);
    const redactedPath = join(OUT, `${fixture.name}-redacted.pdf`);
    await download.saveAs(redactedPath);
    check(`${fixture.name}: the redaction tool produced a file`, readFileSync(redactedPath).length > 500);

    // Second opinion: the tool's own output goes straight back to the checker.
    await page.getByRole("button", { name: /second opinion/ }).click();
    await page.waitForURL(/\/check-redaction$/);
    const after = await readResult();
    check(
        `${fixture.name}: passes the checker after our redaction`,
        after.verdict === "pass",
        `got ${after.verdict}; checks ${[...new Set(after.checks)].join(", ") || "none"}`,
    );
    check(`${fixture.name}: our output carries no metadata`, !after.checks.includes("metadata"));
}

/* Metadata removal on its own. */
{
    const fixture = fixtures.find((f) => f.warn === "metadata");
    await checkFile(fixture.path);
    const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 30_000 }),
        page.getByRole("button", { name: "Remove metadata and download" }).click(),
    ]);
    const stripped = join(OUT, "metadata-stripped.pdf");
    await download.saveAs(stripped);
    const after = await checkFile(stripped);
    check("remove metadata: the stripped copy has no metadata left", !after.checks.includes("metadata"), [...new Set(after.checks)].join(", ") || "none");
    check("remove metadata: and still passes", after.verdict === "pass");
}

/* A file that isn't a PDF gets a message, not a crash. */
{
    await page.goto(`${BASE_URL}/check-redaction`, { waitUntil: "networkidle" });
    await page.setInputFiles('input[aria-label="Choose a PDF to check"]', { name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 this is not really a pdf") });
    const alert = await page.waitForSelector('[data-checker-state="error"] [role="alert"]', { timeout: 30_000 });
    check("an unreadable file gets a clear message", /couldn't read this file/i.test(await alert.innerText()), await alert.innerText());
}

check("no request carried document bytes or left the site", leaks.length === 0, leaks.slice(0, 3).join("; "));
check("no page errors", errors.length === 0, errors.slice(0, 3).join("; "));

await browser.close();
console.log(`\n${failures === 0 ? "All redaction-check checks passed." : `${failures} failure(s).`}  Artifacts in ${OUT}`);
process.exit(failures === 0 ? 0 : 1);
