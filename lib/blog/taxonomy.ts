import type { TaskIntent } from "./types";

/** Task intents whose articles are procedural enough to carry HowTo structured data. */
export const PROCEDURAL_INTENTS: TaskIntent[] = ["add-text", "signing", "page-management", "redaction", "annotation"];

/** Human-readable labels for the ops table and post metadata. */
export const INTENT_LABELS: Record<TaskIntent, string> = {
    "add-text": "Adding text",
    signing: "Signing",
    annotation: "Annotation",
    redaction: "Redaction",
    "page-management": "Pages",
    "access-and-viewing": "Opening & viewing",
    "file-handling": "Files",
    comparison: "Comparisons",
    troubleshooting: "Troubleshooting",
};
