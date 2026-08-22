/**
 * pdf.js needs its worker served as a static asset. Rather than committing a
 * ~1 MB generated file, copy it out of node_modules into public/ before dev and
 * build. Keeping the version in the filename means a stale copy can never be
 * picked up after a dependency bump.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgPath = require.resolve("pdfjs-dist/package.json");
const { version } = require("pdfjs-dist/package.json");

const source = join(dirname(pkgPath), "build", "pdf.worker.min.mjs");
const publicDir = join(process.cwd(), "public");
const target = join(publicDir, `pdf.worker.${version}.min.mjs`);

mkdirSync(publicDir, { recursive: true });

for (const entry of readdirSync(publicDir)) {
    if (/^pdf\.worker\..*\.min\.mjs$/.test(entry) && entry !== `pdf.worker.${version}.min.mjs`) {
        rmSync(join(publicDir, entry));
    }
}

copyFileSync(source, target);
console.log(`pdf.js worker ${version} -> public/pdf.worker.${version}.min.mjs`);
