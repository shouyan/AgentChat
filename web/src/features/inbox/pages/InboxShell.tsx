import { Outlet, useLocation, useMatchRoute, useNavigate } from '@tanstack/react-router'
import { InboxSidebar } from '@/features/inbox/components/InboxSidebar'
import { useAppContext } from '@/lib/app-context'

export default function InboxShell() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const pathname = useLocation({ select: location => location.pathname })
    const matchRoute = useMatchRoute()
    const sessionMatch = matchRoute({ to: '/sessions/$sessionId', fuzzy: true })
    const roomMatch = matchRoute({ to: '/rooms/$roomId', fuzzy: true })
    const selectedSessionId = sessionMatch && sessionMatch.sessionId !== 'new' ? sessionMatch.sessionId : null
    const selectedRoomId = roomMatch && roomMatch.roomId !== 'new' ? roomMatch.roomId : null
    const isInboxIndex = pathname === '/sessions' || pathname === '/sessions/' || pathname === '/rooms' || pathname === '/rooms/'

    return (
        <div className="flex h-full min-h-0 bg-[var(--app-bg)]">
            <div className={`${isInboxIndex ? 'flex' : 'hidden lg:flex'} w-full lg:w-[400px] xl:w-[440px] shrink-0 flex-col border-r border-[var(--app-divider)]`}>
                <InboxSidebar
                    api={api}
                    selectedSessionId={selectedSessionId}
                    selectedRoomId={selectedRoomId}
                    onOpenSession={(sessionId) => navigate({ to: '/sessions/$sessionId', params: { sessionId } })}
                    onOpenRoom={(roomId) => navigate({ to: '/rooms/$roomId', params: { roomId } })}
                    onSessionDeleted={(sessionId) => {
                        if (selectedSessionId === sessionId) {
                            navigate({ to: '/sessions' })
                        }
                    }}
                    onRoomDeleted={(roomId) => {
                        if (selectedRoomId === roomId) {
                            navigate({ to: '/rooms' })
                        }
                    }}
                    onNewSession={() => navigate({ to: '/sessions/new' })}
                    onNewRoom={() => navigate({ to: '/rooms/new' })}
                    onOpenSettings={() => navigate({ to: '/settings' })}
                />
            </div>

            <div className={`${isInboxIndex ? 'hidden lg:flex' : 'flex'} min-w-0 flex-1 flex-col bg-[var(--app-bg)]`}>
                <div className="flex-1 min-h-0">
                    <Outlet />
                </div>
            </div>
        </div>
    )
}
