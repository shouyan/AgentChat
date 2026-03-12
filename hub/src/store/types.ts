export type StoredSession = {
    id: string
    tag: string | null
    namespace: string
    machineId: string | null
    createdAt: number
    updatedAt: number
    metadata: unknown | null
    metadataVersion: number
    agentState: unknown | null
    agentStateVersion: number
    todos: unknown | null
    todosUpdatedAt: number | null
    teamState: unknown | null
    teamStateUpdatedAt: number | null
    active: boolean
    activeAt: number | null
    seq: number
}

export type StoredMachine = {
    id: string
    namespace: string
    createdAt: number
    updatedAt: number
    metadata: unknown | null
    metadataVersion: number
    runnerState: unknown | null
    runnerStateVersion: number
    active: boolean
    activeAt: number | null
    seq: number
}

export type StoredMessage = {
    id: string
    sessionId: string
    content: unknown
    createdAt: number
    seq: number
    localId: string | null
}

export type StoredRoom = {
    id: string
    namespace: string
    createdAt: number
    updatedAt: number
    metadata: unknown | null
}

export type StoredRoomRole = {
    id: string
    roomId: string
    namespace: string
    key: string
    label: string
    description: string | null
    required: boolean
    preferredFlavor: string | null
    preferredModel: string | null
    permissionMode: string | null
    assignmentMode: 'existing_session' | 'spawn_new' | 'unassigned'
    assignedSessionId: string | null
    spawnConfig: unknown | null
    sortOrder: number
    createdAt: number
    updatedAt: number
}

export type StoredRoomTask = {
    id: string
    roomId: string
    namespace: string
    title: string
    description: string | null
    status: 'pending' | 'in_progress' | 'blocked' | 'completed'
    assigneeRoleKey: string | null
    assigneeSessionId: string | null
    createdAt: number
    updatedAt: number
}

export type StoredRoomMessage = {
    id: string
    roomId: string
    namespace: string
    senderType: 'user' | 'session' | 'system'
    senderId: string
    roleKey: string | null
    content: unknown
    createdAt: number
    seq: number
}

export type StoredUser = {
    id: number
    platform: string
    platformUserId: string
    namespace: string
    createdAt: number
}

export type StoredPushSubscription = {
    id: number
    namespace: string
    endpoint: string
    p256dh: string
    auth: string
    createdAt: number
}

export type TemplateKind = 'role_slot' | 'room'

export type StoredSavedTemplate = {
    id: string
    namespace: string
    kind: TemplateKind
    key: string
    payload: unknown
    createdAt: number
    updatedAt: number
}

export type StoredBuiltinTemplateOverride = {
    id: string
    namespace: string
    kind: TemplateKind
    key: string
    hidden: boolean
    deleted: boolean
    updatedAt: number
}

export type VersionedUpdateResult<T> =
    | { result: 'success'; version: number; value: T }
    | { result: 'version-mismatch'; version: number; value: T }
    | { result: 'error' }
