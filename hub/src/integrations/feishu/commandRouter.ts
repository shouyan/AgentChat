import path from 'node:path'
import type { ModelMode } from '@agentchat/protocol/types'
import { listSortedSessions } from '../../domains/sessions/queries'
import { extractReadableTextFromMessage, formatFeishuHelpText } from './formatter'
import type { FeishuAgentFlavor, FeishuCommandContext, FeishuCommandDependencies, FeishuCommandResult, FeishuSessionCreateInput } from './types'

const CLAUDE_MODEL_MODES: readonly ModelMode[] = ['default', 'sonnet', 'opus'] as const
const CODEX_MODEL_SUGGESTIONS = ['gpt-5.4', 'gpt-5.3-codex', 'gpt-5.2'] as const
const GEMINI_MODEL_SUGGESTIONS = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-3-pro-preview'] as const

function formatStatusText(input: {
    namespace: string
    activeSessionId: string | null
    machineLabel: string
    providerLabel: string
}): string {
    return [
        `Namespace: ${input.namespace}`,
        `Active session: ${input.activeSessionId ?? '(none)'}`,
        `Machine: ${input.machineLabel}`,
        `Provider: ${input.providerLabel}`,
    ].join('\n')
}

function resolveSessionTarget(raw: string, sessionIds: string[]): string | null {
    const trimmed = raw.trim()
    if (!trimmed) {
        return null
    }
    const asIndex = Number(trimmed)
    if (Number.isFinite(asIndex) && asIndex >= 1 && asIndex <= sessionIds.length) {
        return sessionIds[asIndex - 1] ?? null
    }
    const exact = sessionIds.find((sessionId) => sessionId === trimmed)
    if (exact) {
        return exact
    }
    const byPrefix = sessionIds.find((sessionId) => sessionId.startsWith(trimmed))
    return byPrefix ?? null
}

