import { Octokit } from "@octokit/rest";

import type { PostIndexEntry } from "./types";

/**
 * Writing back to the repository.
 *
 * Vercel functions cannot write into their own source, so the run commits
 * through the GitHub Git Data API and lets the resulting push trigger the
 * rebuild.
 *
 * One commit, or none. Every file the run produces — posts, the index, the run
 * log, the backlog flags — goes into a single tree and a single commit. A crash
 * partway through loses the week's work and the cron fires again next Monday,
 * which is a far better failure than a repository with three posts and a stale
 * index.
 */

export interface RepoFile {
    path: string;
    content: string;
}

function repoParts(): { owner: string; repo: string } {
    const full = process.env.GITHUB_REPO;
    if (!full) throw new Error("GITHUB_REPO is not set (expected 'owner/name').");

    const [owner, repo] = full.split("/");
    if (!owner || !repo) throw new Error(`GITHUB_REPO is malformed: ${full}`);
    return { owner, repo };
}

function client(): Octokit {
    const auth = process.env.GITHUB_TOKEN;
    if (!auth) throw new Error("GITHUB_TOKEN is not set.");
    return new Octokit({ auth });
}

/** Reads a text file from the default branch. Returns null when it does not exist. */
export async function readRepoFile(path: string): Promise<string | null> {
    const octokit = client();
    const { owner, repo } = repoParts();

    try {
        const { data } = await octokit.repos.getContent({ owner, repo, path });
        if (Array.isArray(data) || data.type !== "file") return null;
        return Buffer.from(data.content, "base64").toString("utf8");
    } catch (error) {
        if (typeof error === "object" && error && "status" in error && error.status === 404) return null;
        throw error;
    }
}

export async function readPostIndex(): Promise<PostIndexEntry[]> {
    const raw = await readRepoFile("content/blog/index.json");
    if (!raw) return [];
    try {
        return JSON.parse(raw) as PostIndexEntry[];
    } catch {
        return [];
    }
}

/**
 * Flips `used: false` to `used: true` for the backlog entries a run consumed.
 *
 * Operates on the file's text rather than re-serialising the array, so the
 * comments and formatting a human maintains in that file survive untouched.
 */
export function markBacklogUsed(source: string, ids: string[], runId: string): string {
    let updated = source;

    for (const id of ids) {
        // Anchored to the entry's own line, so one id can never rewrite another.
        const line = new RegExp(`(\\{\\s*id: "${id}",[^}]*?)used: false`, "m");
        updated = updated.replace(line, `$1used: true, usedInRun: "${runId}"`);
    }

    return updated;
}

export interface CommitInput {
    files: RepoFile[];
    message: string;
    /** When false, the commit lands on its own branch and a PR is opened instead. */
    autoMerge: boolean;
    branchName: string;
}

export interface CommitResult {
    commitSha: string;
    branch: string;
    pullRequestUrl?: string;
}

export async function commitFiles({ files, message, autoMerge, branchName }: CommitInput): Promise<CommitResult> {
    const octokit = client();
    const { owner, repo } = repoParts();

    const { data: repoInfo } = await octokit.repos.get({ owner, repo });
    const baseBranch = repoInfo.default_branch;

    const { data: baseRef } = await octokit.git.getRef({ owner, repo, ref: `heads/${baseBranch}` });
    const baseSha = baseRef.object.sha;

    const { data: baseCommit } = await octokit.git.getCommit({ owner, repo, commit_sha: baseSha });

    // Blobs first, then one tree, then one commit.
    const blobs = await Promise.all(
        files.map(async (file) => {
            const { data } = await octokit.git.createBlob({ owner, repo, content: file.content, encoding: "utf-8" });
            return { path: file.path, mode: "100644" as const, type: "blob" as const, sha: data.sha };
        }),
    );

    const { data: tree } = await octokit.git.createTree({ owner, repo, base_tree: baseCommit.tree.sha, tree: blobs });

    const { data: commit } = await octokit.git.createCommit({
        owner,
        repo,
        message,
        tree: tree.sha,
        parents: [baseSha],
    });

    if (autoMerge) {
        await octokit.git.updateRef({ owner, repo, ref: `heads/${baseBranch}`, sha: commit.sha });
        return { commitSha: commit.sha, branch: baseBranch };
    }

    // PR mode: the run's work lands somewhere a human reads it before it ships.
    await octokit.git.createRef({ owner, repo, ref: `refs/heads/${branchName}`, sha: commit.sha });

    const { data: pull } = await octokit.pulls.create({
        owner,
        repo,
        title: message.split("\n")[0],
        head: branchName,
        base: baseBranch,
        body: [
            message.split("\n").slice(1).join("\n").trim(),
            "",
            "---",
            "_Opened by the weekly blog pipeline. Review the posts and the run log, then merge._",
        ].join("\n"),
    });

    return { commitSha: commit.sha, branch: branchName, pullRequestUrl: pull.html_url };
}
