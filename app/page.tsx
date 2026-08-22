import { EditorProvider } from "@/components/editor/editor-context";
import { EditorShell } from "@/components/editor/editor-shell";
import { ToolSettingsProvider } from "@/components/editor/tool-settings";
import { getAllPosts } from "@/lib/blog/posts";

export default function Page() {
    // Read at build time in this server component and pass down: the landing
    // screen is part of the client editor tree and cannot touch the filesystem.
    const latestGuides = getAllPosts()
        .slice(0, 4)
        .map(({ slug, title, dek }) => ({ slug, title, dek }));

    return (
        <EditorProvider>
            <ToolSettingsProvider>
                <EditorShell latestGuides={latestGuides} />
            </ToolSettingsProvider>
        </EditorProvider>
    );
}
