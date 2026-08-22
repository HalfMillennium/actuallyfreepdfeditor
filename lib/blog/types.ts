/** Shared types for the blog: both the static renderer and the pipeline use these. */

export const TASK_INTENTS = [
    "add-text",
    "signing",
    "annotation",
    "redaction",
    "page-management",
    "access-and-viewing",
    "file-handling",
    "comparison",
    "troubleshooting",
] as const;

export type TaskIntent = (typeof TASK_INTENTS)[number];

/** Which of the four signal sources put this article on the schedule. */
export const SIGNAL_ORIGINS = ["trend", "news", "seasonal", "backlog"] as const;
export type SignalOrigin = (typeof SIGNAL_ORIGINS)[number];

/** Frontmatter as written into each post's markdown file. */
export interface PostFrontmatter {
    title: string;
    /** The one-line summary shown on the index and used as the meta description. */
    dek: string;
    date: string;
    tags: string[];
    taskIntent: TaskIntent;
    signalOrigin: SignalOrigin;
    /** Present on pipeline-written posts, absent on hand-written ones. */
    generated?: boolean;
    runId?: string;
}

export interface Post extends PostFrontmatter {
    slug: string;
    body: string;
    readingMinutes: number;
}

/** The compact record kept in `content/blog/index.json` and fed to both agents for dedup. */
export interface PostIndexEntry {
    slug: string;
    title: string;
    dek: string;
    date: string;
    tags: string[];
    taskIntent: TaskIntent;
}
