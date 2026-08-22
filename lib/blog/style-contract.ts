/**
 * The house style, injected into the author prompt and — separately — into the
 * reviewer prompt so the reviewer can judge compliance without being told what
 * the author was aiming for.
 */

export const BANNED_PHRASES = [
    "in today's digital landscape",
    "in today's digital world",
    "in today's digital age",
    "in today's world",
    "delve",
    "leverage",
    "seamless",
    "seamlessly",
    "robust",
    "unlock",
    "game-changer",
    "game changer",
    "revolutionize",
    "revolutionise",
    "navigate the complexities",
    "it's worth noting",
    "it is worth noting",
    "in conclusion",
    "in this article, we'll",
    "in this article we will",
    "let's dive in",
    "let us dive in",
    "dive into the world",
    "the world of pdfs",
    "act now",
    "before it's too late",
    "look no further",
    "we've got you covered",
] as const;

/** `Whether you're a X or a Y` and sentences opening with `Additionally,`. */
export const BANNED_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
    { label: "Whether you're a X or a Y", pattern: /\bwhether you(?:'re| are) an? \w+/i },
    { label: "sentence opening with Additionally,", pattern: /(?:^|[.!?]\s+)Additionally,/ },
    { label: "sentence opening with Furthermore,", pattern: /(?:^|[.!?]\s+)Furthermore,/ },
    { label: "sentence opening with Moreover,", pattern: /(?:^|[.!?]\s+)Moreover,/ },
    { label: "emoji", pattern: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u },
    { label: "exclamation mark", pattern: /!/ },
];

export const STYLE_CONTRACT = `VOICE
- Second person, present tense. "You", not "users".
- Open with the answer. No throat-clearing, no scene-setting.
- 500-900 words total.
- Four to six section headings, each two to five words. No headings phrased as questions.
- Prose paragraphs, not bullet spam. At most one short list in the whole article.
- Concrete: name real tools, real form numbers, real file sizes, real key combinations.
- Say when this tool is NOT the answer. Volunteer the limitation before the reader hits it.
- Em dashes are fine — the site voice uses them. Do not overdo it.
- British or American spelling is fine, but be consistent within an article.

BANNED
- These phrases, in any casing: ${BANNED_PHRASES.join("; ")}.
- Emoji. Exclamation marks. Rhetorical questions as headings.
- Bolding more than two phrases in the whole article.
- Any sentence beginning "Additionally,", "Furthermore," or "Moreover,".
- Manufactured urgency of any kind.
- Claiming or implying a capability the editor does not have.

THE CTA
- Exactly ONE paragraph mentions actuallyfreepdfeditor.com, and it is the
  ctaParagraph field. The URL must appear nowhere else.
- It describes the tool as one step in the reader's task, not as a pitch.
- No superlatives. Not "the best", not "the easiest". State what it does.
- It goes late in the article, never in the opening, never in the first half.
- Model the register on this, which earns the mention by being useful first:
    "Arkibber helps you search, filter, and evaluate items before you decide
     whether to grab them — so you spend less time downloading things you do
     not need."`;
