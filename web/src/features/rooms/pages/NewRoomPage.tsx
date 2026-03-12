import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { NewRoom } from '@/components/NewRoom'
import { LoadingState } from '@/components/LoadingState'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import { useMachines } from '@/features/machines/hooks/useMachines'

export default function NewRoomPage() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { machines, isLoading: machinesLoading } = useMachines(api, true)

    if (!api) {
        return <div className="flex h-full items-center justify-center"><LoadingState label="Loading room creator…" className="text-sm" /></div>
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-[var(--app-border)] bg-[var(--app-bg)] p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
                <div className="font-semibold">New room</div>
                <button type="button" onClick={() => navigate({ to: '/rooms' })} className="rounded border border-[var(--app-border)] px-3 py-1.5 text-sm">Close</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
                {machinesLoading ? <div className="px-4 py-2 text-sm text-[var(--app-hint)]">Loading machines…</div> : null}
                <NewRoom
                    api={api}
                    machines={machines}
                    onCancel={() => navigate({ to: '/rooms' })}
                    onManageTemplates={() => navigate({ to: '/templates' })}
                    onSuccess={(roomId) => {
                        void queryClient.invalidateQueries({ queryKey: queryKeys.rooms })
                        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
                        navigate({ to: '/rooms/$roomId', params: { roomId } })
                    }}
                />
            </div>
        </div>
    )
}
