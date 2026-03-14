import { safeStringify } from '@agentchat/protocol'
import { unwrapRoleWrappedRecordEnvelope } from '@agentchat/protocol/messages'
import type { DecryptedMessage } from '@agentchat/protocol/types'

function extractTextBlocks(content: unknown): string[] {
    if (typeof content === 'string') {
        return content.trim() ? [content.trim()] : []
    }
    if (!content || typeof content !== 'object') {
        return []
    }

    const record = content as Record<string, unknown>
    if (record.type === 'output') {
        const data = record.data
        if (!data || typeof data !== 'object') {
            return []
        }
        const typedData = data as Record<string, unknown>
        if (typedData.type === 'summary' && typeof typedData.summary === 'string') {
            return typedData.summary.trim() ? [typedData.summary.trim()] : []
        }
        const message = typedData.message
        if (!message || typeof message !== 'object') {
            return []
        }
        const messageRecord = message as Record<string, unknown>
        const messageContent = messageRecord.content
        if (typeof messageContent === 'string') {
            return messageContent.trim() ? [messageContent.trim()] : []
        }
        if (!Array.isArray(messageContent)) {
            return []
        }
        const blocks: string[] = []
        for (const block of messageContent) {
            if (!block || typeof block !== 'object') continue
            const typedBlock = block as Record<string, unknown>
            if (typedBlock.type === 'text' && typeof typedBlock.text === 'string' && typedBlock.text.trim()) {
                blocks.push(typedBlock.text.trim())
            }
        }
        return blocks
    }

    if (record.type === 'codex') {
        const data = record.data
        if (!data || typeof data !== 'object') {
            return []
        }
        const typedData = data as Record<string, unknown>
        if ((typedData.type === 'message' || typedData.type === 'reasoning') && typeof typedData.message === 'string' && typedData.message.trim()) {
            return [typedData.message.trim()]
        }
    }

    return []
}

export function extractReadableTextFromMessage(message: DecryptedMessage, options?: { roles?: string[] }): string | null {
    const record = unwrapRoleWrappedRecordEnvelope(message.content)
    if (!record) {
        return null
    }
    if (options?.roles?.length && !options.roles.includes(record.role)) {
        return null
    }
    if (record.content && typeof record.content === 'object') {
        const contentRecord = record.content as Record<string, unknown>
        if (contentRecord.type === 'text' && typeof contentRecord.text === 'string' && contentRecord.text.trim()) {
            return contentRecord.text.trim()
        }
    }
    const blocks = extractTextBlocks(record.content)
    if (blocks.length > 0) {
        return blocks.join('\n\n').trim()
    }
    return null
}

export function extractAssistantTextFromMessage(message: DecryptedMessage): string | null {
    return extractReadableTextFromMessage(message, { roles: ['agent', 'assistant'] })
}

export function extractErrorTextFromMessage(message: DecryptedMessage): string | null {
    const record = unwrapRoleWrappedRecordEnvelope(message.content)
    if (!record || !record.content || typeof record.content !== 'object') {
        return null
    }
    const content = record.content as Record<string, unknown>
    if (content.type === 'event' && content.data && typeof content.data === 'object') {
        const data = content.data as Record<string, unknown>
        if (data.type === 'task_failed') {
            const error = typeof data.error === 'string' ? data.error.trim() : ''
            return error || 'Agent 执行失败'
        }
        if (data.type === 'error') {
            const messageText = typeof data.message === 'string' ? data.message.trim() : ''
            return messageText || 'Agent 返回错误事件'
        }
    }
    const readable = extractReadableTextFromMessage(message, { roles: ['agent', 'assistant'] })
    if (readable && /(^|\b)(error|failed|exception|unable to|denied|invalid|missing)\b/i.test(readable)) {
        return readable
    }
    return null
}

export function formatFeishuErrorText(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    const trimmed = message.trim() || '未知错误'
    return ['AgentChat 处理失败：', trimmed].join('\n')
}

export function isReadyEventMessage(message: DecryptedMessage): boolean {
    const record = unwrapRoleWrappedRecordEnvelope(message.content)
    if (!record || !record.content || typeof record.content !== 'object') {
        return false
    }
    const content = record.content as Record<string, unknown>
    if (content.type !== 'event' || !content.data || typeof content.data !== 'object') {
        return false
    }
    const data = content.data as Record<string, unknown>
    return data.type === 'ready'
}

