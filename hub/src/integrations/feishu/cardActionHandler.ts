import { createHash } from 'node:crypto'
import { AESCipher, type InteractiveCard } from '@larksuiteoapi/node-sdk'
import type { SyncEngine } from '../../sync/syncEngine'
import {
    applyPermissionAction,
    buildPermissionCard,
    buildStatusCard,
    isQuestionPermissionRequest,
    listPendingPermissionsForSession,
    supportsPermissionAction,
    type FeishuPendingPermission,
    type FeishuPermissionActionName,
} from './permissions'
import type { FeishuRepositoryLike } from './types'

export const FEISHU_CARD_CALLBACK_PATH = '/feishu/card'

type CardActionHandleResult = {
    status: number
    body: Record<string, unknown> | InteractiveCard
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function extractString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeHeaders(headers: Headers | Record<string, string | undefined>): Record<string, string> {
    const normalized: Record<string, string> = {}
    if (headers instanceof Headers) {
        headers.forEach((value, key) => {
            normalized[key.toLowerCase()] = value
        })
        return normalized
    }

    for (const [key, value] of Object.entries(headers)) {
        if (typeof value === 'string') {
            normalized[key.toLowerCase()] = value
        }
    }
    return normalized
}

function decryptPayload(body: Record<string, unknown>, encryptKey: string | null): Record<string, unknown> {
    const encrypted = extractString(body.encrypt)
    if (!encrypted) {
        return body
    }
    if (!encryptKey) {
        throw new Error('Feishu encrypted callback received but FEISHU_CARD_ENCRYPT_KEY is not configured')
    }
    const decrypted = new AESCipher(encryptKey).decrypt(encrypted)
    const parsed = JSON.parse(decrypted)
    if (!isRecord(parsed)) {
        throw new Error('Feishu encrypted callback payload is invalid')
    }
    const { encrypt: _ignored, ...rest } = body
    return { ...parsed, ...rest }
}

function flattenPayload(payload: Record<string, unknown>): Record<string, unknown> {
    if (isRecord(payload.header) && isRecord(payload.event)) {
        const { header, event, ...rest } = payload
        return {
            __eventType: extractString(header.event_type),
            ...rest,
            ...header,
            ...event,
        }
    }

    if (isRecord(payload.event)) {
        const { event, ...rest } = payload
        return {
            __eventType: extractString(event.type),
            ...rest,
            ...event,
        }
    }

    return payload
}

function computeSha1(input: string): string {
    return createHash('sha1').update(input).digest('hex')
}

function computeSha256(input: string): string {
    return createHash('sha256').update(input).digest('hex')
}

function isSignatureValid(
    body: Record<string, unknown>,
    headers: Record<string, string>,
    verificationToken: string | null,
    encryptKey: string | null
): boolean {
    const timestamp = headers['x-lark-request-timestamp'] ?? ''
    const nonce = headers['x-lark-request-nonce'] ?? ''
    const signature = headers['x-lark-signature'] ?? ''

    if ('encrypt' in body || 'schema' in body) {
        if (!encryptKey) {
            return true
        }
        return computeSha256(`${timestamp}${nonce}${encryptKey}${JSON.stringify(body)}`) === signature
    }

    if (!verificationToken) {
        return true
    }

    return computeSha1(`${timestamp}${nonce}${verificationToken}${JSON.stringify(body)}`) === signature
}

function extractOpenId(payload: Record<string, unknown>): string | null {
    const direct = extractString(payload.open_id)
    if (direct) {
        return direct
    }
    const operator = isRecord(payload.operator) ? payload.operator : null
    if (!operator) {
        return null
    }
    const operatorId = isRecord(operator.operator_id) ? operator.operator_id : null
    return extractString(operatorId?.open_id) ?? extractString(operator.open_id)
}

function resolvePending(sessionId: string, requestId: string, engine: SyncEngine, namespace: string): FeishuPendingPermission | null {
    const session = engine.getSessionByNamespace(sessionId, namespace)
    if (!session || !session.active) {
        return null
    }
    return listPendingPermissionsForSession(session).find((entry) => entry.requestId === requestId) ?? null
}

function formatActionSummary(action: FeishuPermissionActionName): string {
    if (action === 'approve') {
        return '已同意本次请求。'
    }
    if (action === 'approve_for_session') {
        return '已对本会话放行同类请求。'
    }
    if (action === 'approve_all_edits') {
        return '已允许后续编辑类请求。'
    }
    if (action === 'abort') {
        return '已中止本次请求。'
    }
    return '已拒绝本次请求。'
}

export class FeishuCardActionHandler {
    constructor(
        private readonly deps: {
            engine: SyncEngine
            repository: FeishuRepositoryLike
            publicUrl: string
            accessToken: string
            verificationToken?: string | null
            encryptKey?: string | null
        }
    ) {
    }

    async handlePayload(
        payload: unknown,
        headersInput: Headers | Record<string, string | undefined>
    ): Promise<CardActionHandleResult> {
        if (!isRecord(payload)) {
            return {
                status: 400,
                body: { error: 'Invalid Feishu callback payload' },
            }
        }

        let decrypted: Record<string, unknown>
        try {
            decrypted = decryptPayload(payload, this.deps.encryptKey ?? null)
        } catch (error) {
            return {
                status: 400,
                body: { error: error instanceof Error ? error.message : String(error) },
            }
        }

        if (extractString(decrypted.type) === 'url_verification') {
            return {
                status: 200,
                body: {
                    challenge: extractString(decrypted.challenge) ?? '',
                },
            }
        }

        const headers = normalizeHeaders(headersInput)
        if (!isSignatureValid(payload, headers, this.deps.verificationToken ?? null, this.deps.encryptKey ?? null)) {
            return {
                status: 401,
                body: { error: 'Invalid Feishu callback signature' },
            }
        }

        const flattened = flattenPayload(decrypted)
        const eventType = extractString(flattened.__eventType)
        if (eventType && eventType !== 'card.action.trigger') {
            return {
                status: 200,
                body: buildStatusCard('忽略的飞书回调', `暂不处理事件类型：${eventType}`),
            }
        }

        const openId = extractOpenId(flattened)
        if (!openId || !this.deps.repository.isOpenIdAllowed(openId)) {
            return {
                status: 200,
                body: buildStatusCard('无权操作', '当前飞书账号没有权限处理该审批。'),
            }
        }

        const namespace = this.deps.repository.resolveNamespaceForOpenId(openId)
        if (!namespace) {
            return {
                status: 200,
                body: buildStatusCard('未绑定 namespace', '请先完成飞书账号与 AgentChat namespace 的绑定。'),
            }
        }

        const action = isRecord(flattened.action) ? flattened.action : null
        const value = action && isRecord(action.value) ? action.value : null
        if (!value || extractString(value.kind) !== 'permission_action') {
            return {
                status: 200,
                body: buildStatusCard('无法识别的动作', '当前卡片动作不是 AgentChat 权限审批动作。'),
            }
        }

        const sessionId = extractString(value.sessionId)
        const requestId = extractString(value.requestId)
        const actionName = extractString(value.action) as FeishuPermissionActionName | null
        if (!sessionId || !requestId || !actionName) {
            return {
                status: 200,
                body: buildStatusCard('动作参数不完整', '卡片缺少 sessionId / requestId / action。'),
            }
        }

        const pending = resolvePending(sessionId, requestId, this.deps.engine, namespace)
        if (!pending) {
            return {
                status: 200,
                body: buildStatusCard('请求已处理', '该权限请求已经不存在，可能已在 Web 或其他端完成审批。'),
            }
        }

        if (isQuestionPermissionRequest(pending.request)) {
            return {
                status: 200,
                body: buildPermissionCard(pending, {
                    publicUrl: this.deps.publicUrl,
                    accessToken: this.deps.accessToken,
                    state: 'unsupported',
                    summary: '该请求需要结构化回答，请改用 Web 端完成。',
                }),
            }
        }

        if (!supportsPermissionAction(pending, actionName) && actionName !== 'deny') {
            return {
                status: 200,
                body: buildPermissionCard(pending, {
                    publicUrl: this.deps.publicUrl,
                    accessToken: this.deps.accessToken,
                    state: 'error',
                    summary: '当前请求不支持该审批动作。',
                }),
            }
        }

        try {
            await applyPermissionAction(this.deps.engine, pending, actionName)
            return {
                status: 200,
                body: buildPermissionCard(pending, {
                    publicUrl: this.deps.publicUrl,
                    accessToken: this.deps.accessToken,
                    state: actionName === 'deny' || actionName === 'abort' ? 'denied' : 'approved',
                    summary: formatActionSummary(actionName),
                }),
            }
        } catch (error) {
            return {
                status: 200,
                body: buildPermissionCard(pending, {
                    publicUrl: this.deps.publicUrl,
                    accessToken: this.deps.accessToken,
                    state: 'error',
                    summary: error instanceof Error ? error.message : String(error),
                }),
            }
        }
    }
}
