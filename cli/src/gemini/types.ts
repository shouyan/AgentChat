import type { GeminiPermissionMode } from '@agentchat/protocol/types';

export type PermissionMode = GeminiPermissionMode;

export interface GeminiMode {
    permissionMode: PermissionMode;
    model?: string;
}
