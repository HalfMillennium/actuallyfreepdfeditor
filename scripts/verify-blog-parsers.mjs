/** RSS parser checks against captured feed shapes. No network access needed. */
import { spawnSync } from "node:child_process";

const script = `
import { parseRss } from "./lib/blog/sources/rss";
import { TRENDS_RSS, NEWS_RSS } from "./lib/blog/__fixtures__/feeds";
import { DOC_INTENT_LEXICON } from "./lib/blog/sources/trends";
import { runId, isoWeek, seasonalThemes } from "./lib/blog/seasonal";
import { markBacklogUsed } from "./lib/blog/commit";

let failures = 0;
const check = (label, ok, detail = "") => { if (!ok) failures++; console.log(\`\${ok ? "PASS" : "FAIL"}  \${label}\${detail ? "  (" + detail + ")" : ""}\`); };

console.log("--- rss parser ---");
const trends = parseRss(TRENDS_RSS);
check("parses trend items", trends.length === 3, \`got \${trends.length}\`);
check("collects nested news snippets", trends[1].newsSnippets.length === 4);
check("unwraps CDATA", trends[1].newsSnippets.some((s) => s.includes("signed certification")));
const hasIntent = (i) => DOC_INTENT_LEXICON.some((t) => [i.title, ...i.newsSnippets].join(" ").toLowerCase().includes(t));
check("sports trend filtered out", !hasIntent(trends[0]));
check("document trend survives via snippet, not title", hasIntent(trends[1]));
check("celebrity trend filtered out", !hasIntent(trends[2]));
const news = parseRss(NEWS_RSS);
check("decodes entities", news[0].title.includes("signed & dated"));
check("strips markup from descriptions", !news[0].description.includes("<"));
check("malformed xml does not throw", parseRss("<rss><item><title>unclosed").length === 0);

console.log("\\n--- iso week-year ---");
for (const [iso, expected] of [["2026-08-24","2026-W35"],["2023-01-01","2022-W52"],["2021-01-01","2020-W53"],["2019-12-30","2020-W01"]]) {
  check(\`runId \${iso}\`, runId(new Date(iso + "T12:00:00Z")) === expected, runId(new Date(iso + "T12:00:00Z")));
}
check("seasonal gap falls back to nearest earlier week", seasonalThemes(2).length > 0);

console.log("\\n--- backlog flag rewrite ---");
const src = 'const A = [\\n  { id: "bl-001", query: "a", intent: "signing", volume: "high", used: false },\\n  { id: "bl-002", query: "b", intent: "signing", volume: "high", used: false },\\n];';
const out = markBacklogUsed(src, ["bl-002"], "2026-W35");
check("marks only the named entry", out.includes('id: "bl-002", query: "b", intent: "signing", volume: "high", used: true, usedInRun: "2026-W35"'), out.split("\\n")[2]);
check("leaves the other entry untouched", out.includes('id: "bl-001", query: "a", intent: "signing", volume: "high", used: false'));

console.log(failures ? \`\\n\${failures} failure(s)\` : "\\nAll parser checks passed.");
process.exit(failures ? 1 : 0);
`;

process.exit(spawnSync("npx", ["--yes", "tsx", "--eval", script], { stdio: "inherit" }).status ?? 1);
