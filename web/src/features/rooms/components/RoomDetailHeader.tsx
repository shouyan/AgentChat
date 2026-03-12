type RoomTab = 'chat' | 'tasks' | 'roles'

export function RoomDetailHeader(props: {
    roomName: string
    goal?: string
    roomIsOffline: boolean
    roomPowerBusy: boolean
    roomHasWakeableAgents: boolean
    roomHasAssignedAgents: boolean
    autoDispatch: boolean
    onlineCount: number
    roleCount: number
    assignedCount: number
    completedCount: number
    taskCount: number
    tab: RoomTab
    onTabChange: (tab: RoomTab) => void
    onToggleRoomPower: () => void
    onToggleAutoDispatch: () => void
    onDelete: () => void
    isDeleting: boolean
}) {
    return (
        <div className="border-b border-[var(--app-border)] bg-[var(--app-bg)] px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="text-lg font-semibold">{props.roomName}</div>
                    {props.goal ? <div className="mt-1 max-w-3xl text-sm text-[var(--app-hint)]">{props.goal}</div> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="flex items-center gap-2 rounded-full bg-[var(--app-subtle-bg)] px-2 py-1">
                        <span className="text-[var(--app-hint)]">Status:</span>
                        <span className={`text-xs font-medium ${props.roomIsOffline ? 'text-amber-700' : 'text-emerald-700'}`}>
                            {props.roomPowerBusy ? (props.roomIsOffline ? 'Waking…' : 'Offlining…') : (props.roomIsOffline ? 'Offline' : 'Wake')}
                        </span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={!props.roomIsOffline}
                            onClick={props.onToggleRoomPower}
                            disabled={(props.roomIsOffline ? !props.roomHasWakeableAgents : !props.roomHasAssignedAgents) || props.roomPowerBusy}
                            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60 ${props.roomIsOffline ? 'border-amber-300 bg-amber-100' : 'border-emerald-300 bg-emerald-100'}`}
                            title={props.roomIsOffline ? 'Resume all assigned room agents' : 'Archive all online room agents'}
                        >
                            <span className={`absolute h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${props.roomIsOffline ? 'translate-x-1' : 'translate-x-6'}`} />
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={props.onToggleAutoDispatch}
                        disabled={props.roomPowerBusy}
                        className={`rounded-full px-3 py-1 ${props.autoDispatch ? 'bg-emerald-100 text-emerald-700' : 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'} disabled:opacity-60`}
                        title="Toggle planner auto-dispatch nudges"
                    >
                        auto-dispatch {props.autoDispatch ? 'on' : 'off'}
                    </button>
                    <span className="rounded-full bg-[var(--app-subtle-bg)] px-3 py-1 text-[var(--app-hint)]">{props.onlineCount}/{props.roleCount} online</span>
                    <span className="rounded-full bg-[var(--app-subtle-bg)] px-3 py-1 text-[var(--app-hint)]">{props.assignedCount}/{props.roleCount} roles assigned</span>
                    <span className="rounded-full bg-[var(--app-subtle-bg)] px-3 py-1 text-[var(--app-hint)]">{props.completedCount}/{props.taskCount} tasks done</span>
                    <button
                        type="button"
                        onClick={props.onDelete}
                        disabled={props.isDeleting}
                        className="rounded-full border border-red-200 px-3 py-1 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
                        title="Delete room and all assigned sessions"
                    >
                        Delete
                    </button>
                </div>
            </div>
            <div className="mt-3 flex gap-2">
                {(['chat', 'tasks', 'roles'] as const).map((item) => (
                    <button
                        key={item}
                        type="button"
                        onClick={() => props.onTabChange(item)}
                        className={`rounded-full px-3 py-1.5 text-sm capitalize ${props.tab === item ? 'bg-[var(--app-link)] text-white' : 'bg-[var(--app-subtle-bg)] text-[var(--app-fg)]'}`}
                    >
                        {item}
                    </button>
                ))}
            </div>
        </div>
    )
}
