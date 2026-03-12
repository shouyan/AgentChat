import { getPermissionModesForFlavor, isModelModeAllowedForFlavor, isPermissionModeAllowedForFlavor } from '@hapi/protocol'
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

export function validateModelModeForSession(session: Session, model: Parameters<typeof isModelModeAllowedForFlavor>[0]) {
    const flavor = session.metadata?.flavor ?? 'claude'
    if (!isModelModeAllowedForFlavor(model, flavor)) {
        return { ok: false as const, error: 'Model mode is only supported for Claude sessions' }
    }
    return { ok: true as const }
}
