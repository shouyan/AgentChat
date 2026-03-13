import { getPermissionModesForFlavor, isModelModeAllowedForFlavor, isPermissionModeAllowedForFlavor } from '@agentchat/protocol'
import { ModelModeSchema } from '@agentchat/protocol/schemas'
import type { Session } from '../../sync/syncEngine'

export function mapResumeErrorCodeToStatus(code: string) {
    return code === 'no_machine_online' ? 503
        : code === 'access_denied' ? 403
            : code === 'session_not_found' ? 404
                : 500
}

export function validatePermissionModeForSession(session: Session, mode: Parameters<typeof isPermissionModeAllowedForFlavor>[0]) {
    const flavor = session.metadata?.flavor ?? 'claude'
    const allowedModes = getPermissionModesForFlavor(flavor)
    if (allowedModes.length === 0) {
        return { ok: false as const, error: 'Permission mode not supported for session flavor' }
    }
    if (!isPermissionModeAllowedForFlavor(mode, flavor)) {
        return { ok: false as const, error: 'Invalid permission mode for session flavor' }
    }
    return { ok: true as const }
}

export function validateModelModeForSession(session: Session, model: string) {
    const flavor = session.metadata?.flavor ?? 'claude'
    if (flavor === 'claude') {
        const parsed = ModelModeSchema.safeParse(model)
        if (!parsed.success || !isModelModeAllowedForFlavor(parsed.data, flavor)) {
            return { ok: false as const, error: 'Invalid Claude model mode' }
        }
        return { ok: true as const, type: 'mode' as const, value: parsed.data }
    }
    if (flavor === 'codex' || flavor === 'gemini') {
        const trimmed = model.trim()
        if (!trimmed) {
            return { ok: false as const, error: 'Model is required' }
        }
        return { ok: true as const, type: 'model' as const, value: trimmed }
    }
    return { ok: false as const, error: 'In-session model switching is only supported for Claude, Codex, and Gemini sessions' }
}
