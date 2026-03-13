import { logger } from '@/ui/logger';
import { geminiLoop } from './loop';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler';
import type { AgentState } from '@/api/types';
import type { GeminiSession } from './session';
import type { GeminiMode, PermissionMode } from './types';
import { bootstrapSession } from '@/agent/sessionFactory';
import { createModeChangeHandler, createRunnerLifecycle, setControlledByUser } from '@/agent/runnerLifecycle';
import { startHookServer } from '@/claude/utils/startHookServer';
import { cleanupHookSettingsFile, generateHookSettingsFile } from '@/modules/common/hooks/generateHookSettings';
import { resolveGeminiRuntimeConfig } from './utils/config';
import { isPermissionModeAllowedForFlavor } from '@agentchat/protocol';
import { PermissionModeSchema } from '@agentchat/protocol/schemas';
import { formatMessageWithAttachments } from '@/utils/attachmentFormatter';
import { getEffectiveCwd } from '@/utils/effectiveCwd';

export async function runGemini(opts: {
    startedBy?: 'runner' | 'terminal';
    startingMode?: 'local' | 'remote';
    permissionMode?: PermissionMode;
    model?: string;
} = {}): Promise<void> {
    const workingDirectory = getEffectiveCwd();
    const startedBy = opts.startedBy ?? 'terminal';

    logger.debug(`[gemini] Starting with options: startedBy=${startedBy}, startingMode=${opts.startingMode}`);

    if (startedBy === 'runner' && opts.startingMode === 'local') {
        logger.debug('[gemini] Runner spawn requested with local mode; forcing remote mode');
        opts.startingMode = 'remote';
    }

    const initialState: AgentState = {
        controlledByUser: false
    };

    const { api, session } = await bootstrapSession({
        flavor: 'gemini',
        startedBy,
        workingDirectory,
        model: opts.model ? resolveGeminiRuntimeConfig({ model: opts.model }).model : undefined,
        agentState: initialState
    });

    const startingMode: 'local' | 'remote' = opts.startingMode
        ?? (startedBy === 'runner' ? 'remote' : 'local');

    setControlledByUser(session, startingMode);

    const messageQueue = new MessageQueue2<GeminiMode>((mode) => hashObject({
        permissionMode: mode.permissionMode,
        model: mode.model
    }));

    const sessionWrapperRef: { current: GeminiSession | null } = { current: null };
    let currentPermissionMode: PermissionMode = opts.permissionMode ?? 'default';
    let currentModel = resolveGeminiRuntimeConfig({ model: opts.model }).model;

    const hookServer = await startHookServer({
        onSessionHook: (sessionId, data) => {
            logger.debug(`[gemini] Session hook received: ${sessionId}`);
            const currentSession = sessionWrapperRef.current;
            if (!currentSession) {
                return;
            }
            if (currentSession.sessionId !== sessionId) {
                currentSession.onSessionFound(sessionId);
            }
            if (typeof data.transcript_path === 'string') {
                currentSession.onTranscriptPathFound(data.transcript_path);
            }
        }
    });

    const hookSettingsPath = generateHookSettingsFile(hookServer.port, hookServer.token, {
        filenamePrefix: 'gemini-session-hook',
        logLabel: 'gemini-hook-settings',
        hooksEnabled: true
    });

    const lifecycle = createRunnerLifecycle({
        session,
        logTag: 'gemini',
        stopKeepAlive: () => sessionWrapperRef.current?.stopKeepAlive(),
        onAfterClose: () => {
            hookServer.stop();
            cleanupHookSettingsFile(hookSettingsPath, 'gemini-hook-settings');
        }
    });

    lifecycle.registerProcessHandlers();
    registerKillSessionHandler(session.rpcHandlerManager, lifecycle.cleanupAndExit);

    const syncSessionMode = () => {
        const sessionInstance = sessionWrapperRef.current;
        if (!sessionInstance) {
            return;
        }
        sessionInstance.setPermissionMode(currentPermissionMode);
        sessionInstance.setModel(currentModel);
        session.updateMetadata((currentMetadata) => ({
            ...currentMetadata,
            model: currentModel,
        }));
        logger.debug(`[gemini] Synced session permission mode for keepalive: ${currentPermissionMode}`);
    };

    session.onUserMessage((message) => {
        const formattedText = formatMessageWithAttachments(message.content.text, message.content.attachments);
        const mode: GeminiMode = {
            permissionMode: currentPermissionMode,
            model: currentModel
        };
        messageQueue.push(formattedText, mode);
    });

    const resolvePermissionMode = (value: unknown): PermissionMode => {
        const parsed = PermissionModeSchema.safeParse(value);
        if (!parsed.success || !isPermissionModeAllowedForFlavor(parsed.data, 'gemini')) {
            throw new Error('Invalid permission mode');
        }
        return parsed.data as PermissionMode;
    };

    session.rpcHandlerManager.registerHandler('set-session-config', async (payload: unknown) => {
        if (!payload || typeof payload !== 'object') {
            throw new Error('Invalid session config payload');
        }
        const config = payload as { permissionMode?: unknown; model?: unknown };

        if (config.permissionMode !== undefined) {
            currentPermissionMode = resolvePermissionMode(config.permissionMode);
        }

        if (config.model !== undefined) {
            if (typeof config.model !== 'string' || !config.model.trim()) {
                throw new Error('Invalid model');
            }
            currentModel = resolveGeminiRuntimeConfig({ model: config.model.trim() }).model;
        }

        syncSessionMode();
        return { applied: { permissionMode: currentPermissionMode, model: currentModel } };
    });

    try {
        await geminiLoop({
            path: workingDirectory,
            startingMode,
            startedBy,
            messageQueue,
            session,
            api,
            permissionMode: currentPermissionMode,
            model: currentModel,
            hookSettingsPath,
            onModeChange: createModeChangeHandler(session),
            onSessionReady: (instance) => {
                sessionWrapperRef.current = instance;
                syncSessionMode();
            }
        });
    } catch (error) {
        lifecycle.markCrash(error);
        logger.debug('[gemini] Loop error:', error);
    } finally {
        const localFailure = sessionWrapperRef.current?.localLaunchFailure;
        if (localFailure?.exitReason === 'exit') {
            lifecycle.setExitCode(1);
            lifecycle.setArchiveReason(`Local launch failed: ${localFailure.message.slice(0, 200)}`);
        }
        await lifecycle.cleanupAndExit();
    }
}
