/**
 * Copies the Tesseract worker and wasm core into public/ocr/.
 *
 * Self-hosted so the OCR code path does not depend on a third-party CDN being
 * up. The language model is still fetched remotely on first use — it is ~10 MB
 * and would bloat the repo — but that is a download, not an upload: the model
 * comes down, the document never goes anywhere.
 */
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const target = join(process.cwd(), "public", "ocr");
mkdirSync(target, { recursive: true });

const workerSrc = join(dirname(require.resolve("tesseract.js/package.json")), "dist", "worker.min.js");
const coreDir = dirname(require.resolve("tesseract.js-core/package.json"));

// lib/extract/ocr.ts pins OEM.LSTM_ONLY, and the engine's core selection only
// reaches the -lstm builds in that mode, so the legacy cores are dead weight.
// Shipping three variants instead of six halves what the deploy carries.
const coreFiles = [
    "tesseract-core-lstm.wasm",
    "tesseract-core-lstm.wasm.js",
    "tesseract-core-simd-lstm.wasm",
    "tesseract-core-simd-lstm.wasm.js",
    "tesseract-core-relaxedsimd-lstm.wasm",
    "tesseract-core-relaxedsimd-lstm.wasm.js",
];

copyFileSync(workerSrc, join(target, "worker.min.js"));

let copied = 1;
let missing = 0;
for (const file of coreFiles) {
    const from = join(coreDir, file);
    if (existsSync(from)) {
        copyFileSync(from, join(target, file));
        copied++;
    } else {
        missing++;
    }
}

console.log(`OCR assets -> public/ocr/ (${copied} files${missing ? `, ${missing} variant(s) not in this build` : ""})`);
