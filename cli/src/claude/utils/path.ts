import { homedir } from "node:os";
import { join } from "node:path";
import { normalizeComparablePath } from "@/utils/normalizeComparablePath";

export function getProjectPath(workingDirectory: string) {
    const projectId = normalizeComparablePath(workingDirectory).replace(/[^a-zA-Z0-9]/g, '-');
    const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    return join(claudeConfigDir, 'projects', projectId);
}
