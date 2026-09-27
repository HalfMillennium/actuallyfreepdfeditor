/**
 * A minimal PDF content-stream tokenizer.
 *
 * Just enough of the syntax (ISO 32000-1 §7.2–7.3, §8.9.7) to walk a page's
 * operators with their operands and — the part that matters — to know the byte
 * range each operation occupies. Text removal rewrites a handful of operations
 * and splices the replacements back into the original bytes; everything it does
 * not understand passes through byte-for-byte, which is the only safe way to
 * edit a stream written by software we have never met.
 *
 * Pure and dependency-free, so it can be exercised from a plain Node script.
 */

export type Operand =
    | { type: "number"; value: number }
    | { type: "name"; value: string }
    | { type: "string"; bytes: Uint8Array }
    | { type: "array"; items: Operand[] }
    | { type: "dict" }
    | { type: "bool" }
    | { type: "null" };

export interface Operation {
    operator: string;
    operands: Operand[];
    /** Byte offset of the first operand (or of the operator, if it has none). */
    start: number;
    /** Byte offset just past the operator keyword. */
    end: number;
}

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

function isRegular(byte: number): boolean {
    return !WHITESPACE.has(byte) && !DELIMITERS.has(byte);
}

class Lexer {
    pos = 0;

    constructor(private readonly bytes: Uint8Array) {}

    get done(): boolean {
        this.skipWhitespaceAndComments();
        return this.pos >= this.bytes.length;
    }

    skipWhitespaceAndComments(): void {
        const { bytes } = this;
        while (this.pos < bytes.length) {
            const byte = bytes[this.pos];
            if (WHITESPACE.has(byte)) {
                this.pos++;
            } else if (byte === 0x25 /* % */) {
                while (this.pos < bytes.length && bytes[this.pos] !== 0x0a && bytes[this.pos] !== 0x0d) this.pos++;
            } else {
                return;
            }
        }
    }

    /** Reads one object or keyword. Keywords come back as `{ keyword }`. */
    next(): Operand | { keyword: string } | { close: "]" | ">>" } {
        this.skipWhitespaceAndComments();
        const { bytes } = this;
        const byte = bytes[this.pos];

        if (byte === 0x28 /* ( */) return { type: "string", bytes: this.readLiteralString() };

        if (byte === 0x3c /* < */) {
            if (bytes[this.pos + 1] === 0x3c) {
                this.pos += 2;
                this.skipDict();
                return { type: "dict" };
            }
            return { type: "string", bytes: this.readHexString() };
        }

        if (byte === 0x3e /* > */ && bytes[this.pos + 1] === 0x3e) {
            this.pos += 2;
            return { close: ">>" };
        }

        if (byte === 0x5b /* [ */) {
            this.pos++;
            const items: Operand[] = [];
            for (;;) {
                if (this.done) throw new Error("Unterminated array");
                const token = this.next();
                if ("close" in token) {
                    if (token.close === "]") break;
                    throw new Error("Unexpected >> in array");
                }
                if ("keyword" in token) throw new Error(`Unexpected keyword ${token.keyword} in array`);
                items.push(token);
            }
            return { type: "array", items };
        }

        if (byte === 0x5d /* ] */) {
            this.pos++;
            return { close: "]" };
        }

        if (byte === 0x2f /* / */) {
            this.pos++;
            const start = this.pos;
            while (this.pos < bytes.length && isRegular(bytes[this.pos])) this.pos++;
            return { type: "name", value: decodeName(bytes.subarray(start, this.pos)) };
        }

        if (byte === 0x7b || byte === 0x7d || byte === 0x29 || byte === 0x3e) {
            // Braces only appear in PostScript calculator functions, never in
            // page content; a stray `)` or `>` is malformed. Either way, bail.
            throw new Error(`Unexpected delimiter ${String.fromCharCode(byte)}`);
        }

        const start = this.pos;
        while (this.pos < bytes.length && isRegular(bytes[this.pos])) this.pos++;
        const word = latin1(bytes.subarray(start, this.pos));

        if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) return { type: "number", value: Number.parseFloat(word) };
        // Some producers write numbers like `4.-2` or `--3`; be as lenient as
        // Acrobat and pdf.js are, rather than refuse the page.
        if (/^[+-]*[\d.]+/.test(word) && /\d/.test(word)) {
            const cleaned = word.replace(/^[+-]*/, (signs) => (signs.split("-").length % 2 === 0 ? "-" : "")).match(/^-?\d*\.?\d*/)?.[0] ?? "0";
            const value = Number.parseFloat(cleaned);
            return { type: "number", value: Number.isFinite(value) ? value : 0 };
        }
        if (word === "true" || word === "false") return { type: "bool" };
        if (word === "null") return { type: "null" };
        return { keyword: word };
    }

    private readLiteralString(): Uint8Array {
        const { bytes } = this;
        const out: number[] = [];
        let depth = 1;
        this.pos++; // opening (

        while (this.pos < bytes.length) {
            const byte = bytes[this.pos++];
            if (byte === 0x5c /* \ */) {
                const escaped = bytes[this.pos++];
                switch (escaped) {
                    case 0x6e: out.push(0x0a); break; // n
                    case 0x72: out.push(0x0d); break; // r
                    case 0x74: out.push(0x09); break; // t
                    case 0x62: out.push(0x08); break; // b
                    case 0x66: out.push(0x0c); break; // f
                    case 0x0d: // line continuation, \r or \r\n
                        if (bytes[this.pos] === 0x0a) this.pos++;
                        break;
                    case 0x0a:
                        break;
                    default:
                        if (escaped >= 0x30 && escaped <= 0x37) {
                            let value = escaped - 0x30;
                            for (let i = 0; i < 2 && bytes[this.pos] >= 0x30 && bytes[this.pos] <= 0x37; i++) {
                                value = value * 8 + (bytes[this.pos++] - 0x30);
                            }
                            out.push(value & 0xff);
                        } else {
                            // `\(`, `\)`, `\\`, and the "ignore the backslash"
                            // rule for anything else.
                            out.push(escaped);
                        }
                }
                continue;
            }
            if (byte === 0x28) depth++;
            if (byte === 0x29 && --depth === 0) return Uint8Array.from(out);
            out.push(byte);
        }
        throw new Error("Unterminated string");
    }

    private readHexString(): Uint8Array {
        const { bytes } = this;
        this.pos++; // <
        const digits: number[] = [];
        while (this.pos < bytes.length && bytes[this.pos] !== 0x3e) {
            const value = hexValue(bytes[this.pos++]);
            if (value >= 0) digits.push(value);
        }
        if (this.pos >= bytes.length) throw new Error("Unterminated hex string");
        this.pos++; // >
        if (digits.length % 2) digits.push(0);
        const out = new Uint8Array(digits.length / 2);
        for (let i = 0; i < out.length; i++) out[i] = (digits[2 * i] << 4) | digits[2 * i + 1];
        return out;
    }

    /** Dictionaries only occur as operands of marked-content operators; we never need their contents. */
    private skipDict(): void {
        for (;;) {
            if (this.done) throw new Error("Unterminated dictionary");
            const token = this.next();
            if ("close" in token && token.close === ">>") return;
            if ("keyword" in token) throw new Error(`Unexpected keyword ${token.keyword} in dictionary`);
        }
    }

    /**
     * Skips inline image data after `ID`, up to and including `EI`.
     *
     * The data is binary with no length prefix, so the end is found by looking
     * for `EI` surrounded by whitespace — the same heuristic every reader uses.
     */
    skipInlineImageData(): void {
        const { bytes } = this;
        this.pos++; // the single whitespace byte after ID
        while (this.pos < bytes.length - 1) {
            if (
                bytes[this.pos] === 0x45 &&
                bytes[this.pos + 1] === 0x49 &&
                WHITESPACE.has(bytes[this.pos - 1]) &&
                (this.pos + 2 >= bytes.length || WHITESPACE.has(bytes[this.pos + 2]) || DELIMITERS.has(bytes[this.pos + 2]))
            ) {
                this.pos += 2;
                return;
            }
            this.pos++;
        }
        throw new Error("Unterminated inline image");
    }
}

