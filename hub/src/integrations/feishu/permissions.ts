import { safeStringify } from '@agentchat/protocol'
import type { AgentStateRequest } from '@agentchat/protocol/types'
import type { InteractiveCard } from '@larksuiteoapi/node-sdk'
import { getAgentName, getSessionName } from '../../notifications/sessionInfo'
import type { Room, Session, SyncEngine } from '../../sync/syncEngine'

export type FeishuPermissionActionName = 'approve' | 'approve_for_session' | 'approve_all_edits' | 'deny' | 'abort'

export type FeishuPendingPermission = {
    session: Session
    sessionId: string
    sessionName: string
    requestId: string
    request: AgentStateRequest
    source: {
        type: 'session' | 'room'
        roomId?: string
        roomName?: string
    }
}

export type FeishuPermissionAction = {
    name: FeishuPermissionActionName
    label: string
    tone: 'primary' | 'default' | 'danger'
}

type FeishuPermissionCardState = {
    title: string
    template: 'blue' | 'wathet' | 'turquoise' | 'green' | 'yellow' | 'orange' | 'red' | 'carmine' | 'violet' | 'purple' | 'indigo' | 'grey'
    summary: string
    extraNote?: string | null
}

const QUESTION_TOOL_NAMES = new Set(['AskUserQuestion', 'ask_user_question', 'request_user_input'])
const EDIT_TOOL_NAMES = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