function truncateText(text: string, maxLength = 28): string {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (normalized.length <= maxLength) {
        return normalized
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function formatRelativeTime(timestamp: number, now = Date.now()): string {
    const delta = Math.max(0, now - timestamp)
    const minute = 60_000
    const hour = 60 * minute
    const day = 24 * hour
    if (delta < minute) {
        return '刚刚'
    }
    if (delta < hour) {
        return `${Math.floor(delta / minute)}分钟前`
    }
    if (delta < day) {
        return `${Math.floor(delta / hour)}小时前`
    }
    return `${Math.floor(delta / day)}天前`
}

type FeishuSessionListLike = ReturnType<typeof listSortedSessions>[number] | {
    id: string
    updatedAt: number
    metadata: { name?: string; summary?: { text: string }; path?: string | null; flavor?: string | null; model?: string } | null
    modelMode?: ModelMode
}

type FeishuRoomListLike = ReturnType<FeishuCommandDependencies['engine']['getRoomsByNamespace']>[number]

type FeishuTargetEntry =
    | { type: 'session'; id: string; updatedAt: number; label: string; data: FeishuSessionListLike }
    | { type: 'room'; id: string; updatedAt: number; label: string; data: FeishuRoomListLike }

function formatSessionLabel(session: FeishuSessionListLike): string {
    const label = session.metadata?.name
        ?? session.metadata?.summary?.text
        ?? (session.metadata?.path ? path.basename(session.metadata.path) : null)
        ?? '新会话'
    return truncateText(label)
}

function formatRoomLabel(room: FeishuRoomListLike): string {
    return truncateText(room.metadata?.name ?? '未命名群组')
}

function buildUnifiedTargets(
    sessions: FeishuSessionListLike[],
    rooms: FeishuRoomListLike[],
): FeishuTargetEntry[] {
    return [
        ...sessions.map((session): FeishuTargetEntry => ({
            type: 'session',
            id: session.id,
            updatedAt: session.updatedAt,
            label: formatSessionLabel(session),
            data: session,
        })),
        ...rooms.map((room): FeishuTargetEntry => ({
            type: 'room',
            id: room.id,
            updatedAt: room.updatedAt,
            label: formatRoomLabel(room),
            data: room,
        })),
    ].sort((left, right) => right.updatedAt - left.updatedAt)
}

function formatUnifiedTargetListItem(
    target: FeishuTargetEntry,
    index: number,
    activeTarget: { type: 'session' | 'room' | null; id: string | null }
): string {
    const isActive = target.type === activeTarget.type && target.id === activeTarget.id
    const marker = isActive ? '👉' : '  '
    const typeLabel = target.type === 'session' ? '会话' : '群组'
    const detailLine = target.type === 'session'
        ? (() => {
            const flavor = target.data.metadata?.flavor?.trim() || 'unknown'
            const model = target.data.metadata?.model?.trim() || target.data.modelMode || 'default'
            return `   ${flavor} · ${model}`
        })()
        : null
    return [
        `${marker} ${index + 1}. [${typeLabel}] ${target.label}`,
        `   ${target.id.slice(0, 8)} · ${formatRelativeTime(target.updatedAt)}`,
        ...(detailLine ? [detailLine] : [])
    ].join('\n')
}

function formatLatestSessionMessagePreview(
    sessionId: string,
    deps: FeishuCommandDependencies,
    _namespace: string,
    options?: { roles?: string[]; maxLength?: number }
): string | null {
    const recentMessages = deps.engine.getMessagesPage(sessionId, { limit: 40, beforeSeq: null }).messages
    for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
        const text = extractReadableTextFromMessage(recentMessages[index]!, options?.roles ? { roles: options.roles } : undefined)
        if (!text) {
            continue
        }
        return truncateText(text, options?.maxLength ?? 160)
    }
    return null
}

function formatSwitchSessionResponse(session: FeishuSessionListLike, deps: FeishuCommandDependencies, namespace: string): string {
    const latestMessage = formatLatestSessionMessagePreview(session.id, deps, namespace)
    return latestMessage
        ? [
            `已切换到会话 ${session.id.slice(0, 8)}。`,
            `最近一条消息：${latestMessage}`
        ].join('\n')
        : `已切换到会话 ${session.id.slice(0, 8)}。`
}

function formatLatestRoomMessagePreview(
    roomId: string,
    deps: FeishuCommandDependencies,
    namespace: string,
    options?: {
        senderTypes?: Array<'user' | 'session' | 'system'>
        maxLength?: number
    }
): { text: string; createdAt: number } | null {
    const recentMessages = deps.engine.getRoomMessagesPage(roomId, namespace, { limit: 40, beforeSeq: null }).messages
    for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
        const message = recentMessages[index]!
        if (options?.senderTypes?.length && !options.senderTypes.includes(message.senderType)) {
            continue
        }
        if (typeof message.content?.text !== 'string' || !message.content.text.trim()) {
            continue
        }
        return {
            text: truncateText(message.content.text, options?.maxLength ?? 160),
            createdAt: message.createdAt,
        }
    }
    return null
}

function formatSwitchRoomResponse(room: FeishuRoomListLike, deps: FeishuCommandDependencies, namespace: string): string {
    const latestMessage = formatLatestRoomMessagePreview(room.id, deps, namespace, { maxLength: 160 })
    return latestMessage
        ? [
            `已切换到群组 ${room.id.slice(0, 8)}。`,
            `最近一条消息：${latestMessage.text}`
        ].join('\n')
        : `已切换到群组 ${room.id.slice(0, 8)}。`
}

