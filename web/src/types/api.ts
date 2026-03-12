import type {
    DecryptedMessage as ProtocolDecryptedMessage,
    Machine as ProtocolMachine,
    MachineMetadata as ProtocolMachineMetadata,
    MachineProviderHealthStatus as ProtocolMachineProviderHealthStatus,
    MachineProviderStatus as ProtocolMachineProviderStatus,
    Room,
    RoomMessage,
    Session,
    SessionSummary,
    SyncEvent as ProtocolSyncEvent,
    WorktreeMetadata,
    RunnerState as ProtocolRunnerState
} from '@hapi/protocol/types'
import type {
    DeleteUploadResponse as ProtocolDeleteUploadResponse,
    FileReadResponse as ProtocolFileReadResponse,
    FileSearchResponse as ProtocolFileSearchResponse,
    FileWriteResponse as ProtocolFileWriteResponse,
    ListDirectoryResponse as ProtocolListDirectoryResponse,
    PathMutationResponse as ProtocolPathMutationResponse,
    UploadFileResponse as ProtocolUploadFileResponse,
} from '@hapi/protocol/contracts/files'
import type {
    DirectoryEntry as ProtocolDirectoryEntry,
    FileSearchItem as ProtocolFileSearchItem,
} from '@hapi/protocol/files'
import type {
    MachineActionResponse as ProtocolMachineActionResponse,
    MachineCleanupResponse as ProtocolMachineCleanupResponse,
    MachineDirectoryEntry as ProtocolMachineDirectoryEntry,
    MachineDirectoryResponse as ProtocolMachineDirectoryResponse,
    MachinePathsExistsResponse as ProtocolMachinePathsExistsResponse,
    MachinesResponse as ProtocolMachinesResponse,
    ProviderHealthResponse as ProtocolProviderHealthResponse
} from '@hapi/protocol/contracts/machines'

export type {
    AgentState,
    AttachmentMetadata,
    Machine as ProtocolMachine,
    MachineMetadata as ProtocolMachineMetadata,
    MachineProviderHealthStatus as ProtocolMachineProviderHealthStatus,
    MachineProviderStatus as ProtocolMachineProviderStatus,
    ModelMode,
    PermissionMode,
    Room,
    RoomMessage,
    RoomMetadata,
    RoomRole,
    RoomRoleAssignmentMode,
    RoomRoleTemplate,
    RoomRoleTemplateItem,
    RoomTask,
    Session,
    SessionSummary,
    SessionSummaryMetadata,
    TeamMember,
    TeamMessage,
    TeamState,
    TeamTask,
    TodoItem,
    WorktreeMetadata
} from '@hapi/protocol/types'

export type SessionMetadataSummary = {
    path: string
    host: string
    version?: string
    name?: string
    os?: string
    summary?: { text: string; updatedAt: number }
    machineId?: string
    tools?: string[]
    flavor?: string | null
    worktree?: WorktreeMetadata
}

export type MessageStatus = 'sending' | 'sent' | 'failed'

export type DecryptedMessage = ProtocolDecryptedMessage & {
    status?: MessageStatus
    originalText?: string
}

export type RunnerState = ProtocolRunnerState
export type MachineProviderStatus = ProtocolMachineProviderStatus
export type MachineProviderHealthStatus = ProtocolMachineProviderHealthStatus
export type MachineMetadata = ProtocolMachineMetadata
export type Machine = ProtocolMachine

export type AuthResponse = {
    token: string
    namespace: string
    user: {
        id: number
        username?: string
        firstName?: string
        lastName?: string
    }
}

export type SessionsResponse = { sessions: SessionSummary[] }
export type SessionResponse = { session: Session }
export type RoomsResponse = { rooms: Room[] }
export type RoomResponse = { room: Room }
export type RoomMessagesResponse = {
    messages: RoomMessage[]
    page: {
        limit: number
        beforeSeq: number | null
        nextBeforeSeq: number | null
        hasMore: boolean
    }
}
export type MessagesResponse = {
    messages: DecryptedMessage[]
    page: {
        limit: number
        beforeSeq: number | null
        nextBeforeSeq: number | null
        hasMore: boolean
    }
}

export type MachinesResponse = ProtocolMachinesResponse
export type MachinePathsExistsResponse = ProtocolMachinePathsExistsResponse
export type MachineDirectoryEntry = ProtocolMachineDirectoryEntry
export type MachineDirectoryResponse = ProtocolMachineDirectoryResponse
export type MachineActionResponse = ProtocolMachineActionResponse
export type MachineCleanupResponse = ProtocolMachineCleanupResponse
export type ProviderHealthResponse = ProtocolProviderHealthResponse

export type SpawnResponse =
    | { type: 'success'; sessionId: string }
    | { type: 'error'; message: string }

export type CreateRoomResponse = {
    room: Room
    spawnedSessionIds?: string[]
}

export type DeleteRoomResponse = {
    ok: true
    deletedSessionIds: string[]
}

export type GitCommandResponse = {
    success: boolean
    stdout?: string
    stderr?: string
    exitCode?: number
    error?: string
}

export type FileSearchItem = ProtocolFileSearchItem
export type FileSearchResponse = ProtocolFileSearchResponse
export type DirectoryEntry = ProtocolDirectoryEntry
export type ListDirectoryResponse = ProtocolListDirectoryResponse
export type FileReadResponse = ProtocolFileReadResponse
export type FileWriteResponse = ProtocolFileWriteResponse
export type PathMutationResponse = ProtocolPathMutationResponse
export type UploadFileResponse = ProtocolUploadFileResponse
export type DeleteUploadResponse = ProtocolDeleteUploadResponse

export type GitFileStatus = {
    fileName: string
    filePath: string
    fullPath: string
    status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'
    isStaged: boolean
    linesAdded: number
    linesRemoved: number
    oldPath?: string
}

export type GitStatusFiles = {
    stagedFiles: GitFileStatus[]
    unstagedFiles: GitFileStatus[]
    branch: string | null
    totalStaged: number
    totalUnstaged: number
}

export type SlashCommand = {
    name: string
    description?: string
    source: 'builtin' | 'user' | 'plugin' | 'project'
    content?: string  // Expanded content for Codex user prompts
    pluginName?: string
}

export type SlashCommandsResponse = {
    success: boolean
    commands?: SlashCommand[]
    error?: string
}

export type SkillSummary = {
    name: string
    description?: string
}

export type SkillsResponse = {
    success: boolean
    skills?: SkillSummary[]
    error?: string
}

export type PushSubscriptionKeys = {
    p256dh: string
    auth: string
}

export type PushSubscriptionPayload = {
    endpoint: string
    keys: PushSubscriptionKeys
}

export type PushUnsubscribePayload = {
    endpoint: string
}

export type PushVapidPublicKeyResponse = {
    publicKey: string
}

export type VisibilityPayload = {
    subscriptionId: string
    visibility: 'visible' | 'hidden'
}

export type SyncEvent = ProtocolSyncEvent