export function formatSessionListText(input: {
    sessions: Array<{ id: string; title: string; updatedAt: number; active: boolean }>
}): string {
    if (input.sessions.length === 0) {
        return '当前没有可用会话。发送 /new 创建一个新的会话。'
    }
    const lines = input.sessions.map((session, index) => {
        const marker = session.active ? '👉' : '  '
        return `${marker} ${index + 1}. ${session.title} (${session.id.slice(0, 8)})`
    })
    return ['最近会话：', ...lines, '发送 /use <编号> 切换会话。'].join('\n')
}

export function formatUnsupportedMessageText(messageType: string): string {
    return `暂不支持飞书 ${messageType} 消息；当前只支持私聊文本消息。`
}

export function formatUnboundUserText(): string {
    return '当前飞书账号没有可用的 AgentChat namespace；请检查 FEISHU_DEFAULT_NAMESPACE、FEISHU_USER_BINDINGS，或写入 users 表(platform=feishu)。'
}

export function formatFeishuHelpText(): string {
    return [
        '欢迎使用 AgentChat 飞书机器人。',
        '',
        '当前支持：',
        '- 私聊机器人直接发送文本',
        '- 查看/切换最近目标（会话 + 群组）',
        '- 查看当前进展',
        '- 新建会话',
        '- 处理权限审批请求',
        '',
        '常用命令：',
        '/help - 查看帮助说明',
        '/progress - 查看当前 active 会话/群组 的最近回复',
        '/sessions - 查看最近目标（会话 + 群组）',
        '/use 1 - 切换到第 1 个目标',
        '/detach - 脱离当前目标',
        '/new - 新建默认会话',
        '/new codex - 新建 Codex 会话',
        '/new gemini - 新建 Gemini 会话',
        '/new /path/to/project - 指定目录新建会话',
        '/model - 查看当前会话模型',
        '/model list - 查看当前 agent 推荐模型',
        '/model <值> - 切换当前会话模型',
        '/permissions - 查看当前目标的待审批请求',
        '/permissions all - 查看整个 namespace 的待审批请求',
        '/approve 1 - 同意第 1 个请求',
        '/approve 1 session - 会话级放行',
        '/approve 1 edits - 编辑类连续放行',
        '/deny 1 - 拒绝第 1 个请求',
        '/abort 1 - 中止第 1 个请求',
        '/pwd - 查看当前会话目录',
        '/status - 查看当前会话状态',
        '/web - 返回当前会话 Web 链接',
        '',
        '新建会话示例：',
        '/new',
        '/new codex',
        '/new gemini',
        '/new agent=codex',
        '/new /Users/name/project',
        '/new codex /Users/name/project',
        '/new agent=codex path=/Users/name/project',
        '',
        '切换模型示例：',
        '/model',
        '/model list',
        '/model gpt-5.4',
        '/model gemini-2.5-pro',
        '/model sonnet',
        '',
        '说明：',
        '- 当前版本仅支持私聊文本消息',
        '- 发送普通文本时，会进入当前 active session',
        '- 如果当前没有 active session，系统会自动创建一个新会话',
        '- /detach 只会清空飞书当前绑定，不会中断原会话/群组本身',
        '- /new 只负责创建会话；模型如需调整，请用 /model',
        '- /pwd 可查看当前 active 会话目录',
        '- 飞书卡片支持直接审批常规权限请求；复杂问答型请求请改用 Web',
        '- 飞书菜单可配置快捷审批：agentchat_permission_approve / agentchat_permission_deny',
    ].join('\n')
}

export function formatBusyFallbackText(sessionId: string, publicUrl: string, accessToken: string, namespace: string): string {
    const token = encodeURIComponent(`${accessToken}:${namespace}`)
    return [
        '消息已发送到 AgentChat，会话仍在处理中。',
        `继续查看：${publicUrl.replace(/\/+$/, '')}/sessions/${sessionId}?token=${token}`,
    ].join('\n')
}

export function formatUnexpectedReplyText(message: DecryptedMessage): string {
    return safeStringify(message.content)
}