function formatProgressResponse(session: FeishuSessionListLike, deps: FeishuCommandDependencies, namespace: string): string {
    const latestAssistantReply = formatLatestSessionMessagePreview(session.id, deps, namespace, {
        roles: ['agent', 'assistant'],
        maxLength: 200,
    })
    if (latestAssistantReply) {
        return [
            `当前会话：${formatSessionLabel(session)} (${session.id.slice(0, 8)})`,
            `最近回复：${latestAssistantReply}`,
        ].join('\n')
    }

    const latestMessage = formatLatestSessionMessagePreview(session.id, deps, namespace, { maxLength: 200 })
    if (latestMessage) {
        return [
            `当前会话：${formatSessionLabel(session)} (${session.id.slice(0, 8)})`,
            `最近一条消息：${latestMessage}`,
        ].join('\n')
    }

    return [
        `当前会话：${formatSessionLabel(session)} (${session.id.slice(0, 8)})`,
        '当前还没有可读的最近消息；直接发送文本即可继续。',
    ].join('\n')
}

function formatRoomProgressResponse(room: FeishuRoomListLike, deps: FeishuCommandDependencies, namespace: string): string {
    const latestReply = formatLatestRoomMessagePreview(room.id, deps, namespace, {
        senderTypes: ['session'],
        maxLength: 200,
    })
    if (latestReply) {
        return [
            `当前群组：${formatRoomLabel(room)} (${room.id.slice(0, 8)})`,
            `最近回复：${latestReply.text}`,
        ].join('\n')
    }
    const latestMessage = formatLatestRoomMessagePreview(room.id, deps, namespace, { maxLength: 200 })
    if (latestMessage) {
        return [
            `当前群组：${formatRoomLabel(room)} (${room.id.slice(0, 8)})`,
            `最近一条消息：${latestMessage.text}`,
        ].join('\n')
    }
    return [
        `当前群组：${formatRoomLabel(room)} (${room.id.slice(0, 8)})`,
        '当前群组还没有可读的最近消息；直接发送文本即可继续。',
    ].join('\n')
}

const FEISHU_AGENT_FLAVORS: readonly FeishuAgentFlavor[] = ['claude', 'codex', 'cursor', 'gemini', 'opencode'] as const

function isFeishuAgentFlavor(value: string): value is FeishuAgentFlavor {
    return FEISHU_AGENT_FLAVORS.includes(value as FeishuAgentFlavor)
}

function parseNewSessionArgs(args: string): { agent?: FeishuAgentFlavor; directory?: string; error?: string } {
    const trimmed = args.trim()
    if (!trimmed) {
        return {}
    }
    const parts = trimmed.split(/\s+/).filter(Boolean)
    let agent: FeishuAgentFlavor | undefined
    let directory: string | undefined
    for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index]!
        const equalsIndex = part.indexOf('=')
        if (equalsIndex > 0) {
            const key = part.slice(0, equalsIndex).trim().toLowerCase()
            const value = part.slice(equalsIndex + 1).trim()
            if (!value) {
                return { error: '用法：/new [agent] [path] 或 /new agent=codex path=/path/to/project' }
            }
            if (key === 'agent' || key === 'flavor') {
                if (!isFeishuAgentFlavor(value.toLowerCase())) {
                    return { error: `不支持的 agent：${value}` }
                }
                agent = value.toLowerCase() as FeishuAgentFlavor
                continue
            }
            if (key === 'path' || key === 'dir' || key === 'directory') {
                directory = value
                continue
            }
            return { error: `未知参数：${key}` }
        }
        if (!agent && isFeishuAgentFlavor(part.toLowerCase())) {
            agent = part.toLowerCase() as FeishuAgentFlavor
            continue
        }
        directory = parts.slice(index).join(' ')
        break
    }
    return { agent, directory }
}

function formatNewSessionResponse(input: { sessionId: string; agent: FeishuAgentFlavor; directory?: string }): string {
    return [
        `已创建新会话 ${input.sessionId.slice(0, 8)}。`,
        `Agent: ${input.agent}`,
        `目录：${input.directory ?? '(machine home)'}`,
    ].join('\n')
}

