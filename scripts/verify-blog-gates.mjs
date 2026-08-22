/**
 * Asserts the deterministic half of the pipeline still works.
 *
 * No API calls: this covers the prechecks, the publish gate, and the renderer —
 * the layers that decide what gets published without asking a model anything.
 * They are the ones that must never silently regress.
 *
 *   npm run verify:gates
 */
import { spawnSync } from "node:child_process";

const script = `
import { BAD_DRAFTS, GOOD_DRAFT } from "./lib/blog/__fixtures__/bad-drafts";
import { precheckDraft } from "./lib/blog/precheck";
import { gate } from "./lib/blog/gate";
import { renderPost } from "./lib/blog/render";
import indexJson from "./content/blog/index.json";

const index = indexJson;
let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(\`\${ok ? "PASS" : "FAIL"}  \${label}\${detail ? "  (" + detail + ")" : ""}\`);
};

console.log("--- prechecks reject known-bad drafts ---");
for (const fixture of BAD_DRAFTS) {
  const codes = precheckDraft(fixture.draft, index).map((f) => f.code);
  check(fixture.name, codes.includes(fixture.expectCode), codes.join(", ") || "no failures raised");
}

console.log("\\n--- prechecks accept a clean draft ---");
const clean = precheckDraft(GOOD_DRAFT, index);
check("clean draft passes every precheck", clean.length === 0, clean.map((f) => f.code + ": " + f.detail).join(" | "));

console.log("\\n--- the gate is computed from scores, not from a verdict ---");
const perfect = { taskUtility: 5, appRelevance: 5, factualSafety: 5, originality: 4, styleCompliance: 4, evergreen: 5 };
check("all-good review passes", gate({ scores: perfect, violations: [], oneLineVerdict: "fine" }).passes);
check(
  "a single blocker fails it",
  !gate({ scores: perfect, violations: [{ code: "CAPABILITY_CLAIM", severity: "blocker", detail: "d", quote: "q" }], oneLineVerdict: "" }).passes,
);
check(
  "a warning alone does not fail it",
  gate({ scores: perfect, violations: [{ code: "STYLE_VIOLATION", severity: "warning", detail: "d", quote: "q" }], oneLineVerdict: "" }).passes,
);
check("factualSafety of 4 fails — the threshold is an absolute 5",
  !gate({ scores: { ...perfect, factualSafety: 4 }, violations: [], oneLineVerdict: "" }).passes);
check("evergreen of 3 fails", !gate({ scores: { ...perfect, evergreen: 3 }, violations: [], oneLineVerdict: "" }).passes);

console.log("\\n--- renderer ---");
const brief = {
  slug: GOOD_DRAFT.slug, workingTitle: GOOD_DRAFT.title, targetQuery: "q", taskIntent: "add-text",
  signalOrigin: "backlog", signalEvidence: "e", whyNow: "evergreen",
  eighteenMonthTest: "The task does not change and no dated fact is referenced anywhere in the article body.",
  appHook: "add text", sectionPlan: GOOD_DRAFT.sections.map((s) => ({ heading: s.heading, covers: "x" })),
  honestLimitation: "It cannot fill real AcroForm fields as data.",
};
const md = renderPost({ draft: GOOD_DRAFT, brief, date: "2026-08-24", runId: "2026-W35" });
check("frontmatter present", md.startsWith("---\\ntitle:"));
check("marks itself generated", md.includes("generated: true"));
check("CTA link injected by code", md.includes("[actuallyfreepdfeditor.com](https://actuallyfreepdfeditor.com)"));
check("exactly one domain link", (md.match(/\\]\\(https:\\/\\/actuallyfreepdfeditor\\.com\\)/g) || []).length === 1);
check("practical notes section added", md.includes("#### Practical notes"));
check("html in prose is stripped", !renderPost({
  draft: { ...GOOD_DRAFT, practicalNotes: "Careful <script>alert(1)</script> here. " + "Padding sentence for the length minimum. ".repeat(4) },
  brief, date: "2026-08-24", runId: "2026-W35",
}).includes("<script>"));

console.log(failures ? \`\\n\${failures} failure(s)\` : "\\nAll gate checks passed.");
process.exit(failures ? 1 : 0);
`;

const result = spawnSync("npx", ["--yes", "tsx", "--eval", script], { stdio: "inherit", shell: false });
process.exit(result.status ?? 1);
