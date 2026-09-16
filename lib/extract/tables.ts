import { inReadingOrder } from "./text-layer";
import type { Rect, TextItem } from "./types";

/**
 * Turning a region of positioned text into rows and columns.
 *
 * A PDF has no idea it contains a table — there are only glyphs at
 * coordinates — so this clusters by geometry. It is a heuristic and it is
 * presented to the user as one: the workspace shows the parsed grid before
 * anything is exported, because a silently mis-parsed table is worse than an
 * obviously mis-parsed one.
 */

export function itemsInRect(items: TextItem[], rect: Rect): TextItem[] {
    // Centre-point containment, so an item straddling the edge of the drag
    // belongs to whichever side holds most of it.
    return items.filter((item) => {
        const cx = item.x + item.width / 2;
        const cy = item.y + item.height / 2;
        return cx >= rect.x && cx <= rect.x + rect.width && cy >= rect.y && cy <= rect.y + rect.height;
    });
}

/** Groups items into visual rows by vertical proximity. */
export function toRows(items: TextItem[]): TextItem[][] {
    const rows: TextItem[][] = [];

    for (const item of inReadingOrder(items)) {
        const row = rows.find((candidate) => Math.abs(candidate[0].y - item.y) < Math.max(item.height, candidate[0].height) * 0.6);
        if (row) row.push(item);
        else rows.push([item]);
    }

    return rows.map((row) => row.sort((a, b) => a.x - b.x));
}

/**
 * Finds column boundaries from the gaps that recur across rows.
 *
 * A column edge is a horizontal position where most rows have whitespace. That
 * is more robust than clustering on the left edge of each cell, which falls
 * apart the moment one column is right-aligned — as numeric columns almost
 * always are.
 */
function columnBoundaries(rows: TextItem[][], pageWidth: number): number[] {
    if (rows.length === 0) return [];

    const SLICES = 240;
    const left = Math.min(...rows.flat().map((item) => item.x));
    const right = Math.max(...rows.flat().map((item) => item.x + item.width));
    const span = right - left;
    if (span <= 0) return [];

    // occupancy[i] counts rows with ink in this vertical slice.
    const occupancy = new Array<number>(SLICES).fill(0);
    for (const row of rows) {
        const covered = new Set<number>();
        for (const item of row) {
            const from = Math.floor(((item.x - left) / span) * SLICES);
            const to = Math.ceil(((item.x + item.width - left) / span) * SLICES);
            for (let i = Math.max(0, from); i < Math.min(SLICES, to); i++) covered.add(i);
        }
        for (const i of covered) occupancy[i]++;
    }

    // A gutter is a run of slices empty in every row. Its midpoint is the split.
    const boundaries: number[] = [];
    let runStart: number | null = null;

    for (let i = 0; i < SLICES; i++) {
        if (occupancy[i] === 0) {
            runStart ??= i;
        } else if (runStart !== null) {
            const runWidth = i - runStart;
            // Ignore the ordinary space between words; a column gutter is wider.
            if (runWidth >= SLICES * 0.012) boundaries.push(left + ((runStart + i) / 2 / SLICES) * span);
            runStart = null;
        }
    }

    void pageWidth;
    return boundaries;
}

export interface ParsedTable {
    rows: string[][];
    columnCount: number;
    /** True when rows disagree about column count — a signal to show the user. */
    ragged: boolean;
}

export function parseTable(items: TextItem[], pageWidth: number): ParsedTable {
    const rows = toRows(items);
    if (rows.length === 0) return { rows: [], columnCount: 0, ragged: false };

    const boundaries = columnBoundaries(rows, pageWidth);

    const grid = rows.map((row) => {
        const cells = new Array<string>(boundaries.length + 1).fill("");
        for (const item of row) {
            const centre = item.x + item.width / 2;
            let column = 0;
            while (column < boundaries.length && centre > boundaries[column]) column++;
            cells[column] = cells[column] ? `${cells[column]} ${item.text}` : item.text;
        }
        return cells.map((cell) => cell.trim());
    });

    const widths = new Set(grid.map((row) => row.filter(Boolean).length));

    return { rows: grid, columnCount: boundaries.length + 1, ragged: widths.size > 1 };
}

export function toCsv(rows: string[][]): string {
    const escape = (cell: string) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
    return rows.map((row) => row.map(escape).join(",")).join("\n");
}

/** First row becomes the keys, which is right far more often than not. */
export function toJsonRecords(rows: string[][]): Array<Record<string, string>> {
    if (rows.length < 2) return [];

    const headers = rows[0].map((header, index) => header || `column_${index + 1}`);
    return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

export function toMarkdownTable(rows: string[][]): string {
    if (rows.length === 0) return "";

    const width = Math.max(...rows.map((row) => row.length));
    const pad = (row: string[]) => Array.from({ length: width }, (_, i) => (row[i] ?? "").replace(/\|/g, "\\|"));

    const [header, ...body] = rows;
    return [
        `| ${pad(header).join(" | ")} |`,
        `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
        ...body.map((row) => `| ${pad(row).join(" | ")} |`),
    ].join("\n");
}