function getActiveSessionForModelCommand(
    deps: FeishuCommandDependencies,
    context: FeishuCommandContext
): { ok: true; session: NonNullable<ReturnType<FeishuCommandDependencies['engine']['getSessionByNamespace']>> } | { ok: false; error: string } {
    const state = deps.repository.getSessionState(context.openId)
    if (state?.activeTargetType === 'room' && state.activeRoomId) {
        return { ok: false, error: '当前目标是群组。请先发送 /sessions，再用 /use 切换到一个具体会话后再切换模型。' }
    }
    const sessionId = state?.activeSessionId ?? null
    if (!sessionId) {
        return { ok: false, error: '当前没有 active 会话。发送 /sessions 查看目标列表，或发送 /new 创建会话。' }
    }
    const session = deps.engine.getSessionByNamespace(sessionId, context.namespace)
    if (!session) {
        return { ok: false, error: '当前 active 会话不存在或无权访问。发送 /sessions 查看可用目标。' }
    }
    if (!session.active) {
        return { ok: false, error: '当前会话未在线。请先向该会话发送一条消息使其恢复，然后再切换模型。' }
    }
    return { ok: true, session }
}

function formatModelList(agent: FeishuAgentFlavor): string {
    if (agent === 'claude') {
        return [
            '当前 agent：claude',
            '可用模式：',
            ...CLAUDE_MODEL_MODES.map((mode) => `- ${mode}`),
            '',
            '发送 /model <模式> 切换',
        ].join('\n')
    }
    if (agent === 'codex') {
        return [
            '当前 agent：codex',
            '推荐模型：',
            ...CODEX_MODEL_SUGGESTIONS.map((model) => `- ${model}`),
            '',
            '发送 /model <模型名> 切换',
        ].join('\n')
    }
    if (agent === 'gemini') {
        return [
            '当前 agent：gemini',
            '推荐模型：',
            ...GEMINI_MODEL_SUGGESTIONS.map((model) => `- ${model}`),
            '',
            '发送 /model <模型名> 切换',
        ].join('\n')
    }
    return '当前会话不支持在飞书内切换模型。'
}

function formatCurrentModel(agent: FeishuAgentFlavor, session: NonNullable<ReturnType<FeishuCommandDependencies['engine']['getSessionByNamespace']>>): string {
    if (agent === 'claude') {
        return session.modelMode ?? 'default'
    }
    return session.metadata?.model?.trim() || 'auto'
}

function formatModelStatus(agent: FeishuAgentFlavor, session: NonNullable<ReturnType<FeishuCommandDependencies['engine']['getSessionByNamespace']>>): string {
    const sessionLabel = formatSessionLabel(session)
    const currentModel = formatCurrentModel(agent, session)
    const examples = agent === 'claude'
        ? ['/model default', '/model sonnet', '/model opus', '/model list']
        : agent === 'codex'
            ? ['/model gpt-5.4', '/model gpt-5.3-codex', '/model gpt-5.2', '/model list']
            : agent === 'gemini'
                ? ['/model gemini-2.5-pro', '/model gemini-2.5-flash', '/model list']
                : ['/model list']
    return [
        `当前会话：${sessionLabel} (${session.id.slice(0, 8)})`,
        `Agent: ${agent}`,
        `当前模型：${currentModel}`,
        '',
        '可用示例：',
        ...examples,
    ].join('\n')
}

function formatWorkingDirectory(session: NonNullable<ReturnType<FeishuCommandDependencies['engine']['getSessionByNamespace']>>): string {
    return session.metadata?.path?.trim() || '(unknown)'
}