function hexValue(byte: number): number {
    if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
    if (byte >= 0x41 && byte <= 0x46) return byte - 0x37;
    if (byte >= 0x61 && byte <= 0x66) return byte - 0x57;
    return -1;
}

function latin1(bytes: Uint8Array): string {
    let out = "";
    for (const byte of bytes) out += String.fromCharCode(byte);
    return out;
}

function decodeName(bytes: Uint8Array): string {
    return latin1(bytes).replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

/**
 * Splits a content stream into operations.
 *
 * Throws on anything malformed; callers treat a throw as "leave this page's
 * content alone", which is always a correct (if less thorough) outcome.
 */
export function parseContentStream(bytes: Uint8Array): Operation[] {
    const lexer = new Lexer(bytes);
    const operations: Operation[] = [];
    let operands: Operand[] = [];
    let start = -1;

    while (!lexer.done) {
        const tokenStart = lexer.pos;
        const token = lexer.next();

        if ("close" in token) throw new Error(`Unexpected ${token.close}`);

        if ("keyword" in token) {
            operations.push({ operator: token.keyword, operands, start: start === -1 ? tokenStart : start, end: lexer.pos });
            if (token.keyword === "ID") {
                lexer.skipInlineImageData();
                // Fold the image data and its EI into the ID operation's span.
                operations[operations.length - 1].end = lexer.pos;
            }
            operands = [];
            start = -1;
            continue;
        }

        if (start === -1) start = tokenStart;
        operands.push(token);
    }

    return operations;
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

export function hexString(bytes: Uint8Array): string {
    let out = "<";
    for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
    return out + ">";
}

export function formatNumber(value: number): string {
    if (!Number.isFinite(value)) return "0";
    const rounded = Math.round(value * 1000) / 1000;
    return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** Replaces byte ranges in `source`. Ranges must not overlap. */
export function splice(source: Uint8Array, edits: Array<{ start: number; end: number; text: string }>): Uint8Array {
    const sorted = [...edits].sort((a, b) => a.start - b.start);
    const encoder = new TextEncoder();
    const chunks: Uint8Array[] = [];
    let cursor = 0;

    for (const edit of sorted) {
        chunks.push(source.subarray(cursor, edit.start));
        // Pad with spaces: the replacement must not fuse with a neighbouring
        // token that the original separated by whitespace.
        chunks.push(encoder.encode(` ${edit.text} `));
        cursor = edit.end;
    }
    chunks.push(source.subarray(cursor));

    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}
