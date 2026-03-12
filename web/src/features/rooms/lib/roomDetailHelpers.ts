import type { Room, RoomRole, RoomRoleTemplate } from '@/types/api'
import { slugifyRoleTemplateKey, type RoleTemplateDraft } from '@/components/rooms/roleTemplates'

export type AgentFlavor = 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
export type InviteMode = 'unassigned' | 'existing_session' | 'spawn_new'
export type InvitePresetKey = 'planner' | 'coder' | 'reviewer' | 'researcher' | 'custom'

export const INVITE_AGENT_ROLE_PRESETS: Record<InvitePresetKey, {
    label: string
    key: string
    description: string
    preferredFlavor?: AgentFlavor
}> = {
    planner: {
        label: 'Planner',
        key: 'planner',
        description: 'Break down the goal, assign work, and coordinate handoffs.',
        preferredFlavor: 'claude',
    },
    coder: {
        label: 'Coder',
        key: 'coder',
        description: 'Implement code changes and report results back into the room.',
        preferredFlavor: 'codex',
    },
    reviewer: {
        label: 'Reviewer',
        key: 'reviewer',
        description: 'Review outputs, validate quality, and request fixes when needed.',
        preferredFlavor: 'claude',
    },
    researcher: {
        label: 'Researcher',
        key: 'researcher',
        description: 'Collect evidence, compare options, and summarize findings for the room.',
        preferredFlavor: 'claude',
    },
    custom: {
        label: 'Custom role',
        key: 'agent',
        description: 'Define a custom role and bring a session into the room.',
    },
}

export function statusColor(status: string): string {
    if (status === 'completed') return 'text-emerald-600'
    if (status === 'in_progress') return 'text-[var(--app-link)]'
    if (status === 'blocked') return 'text-red-600'
    return 'text-[var(--app-hint)]'
}

function slugifyMentionAlias(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

export function buildUniqueRoleKey(value: string, roles: RoomRole[]): string {
    const base = slugifyMentionAlias(value).replace(/-/g, '_') || 'agent'
    const existing = new Set(roles.map((role) => role.key.toLowerCase()))
    if (!existing.has(base.toLowerCase())) {
        return base
    }
    let counter = 2
    while (existing.has(`${base}_${counter}`.toLowerCase())) {
        counter += 1
    }
    return `${base}_${counter}`
}

export function createInviteDraft(presetKey: InvitePresetKey, roles: RoomRole[]) {
    const preset = INVITE_AGENT_ROLE_PRESETS[presetKey]
    return {
        presetKey,
        mode: 'spawn_new' as InviteMode,
        label: preset.label,
        key: buildUniqueRoleKey(preset.key, roles),
        description: preset.description,
        preferredFlavor: preset.preferredFlavor,
        existingSessionId: '',
        machineId: '',
        directory: '',
        agent: preset.preferredFlavor ?? 'claude',
    }
}

export function groupTasksByStatus(tasks: Room['state']['tasks']) {
    const order = ['pending', 'in_progress', 'blocked', 'completed'] as const
    return order.map((status) => ({
        status,
        tasks: tasks.filter((task) => task.status === status),
    }))
}

export function snapshotRoleTemplate(room: Room, label: string, description?: string): RoleTemplateDraft {
    return {
        key: slugifyRoleTemplateKey(label),
        label,
        description,
        roles: room.state.roles.map((role, index) => ({
            key: role.key,
            label: role.label,
            description: role.description,
            required: role.required,
            preferredFlavor: role.preferredFlavor,
            preferredModel: role.preferredModel,
            permissionMode: role.permissionMode,
            sortOrder: role.sortOrder ?? index,
        })),
    }
}

export type SavedRoleTemplate = RoomRoleTemplate | RoleTemplateDraft