function truncateText(text: string, maxLength: number): string {
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

function escapeCardMarkdown(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pickRoomSessionIds(room: Room): string[] {
    const sessionIds = new Set<string>()

    for (const role of room.state.roles ?? []) {
        if (role.assignedSessionId) {
            sessionIds.add(role.assignedSessionId)
        }
    }

    for (const task of room.state.tasks ?? []) {
        if (task.assigneeSessionId) {
            sessionIds.add(task.assigneeSessionId)
        }
    }

    return Array.from(sessionIds)
}

export function isCodexFamilyFlavor(flavor?: string | null): boolean {
    return flavor === 'codex' || flavor === 'gemini' || flavor === 'opencode'
}

export function isQuestionPermissionRequest(request: AgentStateRequest): boolean {
    return QUESTION_TOOL_NAMES.has(request.tool)
}

export function isEditPermissionRequest(request: AgentStateRequest): boolean {
    return EDIT_TOOL_NAMES.has(request.tool)
}

export function buildPermissionRequestPreview(request: AgentStateRequest): string | null {
    if (request.tool === 'Bash' && isRecord(request.arguments) && typeof request.arguments.command === 'string') {
        return truncateText(request.arguments.command, 220)
    }

    if (isRecord(request.arguments)) {
        for (const key of ['path', 'file_path', 'target_file', 'directory', 'prompt', 'query', 'message']) {
            const value = request.arguments[key]
            if (typeof value === 'string' && value.trim()) {
                return truncateText(value, 220)
            }
        }
    }

    try {
        const serialized = safeStringify(request.arguments)
        if (!serialized || serialized === 'null' || serialized === 'undefined') {
            return null
        }
        return truncateText(serialized, 220)
    } catch {
        return null
    }
}

function buildToolIdentifier(request: AgentStateRequest): string | null {
    if (request.tool === 'Bash') {
        if (isRecord(request.arguments) && typeof request.arguments.command === 'string' && request.arguments.command.trim()) {
            return `Bash(${request.arguments.command.trim()})`
        }
        return null
    }
    return request.tool.trim() || null
}

function comparePending(left: FeishuPendingPermission, right: FeishuPendingPermission): number {
    const leftCreatedAt = left.request.createdAt ?? 0
    const rightCreatedAt = right.request.createdAt ?? 0
    if (leftCreatedAt !== rightCreatedAt) {
        return leftCreatedAt - rightCreatedAt
    }
    if (left.session.updatedAt !== right.session.updatedAt) {
        return right.session.updatedAt - left.session.updatedAt
    }
    return left.requestId.localeCompare(right.requestId)
}

export function listPendingPermissionsForSession(session: Session, source?: FeishuPendingPermission['source']): FeishuPendingPermission[] {
    const requests = session.agentState?.requests ?? {}
    return Object.entries(requests)
        .map(([requestId, request]): FeishuPendingPermission => ({
            session,
            sessionId: session.id,
            sessionName: getSessionName(session),
            requestId,
            request,
            source: source ?? { type: 'session' },
        }))
        .sort(comparePending)
}

export function listPendingPermissionsForRoom(engine: SyncEngine, roomId: string, namespace: string): FeishuPendingPermission[] {
    const room = engine.getRoomByNamespace(roomId, namespace)
    if (!room) {
        return []
    }

    const source: FeishuPendingPermission['source'] = {
        type: 'room',
        roomId: room.id,
        roomName: room.metadata.name,
    }

    return pickRoomSessionIds(room)
        .flatMap((sessionId) => {
            const session = engine.getSessionByNamespace(sessionId, namespace)
            return session ? listPendingPermissionsForSession(session, source) : []
        })
        .sort(comparePending)
}

export function listPendingPermissionsForNamespace(engine: SyncEngine, namespace: string): FeishuPendingPermission[] {
    return engine.getSessionsByNamespace(namespace)
        .flatMap((session) => listPendingPermissionsForSession(session))
        .sort(comparePending)
}

export function resolvePendingPermission(
    pending: FeishuPendingPermission[],
    rawTarget: string | null
): { pending: FeishuPendingPermission | null; error?: string } {
    if (pending.length === 0) {
        return { pending: null, error: '当前没有待审批请求。' }
    }

    const target = rawTarget?.trim() ?? ''
    if (!target) {
        if (pending.length === 1) {
            return { pending: pending[0] ?? null }
        }
        return {
            pending: null,
            error: `当前共有 ${pending.length} 个待审批请求；先发 /permissions 查看编号，再用 /approve <编号>。`
        }
    }

    const normalized = target.toLowerCase()
    if (normalized === 'current' || normalized === 'latest') {
        const latest = pending.reduce<FeishuPendingPermission | null>((selected, entry) => {
            if (!selected) {
                return entry
            }
            const selectedCreatedAt = selected.request.createdAt ?? 0
            const entryCreatedAt = entry.request.createdAt ?? 0
            if (entryCreatedAt !== selectedCreatedAt) {
                return entryCreatedAt > selectedCreatedAt ? entry : selected
            }
            return entry.session.updatedAt > selected.session.updatedAt ? entry : selected
        }, null)
        return { pending: latest }
    }

    const asIndex = Number(target)
    if (Number.isFinite(asIndex) && asIndex >= 1 && asIndex <= pending.length) {
        return { pending: pending[asIndex - 1] ?? null }
    }

    const exactRequest = pending.find((entry) => entry.requestId === target)
    if (exactRequest) {
        return { pending: exactRequest }
    }

    const prefixMatches = pending.filter((entry) => entry.requestId.startsWith(target))
    if (prefixMatches.length === 1) {
        return { pending: prefixMatches[0] ?? null }
    }
    if (prefixMatches.length > 1) {
        return { pending: null, error: 'requestId 前缀匹配到多个请求，请改用编号。' }
    }

    return { pending: null, error: '找不到对应的待审批请求。' }
}

export function getAvailablePermissionActions(pending: FeishuPendingPermission): FeishuPermissionAction[] {
    if (isQuestionPermissionRequest(pending.request)) {
        return []
    }

    if (isCodexFamilyFlavor(pending.session.metadata?.flavor)) {
        return [
            { name: 'approve', label: '同意', tone: 'primary' },
            { name: 'approve_for_session', label: '本会话同意', tone: 'default' },
            { name: 'abort', label: '中止', tone: 'danger' },
        ]
    }

    if (isEditPermissionRequest(pending.request)) {
        return [
            { name: 'approve', label: '同意', tone: 'primary' },
            { name: 'approve_all_edits', label: '允许后续编辑', tone: 'default' },
            { name: 'deny', label: '拒绝', tone: 'danger' },
        ]
    }

    return [
        { name: 'approve', label: '同意', tone: 'primary' },
        { name: 'approve_for_session', label: '本会话同意', tone: 'default' },
        { name: 'deny', label: '拒绝', tone: 'danger' },
    ]
}

export function supportsPermissionAction(pending: FeishuPendingPermission, actionName: FeishuPermissionActionName): boolean {
    if (actionName === 'deny') {
        return !isQuestionPermissionRequest(pending.request)
    }
    return getAvailablePermissionActions(pending).some((action) => action.name === actionName)
}

export async function applyPermissionAction(
    engine: SyncEngine,
    pending: FeishuPendingPermission,
    actionName: FeishuPermissionActionName
): Promise<void> {
    if (isQuestionPermissionRequest(pending.request)) {
        throw new Error('该请求需要结构化回答；请改用 Web 端完成。')
    }

    if (actionName === 'approve') {
        if (isCodexFamilyFlavor(pending.session.metadata?.flavor)) {
            await engine.approvePermission(pending.sessionId, pending.requestId, undefined, undefined, 'approved')
            return
        }
        await engine.approvePermission(pending.sessionId, pending.requestId)
        return
    }

    if (actionName === 'approve_for_session') {
        if (isCodexFamilyFlavor(pending.session.metadata?.flavor)) {
            await engine.approvePermission(pending.sessionId, pending.requestId, undefined, undefined, 'approved_for_session')
            return
        }
        const toolIdentifier = buildToolIdentifier(pending.request)
        if (!toolIdentifier) {
            throw new Error('当前请求缺少可复用的工具标识，无法做会话级放行。')
        }
        await engine.approvePermission(pending.sessionId, pending.requestId, undefined, [toolIdentifier])
        return
    }

    if (actionName === 'approve_all_edits') {
        if (!isEditPermissionRequest(pending.request)) {
            throw new Error('只有编辑类请求才支持“允许后续编辑”。')
        }
        await engine.approvePermission(pending.sessionId, pending.requestId, 'acceptEdits')
        return
    }

    if (actionName === 'abort') {
        await engine.denyPermission(pending.sessionId, pending.requestId, 'abort')
        return
    }

    if (actionName === 'deny') {
        await engine.denyPermission(
            pending.sessionId,
            pending.requestId,
            isCodexFamilyFlavor(pending.session.metadata?.flavor) ? 'denied' : undefined
        )
        return
    }

    throw new Error(`未知审批动作：${actionName}`)
}

function buildWebSessionUrl(sessionId: string, publicUrl: string, accessToken: string, namespace: string): string {
    const token = encodeURIComponent(`${accessToken}:${namespace}`)
    return `${publicUrl.replace(/\/+$/, '')}/sessions/${sessionId}?token=${token}`
}

function formatPendingLabel(pending: FeishuPendingPermission): string {
    const sourceLabel = pending.source.type === 'room' && pending.source.roomName
        ? `群组 ${pending.source.roomName}`
        : '会话'
    return `${sourceLabel} ${pending.sessionName} · ${pending.request.tool}`
}

function buildCardState(
    pending: FeishuPendingPermission,
    options?: {
        status?: 'pending' | 'approved' | 'denied' | 'error' | 'unsupported'
        summary?: string
        extraNote?: string | null
    }
): FeishuPermissionCardState {
    const status = options?.status ?? 'pending'
    if (status === 'approved') {
        return {
            title: `已批准 · ${pending.request.tool}`,
            template: 'green',
            summary: options?.summary ?? '飞书审批已提交。',
            extraNote: options?.extraNote ?? null,
        }
    }
    if (status === 'denied') {
        return {
            title: `已拒绝 · ${pending.request.tool}`,
            template: 'red',
            summary: options?.summary ?? '飞书审批已提交。',
            extraNote: options?.extraNote ?? null,
        }
    }
    if (status === 'unsupported') {
        return {
            title: `需 Web 处理 · ${pending.request.tool}`,
            template: 'grey',
            summary: options?.summary ?? '该请求需要结构化回答，暂不支持直接在飞书卡片内完成。',
            extraNote: options?.extraNote ?? null,
        }
    }
    if (status === 'error') {
        return {
            title: `处理失败 · ${pending.request.tool}`,
            template: 'red',
            summary: options?.summary ?? '飞书审批处理失败。',
            extraNote: options?.extraNote ?? null,
        }
    }
    return {
        title: `权限请求 · ${pending.request.tool}`,
        template: 'orange',
        summary: options?.summary ?? 'Agent 正在等待你的审批。',
        extraNote: options?.extraNote ?? null,
    }
}

export function buildPermissionCard(
    pending: FeishuPendingPermission,
    input: {
        publicUrl: string
        accessToken: string
        state?: 'pending' | 'approved' | 'denied' | 'error' | 'unsupported'
        summary?: string
        extraNote?: string | null
    }
): InteractiveCard {
    const preview = buildPermissionRequestPreview(pending.request)
    const cardState = buildCardState(pending, {
        status: input.state,
        summary: input.summary,
        extraNote: input.extraNote,
    })
    const actions = input.state === 'pending'
        ? getAvailablePermissionActions(pending)
        : []
    const webUrl = buildWebSessionUrl(pending.sessionId, input.publicUrl, input.accessToken, pending.session.namespace)
    const sourceText = pending.source.type === 'room' && pending.source.roomName
        ? `群组：${pending.source.roomName}`
        : '来源：会话'
    const elements: NonNullable<InteractiveCard['elements']> = [
        {
            tag: 'div',
            text: {
                tag: 'plain_text',
                content: ' ',
            },
            fields: [
                {
                    is_short: true,
                    text: {
                        tag: 'lark_md',
                        content: `**Agent**\n${escapeCardMarkdown(getAgentName(pending.session))}`,
                    },
                },
                {
                    is_short: true,
                    text: {
                        tag: 'lark_md',
                        content: `**会话**\n${escapeCardMarkdown(truncateText(pending.sessionName, 40))}`,
                    },
                },
                {
                    is_short: true,
                    text: {
                        tag: 'lark_md',
                        content: `**请求 ID**\n${escapeCardMarkdown(pending.requestId.slice(0, 12))}`,
                    },
                },
                {
                    is_short: true,
                    text: {
                        tag: 'lark_md',
                        content: `**时间**\n${escapeCardMarkdown(formatRelativeTime(pending.request.createdAt ?? pending.session.updatedAt))}`,
                    },
                },
            ],
        },
        {
            tag: 'markdown',
            content: `**摘要**\n${escapeCardMarkdown(cardState.summary)}`,
        },
        {
            tag: 'markdown',
            content: `**${escapeCardMarkdown(sourceText)}**\n${escapeCardMarkdown(formatPendingLabel(pending))}`,
        },
    ]

    if (preview) {
        elements.push({
            tag: 'markdown',
            content: `**参数预览**\n\`${escapeCardMarkdown(preview)}\``,
        })
    }

    if (cardState.extraNote) {
        elements.push({
            tag: 'markdown',
            content: escapeCardMarkdown(cardState.extraNote),
        })
    }

    elements.push({
        tag: 'markdown',
        content: `[打开 Web 详情](${webUrl})`,
    })

    if (actions.length > 0) {
        elements.push({
            tag: 'action',
            actions: actions.map((action) => ({
                tag: 'button',
                type: action.tone,
                text: {
                    tag: 'plain_text',
                    content: action.label,
                },
                value: {
                    kind: 'permission_action',
                    sessionId: pending.sessionId,
                    requestId: pending.requestId,
                    action: action.name,
                },
            })),
        })
    }

    return {
        config: {
            wide_screen_mode: true,
            enable_forward: false,
        },
        header: {
            title: {
                tag: 'plain_text',
                content: cardState.title,
            },
            template: cardState.template,
        },
        elements,
    }
}

export function buildStatusCard(title: string, summary: string, note?: string | null): InteractiveCard {
    const elements: NonNullable<InteractiveCard['elements']> = [
        {
            tag: 'markdown',
            content: escapeCardMarkdown(summary),
        }
    ]

    if (note) {
        elements.push({
            tag: 'markdown',
            content: escapeCardMarkdown(note),
        })
    }

    return {
        config: {
            wide_screen_mode: true,
            enable_forward: false,
        },
        header: {
            title: {
                tag: 'plain_text',
                content: title,
            },
            template: 'grey',
        },
        elements,
    }
}

export function formatPendingPermissionsText(pending: FeishuPendingPermission[]): string {
    if (pending.length === 0) {
        return '当前没有待审批请求。'
    }

    const lines = pending.slice(0, 10).flatMap((entry, index) => {
        const head = `${index + 1}. ${formatPendingLabel(entry)}`
        const meta = [`${entry.requestId.slice(0, 12)}`, formatRelativeTime(entry.request.createdAt ?? entry.session.updatedAt)]
        const preview = buildPermissionRequestPreview(entry.request)
        return [
            head,
            `   ${meta.join(' · ')}`,
            ...(preview ? [`   ${preview}`] : []),
            ...(isQuestionPermissionRequest(entry.request)
                ? ['   该请求需要结构化回答，请转到 Web 端处理。']
                : []),
        ]
    })

    return [
        '待审批请求：',
        ...lines,
        '',
        '发送 /approve <编号> 同意，/deny <编号> 拒绝。',
        '补充：/approve <编号> session（会话级放行）、/approve <编号> edits（编辑类连续放行）、/abort <编号>。',
    ].join('\n')
}
