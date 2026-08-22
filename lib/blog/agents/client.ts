import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

/**
 * The one place the pipeline talks to the model.
 *
 * Every call is schema-constrained, every call is costed, and the running total
 * is checked against MAX_RUN_COST_USD after each one so a prompt that somehow
 * loops cannot quietly spend real money.
 */

/**
 * Per-million-token rates.
 *
 * Sonnet 5 carries introductory pricing of $2/$10 until 2026-08-31; the
 * standard $3/$15 is used here deliberately, so the run log never
 * under-reports once the introductory period lapses.
 */
const PRICING: Record<string, { input: number; output: number }> = {
    "claude-sonnet-5": { input: 3, output: 15 },
    "claude-opus-5": { input: 5, output: 25 },
    "claude-haiku-4-5": { input: 1, output: 5 },
};

export const AUTHOR_MODEL = process.env.BLOG_AUTHOR_MODEL ?? "claude-sonnet-5";
export const REVIEWER_MODEL = process.env.BLOG_REVIEWER_MODEL ?? "claude-sonnet-5";

function priceOf(model: string) {
    return PRICING[model] ?? PRICING["claude-sonnet-5"];
}

/** Cache reads bill at ~0.1x and cache writes at ~1.25x of the input rate. */
export function costOf(model: string, usage: Anthropic.Usage): number {
    const { input, output } = priceOf(model);
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheWrite = usage.cache_creation_input_tokens ?? 0;

    return (
        (usage.input_tokens * input + cacheRead * input * 0.1 + cacheWrite * input * 1.25 + usage.output_tokens * output) / 1_000_000
    );
}

export class RunBudget {
    private spent = 0;

    constructor(private readonly limitUsd: number) {}

    get total(): number {
        return this.spent;
    }

    /** Throws once the run has spent its allowance; the caller aborts and commits nothing. */
    add(amount: number): void {
        this.spent += amount;
        if (this.spent > this.limitUsd) {
            throw new RunBudgetExceeded(`Run cost $${this.spent.toFixed(3)} exceeded the $${this.limitUsd.toFixed(2)} limit.`);
        }
    }
}

export class RunBudgetExceeded extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RunBudgetExceeded";
    }
}

let cached: Anthropic | null = null;

export function anthropic(): Anthropic {
    // Constructed lazily so importing this module during `next build` does not
    // require the key to be present.
    cached ??= new Anthropic();
    return cached;
}

export interface StructuredCallInput<T extends z.ZodType> {
    model: string;
    schema: T;
    /**
     * Prompt sections in cache order: stable content first. The last entry is
     * marked as a cache breakpoint, so everything before it is reused across
     * the run's calls.
     */
    systemStable: string;
    systemVolatile?: string;
    userMessage: string;
    maxTokens?: number;
    budget: RunBudget;
}

export interface StructuredCallResult<T> {
    value: T;
    costUsd: number;
    usage: Anthropic.Usage;
}

/**
 * One schema-constrained call.
 *
 * The stable half of the system prompt (capability manifest, style contract,
 * post index) is identical across every call in a run, so it carries a cache
 * breakpoint — six author calls in a row read it rather than re-paying for it.
 */
export async function callStructured<T extends z.ZodType>({
    model,
    schema,
    systemStable,
    systemVolatile,
    userMessage,
    maxTokens = 8000,
    budget,
}: StructuredCallInput<T>): Promise<StructuredCallResult<z.infer<T>>> {
    const system: Anthropic.TextBlockParam[] = [{ type: "text", text: systemStable, cache_control: { type: "ephemeral" } }];
    if (systemVolatile) system.push({ type: "text", text: systemVolatile });

    const response = await anthropic().messages.parse({
        model,
        max_tokens: maxTokens,
        thinking: { type: "adaptive" },
        system,
        messages: [{ role: "user", content: userMessage }],
        output_config: { format: zodOutputFormat(schema) },
    });

    const costUsd = costOf(model, response.usage);
    budget.add(costUsd);

    if (response.stop_reason === "refusal") {
        throw new Error(`Model declined the request (${response.stop_details?.category ?? "unknown"}).`);
    }
    if (!response.parsed_output) {
        throw new SchemaFailure(`Model output did not match the schema (stop_reason: ${response.stop_reason}).`);
    }

    return { value: response.parsed_output, costUsd, usage: response.usage };
}

export class SchemaFailure extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SchemaFailure";
    }
}

/** A free-text call, used only for the brief agent's optional web-search grounding pass. */
export async function callWithWebSearch({
    model,
    systemStable,
    userMessage,
    maxSearches,
    budget,
}: {
    model: string;
    systemStable: string;
    userMessage: string;
    maxSearches: number;
    budget: RunBudget;
}): Promise<{ text: string; costUsd: number }> {
    const response = await anthropic().messages.create({
        model,
        max_tokens: 4000,
        system: [{ type: "text", text: systemStable, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userMessage }],
        // Search and structured output are kept in separate calls on purpose:
        // search results carry citations, and citations are rejected alongside
        // output_config.format.
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: maxSearches }],
    });

    const costUsd = costOf(model, response.usage);
    budget.add(costUsd);

    const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");

    return { text, costUsd };
}
