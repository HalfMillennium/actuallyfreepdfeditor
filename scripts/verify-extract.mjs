/**
 * Checks the pure parts of the extraction engine: reading order, table
 * clustering, the serialisers, and the PII detectors.
 *
 * No browser and no network — these are the functions whose correctness does
 * not depend on a canvas. Redaction is verified separately, in a real browser,
 * by scripts/verify-redaction.mjs, because flattening needs one.
 */
import { spawnSync } from "node:child_process";

const script = `
import { inReadingOrder, toPlainText } from "./lib/extract/text-layer";
import { parseTable, toCsv, toJsonRecords, toMarkdownTable, itemsInRect } from "./lib/extract/tables";
import { findPii } from "./lib/extract/pii";

let failures = 0;
const check = (label, ok, detail = "") => { if (!ok) failures++; console.log(\`\${ok ? "PASS" : "FAIL"}  \${label}\${detail ? "  (" + detail + ")" : ""}\`); };
const item = (text, x, y, w = text.length * 5, h = 10) => ({ text, x, y, width: w, height: h, fontSize: h });

console.log("--- reading order ---");
// Content-stream order is not reading order; emit deliberately scrambled.
const scrambled = [item("world", 60, 10), item("second", 10, 30), item("Hello", 10, 10), item("line", 70, 30)];
check("sorts into rows then left-to-right", inReadingOrder(scrambled).map((i) => i.text).join(" ") === "Hello world second line",
  inReadingOrder(scrambled).map((i) => i.text).join(" "));
check("inserts spaces at real gaps, not inside words", toPlainText([item("Invoice", 10, 10, 35), item("total", 50, 10, 25)]) === "Invoice total",
  JSON.stringify(toPlainText([item("Invoice", 10, 10, 35), item("total", 50, 10, 25)])));
check("breaks lines on vertical change", toPlainText(scrambled) === "Hello world\\nsecond line", JSON.stringify(toPlainText(scrambled)));

console.log("\\n--- table clustering ---");
// Three columns, third right-aligned like a real numeric column.
const table = [
  item("Item", 10, 10, 30), item("Qty", 120, 10, 20), item("Price", 230, 10, 30),
  item("Widget", 10, 30, 40), item("2", 120, 30, 8), item("14.00", 225, 30, 35),
  item("Gasket", 10, 50, 40), item("11", 120, 50, 14), item("103.50", 218, 50, 42),
];
const parsed = parseTable(table, 300);
check("finds three columns", parsed.columnCount === 3, "got " + parsed.columnCount);
check("keeps rows intact", parsed.rows.length === 3, "got " + parsed.rows.length);
check("right-aligned numeric column stays in its column", parsed.rows[2][2] === "103.50", JSON.stringify(parsed.rows[2]));
check("not flagged ragged", parsed.ragged === false);
check("csv escapes commas", toCsv([["a,b", "c"]]) === '"a,b",c', toCsv([["a,b", "c"]]));
check("csv escapes quotes", toCsv([['say "hi"']]) === '"say ""hi"""', toCsv([['say "hi"']]));
const records = toJsonRecords(parsed.rows);
check("json uses the header row as keys", records.length === 2 && records[0].Item === "Widget" && records[0].Price === "14.00", JSON.stringify(records[0]));
check("markdown emits a separator row", toMarkdownTable(parsed.rows).split("\\n")[1].startsWith("| --- |"));

console.log("\\n--- region selection ---");
check("selects by centre point", itemsInRect(table, { x: 100, y: 0, width: 60, height: 100 }).map((i) => i.text).join(",") === "Qty,2,11",
  itemsInRect(table, { x: 100, y: 0, width: 60, height: 100 }).map((i) => i.text).join(","));

console.log("\\n--- pii detection ---");
const page = (items) => [{ pageIndex: 0, width: 600, height: 800, items, nativeCharCount: 200, source: "text-layer" }];
const found = (items) => findPii(page(items));

// The important case: PDFs split an address across items, so per-item matching misses it.
const splitEmail = found([item("Contact ", 10, 10, 40), item("alice@", 52, 10, 30), item("example.com", 84, 10, 55)]);
check("matches an email split across text items", splitEmail.some((m) => m.kind === "email" && m.text === "alice@example.com"),
  JSON.stringify(splitEmail.map((m) => m.kind + ":" + m.text)));

check("finds an SSN", found([item("SSN 123-45-6789", 10, 10)]).some((m) => m.kind === "ssn"));
check("finds a Luhn-valid card", found([item("4111 1111 1111 1111", 10, 10)]).some((m) => m.kind === "card"));
check("rejects a Luhn-invalid 16-digit run", !found([item("4111 1111 1111 1112", 10, 10)]).some((m) => m.kind === "card"),
  JSON.stringify(found([item("4111 1111 1111 1112", 10, 10)]).map((m) => m.kind)));
check("rejects an out-of-range IP", !found([item("999.1.1.1", 10, 10)]).some((m) => m.kind === "ip"));
check("nothing is selected by default", found([item("a@b.com 123-45-6789", 10, 10)]).every((m) => m.selected === false));

console.log(failures ? \`\\n\${failures} failure(s)\` : "\\nExtraction engine checks passed.");
process.exit(failures ? 1 : 0);
`;
process.exit(spawnSync("npx", ["--yes", "tsx", "--eval", script], { stdio: "inherit" }).status ?? 1);