export async function routeFeishuCommand(
    deps: FeishuCommandDependencies,
    context: FeishuCommandContext,
    rawText: string,
    helpers: {
        createSession: (input: FeishuSessionCreateInput) => Promise<{ sessionId: string; machineId: string | null }>
    }
): Promise<FeishuCommandResult> {
    const trimmed = rawText.trim()
    if (!trimmed.startsWith('/')) {
        return { handled: false }
    }

    const [command, ...rest] = trimmed.split(/\s+/)
    const args = rest.join(' ').trim()
    const state = deps.repository.getSessionState(context.openId)
    const sessions = listSortedSessions(deps.engine, context.namespace)
    const rooms = deps.engine.getRoomsByNamespace(context.namespace).sort((left, right) => right.updatedAt - left.updatedAt)
    const unifiedTargets = buildUnifiedTargets(sessions, rooms)

    if (command === '/help') {
        return { handled: true, response: formatFeishuHelpText() }
    }

    if (command === '/progress') {
        const activeSessionId = state?.activeSessionId ?? null
        const activeRoomId = state?.activeRoomId ?? null
        const activeSession = activeSessionId ? deps.engine.getSessionByNamespace(activeSessionId, context.namespace) : undefined
        const activeRoom = activeRoomId ? deps.engine.getRoomByNamespace(activeRoomId, context.namespace) : undefined
        if (!activeSession && !activeRoom) {
            return {
                handled: true,
                response: '当前没有 active 目标。发送 /sessions 查看目标列表，或发送 /new 创建一个新的会话。'
            }
        }
        const latestSessionReply = activeSession
            ? formatLatestSessionMessagePreview(activeSession.id, deps, context.namespace, {
                roles: ['agent', 'assistant'],
                maxLength: 200,
            })
            : null
        const latestRoomReply = activeRoom
            ? formatLatestRoomMessagePreview(activeRoom.id, deps, context.namespace, {
                senderTypes: ['session'],
                maxLength: 200,
            })
            : null
        if (activeRoom && latestRoomReply && (!activeSession || !latestSessionReply)) {
            deps.repository.setSessionState({
                openId: context.openId,
                namespace: context.namespace,
                activeRoomId: activeRoom.id,
                activeTargetType: 'room',
            })
            return {
                handled: true,
                response: formatRoomProgressResponse(activeRoom, deps, context.namespace),
                roomId: activeRoom.id,
            }
        }
        if (activeSession && latestSessionReply && (!activeRoom || !latestRoomReply)) {
            deps.repository.setSessionState({
                openId: context.openId,
                namespace: context.namespace,
                activeSessionId: activeSession.id,
                activeTargetType: 'session',
                activeMachineId: activeSession.metadata?.machineId ?? state?.activeMachineId ?? null,
            })
            return {
                handled: true,
                response: formatProgressResponse(activeSession, deps, context.namespace),
                sessionId: activeSession.id,
            }
        }
        if (activeSession && activeRoom && latestSessionReply && latestRoomReply) {
            const latestSessionMessages = deps.engine.getMessagesPage(activeSession.id, { limit: 40, beforeSeq: null }).messages
            const latestSessionMessage = [...latestSessionMessages].reverse().find((message) =>
                extractReadableTextFromMessage(message, { roles: ['agent', 'assistant'] })
            )
            if ((latestSessionMessage?.createdAt ?? 0) >= latestRoomReply.createdAt) {
                deps.repository.setSessionState({
                    openId: context.openId,
                    namespace: context.namespace,
                    activeSessionId: activeSession.id,
                    activeTargetType: 'session',
                    activeMachineId: activeSession.metadata?.machineId ?? state?.activeMachineId ?? null,
                })
                return {
                    handled: true,
                    response: formatProgressResponse(activeSession, deps, context.namespace),
                    sessionId: activeSession.id,
                }
            }
            deps.repository.setSessionState({
                openId: context.openId,
                namespace: context.namespace,
                activeRoomId: activeRoom.id,
                activeTargetType: 'room',
            })
            return {
                handled: true,
                response: formatRoomProgressResponse(activeRoom, deps, context.namespace),
                roomId: activeRoom.id,
            }
        }
        if (activeRoom) {
            deps.repository.setSessionState({
                openId: context.openId,
                namespace: context.namespace,
                activeRoomId: activeRoom.id,
                activeTargetType: 'room',
            })
            return {
                handled: true,
                response: formatRoomProgressResponse(activeRoom, deps, context.namespace),
                roomId: activeRoom.id,
            }
        }
        if (!activeSession) {
            return {
                handled: true,
                response: '当前 active 会话不存在或无权访问。发送 /sessions 查看可用目标。'
            }
        }
        deps.repository.setSessionState({
            openId: context.openId,
            namespace: context.namespace,
            activeSessionId: activeSession.id,
            activeTargetType: 'session',
            activeMachineId: activeSession.metadata?.machineId ?? state?.activeMachineId ?? null,
        })
        return {
            handled: true,
            response: formatProgressResponse(activeSession, deps, context.namespace),
            sessionId: activeSession.id,
        }
    }

    if (command === '/status') {
        const activeSessionId = state?.activeSessionId ?? null
        const activeSession = activeSessionId ? deps.engine.getSessionByNamespace(activeSessionId, context.namespace) : undefined
        const machineId = activeSession?.metadata?.machineId ?? state?.activeMachineId ?? null
        const machine = machineId ? deps.engine.getMachineByNamespace(machineId, context.namespace) : undefined
        const providerLabel = activeSession?.metadata?.flavor ?? '(unknown)'
        const machineLabel = machine?.metadata?.displayName ?? machine?.metadata?.host ?? machineId ?? '(none)'
        return {
            handled: true,
            response: formatStatusText({
                namespace: context.namespace,
                activeSessionId,
                machineLabel,
                providerLabel,
            }),
            sessionId: activeSessionId ?? undefined
        }
    }

    if (command === '/model') {
        const resolved = getActiveSessionForModelCommand(deps, context)
        if (!resolved.ok) {
            return { handled: true, response: resolved.error }
        }
        const session = resolved.session
        const agent = (session.metadata?.flavor ?? 'claude') as FeishuAgentFlavor
        if (!isFeishuAgentFlavor(agent) || (agent !== 'claude' && agent !== 'codex' && agent !== 'gemini')) {
            return { handled: true, response: '当前会话不支持在飞书内切换模型。' }
        }
        if (!args) {
            return {
                handled: true,
                response: formatModelStatus(agent, session),
                sessionId: session.id,
            }
        }
        if (args === 'list') {
            return {
                handled: true,
                response: formatModelList(agent),
                sessionId: session.id,
            }
        }
        if (agent === 'claude' && !CLAUDE_MODEL_MODES.includes(args as ModelMode)) {
            return {
                handled: true,
                response: 'Claude 仅支持：default / sonnet / opus。发送 /model list 查看可用值。',
                sessionId: session.id,
            }
        }
        try {
            await deps.engine.applySessionConfig(session.id, agent === 'claude'
                ? { modelMode: args as ModelMode }
                : { model: args })
            return {
                handled: true,
                response: [
                    '已切换模型。',
                    `当前会话：${formatSessionLabel(session)} (${session.id.slice(0, 8)})`,
                    `Agent: ${agent}`,
                    `当前模型：${args}`,
                    '仅对后续消息生效。',
                ].join('\n'),
                sessionId: session.id,
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : '切换模型失败'
            return { handled: true, response: `切换模型失败：${message}` }
        }
    }

    if (command === '/pwd') {
        const resolved = getActiveSessionForModelCommand(deps, context)
        if (!resolved.ok) {
            return { handled: true, response: resolved.error }
        }
        return {
            handled: true,
            response: [
                `当前会话：${formatSessionLabel(resolved.session)} (${resolved.session.id.slice(0, 8)})`,
                `目录：${formatWorkingDirectory(resolved.session)}`
            ].join('\n'),
            sessionId: resolved.session.id,
        }
    }

    if (command === '/sessions') {
        return {
            handled: true,
            response: unifiedTargets.length === 0
                ? '当前没有可用目标。发送 /new 创建一个新的会话。'
                : [
                    '最近目标：',
                    ...unifiedTargets.slice(0, 10).flatMap((target, index) => {
                        const lines = formatUnifiedTargetListItem(target, index, {
                            type: state?.activeTargetType ?? (state?.activeSessionId ? 'session' : null),
                            id: state?.activeTargetType === 'room'
                                ? (state.activeRoomId ?? null)
                                : (state?.activeSessionId ?? null),
                        }).split('\n')
                        return index === 0 ? lines : ['', ...lines]
                    }),
                    '',
                    '发送 /use <编号> 切换目标。'
                ].join('\n')
        }
    }

    if (command === '/groups') {
        return await routeFeishuCommand(deps, context, '/sessions', helpers)
    }

    if (command === '/use') {
        const targetId = resolveSessionTarget(args, unifiedTargets.map((target) => target.id))
        if (!targetId) {
            return { handled: true, response: '用法：/use <编号|目标ID前缀>' }
        }
        const target = unifiedTargets.find((entry) => entry.id === targetId) ?? null
        if (!target) {
            return { handled: true, response: '目标不存在或无权访问。' }
        }
        if (target.type === 'room') {
            deps.repository.setSessionState({
                openId: context.openId,
                namespace: context.namespace,
                activeRoomId: target.data.id,
                activeTargetType: 'room',
            })
            return {
                handled: true,
                response: formatSwitchRoomResponse(target.data, deps, context.namespace),
                roomId: target.data.id,
            }
        }
        deps.repository.setSessionState({
            openId: context.openId,
            namespace: context.namespace,
            activeSessionId: target.data.id,
            activeTargetType: 'session',
            activeMachineId: deps.engine.getSessionByNamespace(target.data.id, context.namespace)?.metadata?.machineId ?? state?.activeMachineId ?? null,
        })
        return {
            handled: true,
            response: formatSwitchSessionResponse(target.data, deps, context.namespace),
            sessionId: target.data.id
        }
    }

    if (command === '/use-group') {
        return await routeFeishuCommand(deps, context, `/use ${args}`, helpers)
    }

    if (command === '/new') {
        if (!deps.autoCreateSession) {
            return { handled: true, response: '当前未启用飞书自动创建会话。' }
        }
        const parsedNewArgs = parseNewSessionArgs(args)
        if (parsedNewArgs.error) {
            return { handled: true, response: parsedNewArgs.error }
        }
        const created = await helpers.createSession({
            namespace: context.namespace,
            preferredMachineId: state?.activeMachineId ?? deps.defaultMachineId,
            agent: parsedNewArgs.agent,
            directory: parsedNewArgs.directory,
        })
        deps.repository.setSessionState({
            openId: context.openId,
            namespace: context.namespace,
            activeSessionId: created.sessionId,
            activeTargetType: 'session',
            activeMachineId: created.machineId,
        })
        return {
            handled: true,
            response: formatNewSessionResponse({
                sessionId: created.sessionId,
                agent: parsedNewArgs.agent ?? 'claude',
                directory: parsedNewArgs.directory,
            }),
            sessionId: created.sessionId
        }
    }

    if (command === '/web') {
        const sessionId = state?.activeSessionId ?? null
        const baseUrl = deps.publicUrl.replace(/\/+$/, '')
        const token = encodeURIComponent(`${deps.accessToken}:${context.namespace}`)
        const target = sessionId
            ? `${baseUrl}/sessions/${sessionId}?token=${token}`
            : `${baseUrl}/?token=${token}`
        return {
            handled: true,
            response: `打开 Web：\n${target}`,
            sessionId: sessionId ?? undefined
        }
    }

    return { handled: true, response: '未知命令。发送 /help 查看可用命令。' }
}
