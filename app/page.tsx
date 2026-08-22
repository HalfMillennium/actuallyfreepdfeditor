import { EditorProvider } from "@/components/editor/editor-context";
import { EditorShell } from "@/components/editor/editor-shell";
import { ToolSettingsProvider } from "@/components/editor/tool-settings";

export default function Page() {
    return (
        <EditorProvider>
            <ToolSettingsProvider>
                <EditorShell />
            </ToolSettingsProvider>
        </EditorProvider>
    );
}
