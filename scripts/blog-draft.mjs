/**
 * Run the author and reviewer on one brief, offline, and print the result.
 *
 * This is the step the spec insists on before anything is automated: hand it
 * ten briefs, read all ten outputs, and tune until you would publish seven
 * without edits. Automating a mediocre author only produces mediocre articles
 * faster.
 *
 *   ANTHROPIC_API_KEY=... npm run blog:draft -- --brief path/to/brief.json
 *   ANTHROPIC_API_KEY=... npm run blog:draft -- --sample
 *
 * Writes nothing and commits nothing.
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const briefFlag = args.indexOf("--brief");
const briefPath = briefFlag === -1 ? null : args[briefFlag + 1];
const useSample = args.includes("--sample");

if (!briefPath && !useSample) {
    console.error("Usage: npm run blog:draft -- --brief <file.json>   (or --sample)");
    process.exit(1);
}

const script = `
import { readFileSync } from "node:fs";
import { writeDraft } from "./lib/blog/agents/author";
import { reviewArticle } from "./lib/blog/agents/reviewer";
import { RunBudget } from "./lib/blog/agents/client";
import { precheckDraft, countWords } from "./lib/blog/precheck";
import { renderPost } from "./lib/blog/render";
import { gate } from "./lib/blog/gate";
import { BriefSchema } from "./lib/blog/schemas";
import index from "./content/blog/index.json";

const SAMPLE = {
  slug: "why-you-cannot-type-in-that-pdf-form",
  workingTitle: "Why You Can't Type in That PDF Form",
  targetQuery: "why can't i type in this pdf",
  taskIntent: "troubleshooting",
  signalOrigin: "backlog",
  signalEvidence: "evergreen backlog entry bl-005",
  whyNow: "evergreen",
  eighteenMonthTest: "The three reasons a PDF refuses typed input are properties of the format itself, not of any product release, so nothing here dates.",
  appHook: "add text anywhere on a page",
  sectionPlan: [
    { heading: "Three different problems", covers: "flat scan vs no form fields vs a locked document, and how to tell them apart" },
    { heading: "If it is a scan", covers: "why there is no text layer, and that an overlay is the workaround rather than a fix" },
    { heading: "If fields are missing", covers: "the document was never made fillable; typing on top is legitimate and accepted" },
    { heading: "If it is locked", covers: "permissions and passwords, and when you have to go back to the sender" },
    { heading: "Making it look right", covers: "matching size and alignment so the result does not look pasted on" },
  ],
  honestLimitation: "An overlay editor does not fill real AcroForm fields as form data, and cannot OCR a scan; documents that require true field data have to go back to the issuer.",
};

const brief = BriefSchema.parse(${briefPath ? `JSON.parse(readFileSync(${JSON.stringify(briefPath)}, "utf8"))` : "SAMPLE"});
const budget = new RunBudget(1.0);

console.log("Brief:", brief.workingTitle, "\\n");

const { draft, costUsd } = await writeDraft({ brief, index, budget });
console.log("--- prechecks ---");
const failures = precheckDraft(draft, index);
console.log(failures.length ? failures.map((f) => "  " + f.code + ": " + f.detail).join("\\n") : "  all passed");
console.log("  words:", countWords(draft));

const markdown = renderPost({ draft, brief, date: new Date().toISOString().slice(0, 10), runId: "offline" });
console.log("\\n--- article ---\\n");
console.log(markdown);

if (failures.length === 0) {
  const { review, costUsd: reviewCost } = await reviewArticle({ renderedArticle: markdown, index, budget });
  const verdict = gate(review);
  console.log("--- review ---");
  console.log("  scores:", JSON.stringify(review.scores));
  console.log("  verdict:", verdict.passes ? "PUBLISH" : "DISCARD");
  if (!verdict.passes) verdict.reasons.forEach((r) => console.log("    - " + r));
  review.violations.forEach((v) => console.log(\`    [\${v.severity}] \${v.code}: \${v.detail}\`));
  console.log("  reviewer said:", review.oneLineVerdict);
  console.log("\\n  cost: $" + (costUsd + reviewCost).toFixed(4));
} else {
  console.log("  cost: $" + costUsd.toFixed(4) + " (reviewer not called — prechecks failed)");
}
`;

const result = spawnSync("npx", ["--yes", "tsx", "--eval", script], { stdio: "inherit" });
process.exit(result.status ?? 1);
