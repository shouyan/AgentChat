import {
    Navigate,
    Outlet,
    createRootRoute,
    createRoute,
    createRouter,
    useLocation,
    useMatchRoute,
    useNavigate,
    useParams,
} from '@tanstack/react-router'
import { App } from '@/App'
import { InboxSidebar } from '@/features/inbox/components/InboxSidebar'
import { useAppContext } from '@/lib/app-context'
import FilesPage from '@/routes/sessions/files'
import SessionPageImpl from '@/features/sessions/pages/SessionPage'
import NewSessionPageImpl from '@/features/sessions/pages/NewSessionPage'
import RoomPageImpl from '@/features/rooms/pages/RoomPage'
import NewRoomPageImpl from '@/features/rooms/pages/NewRoomPage'
import FilePage from '@/routes/sessions/file'
import TerminalPage from '@/routes/sessions/terminal'
import MachinesPage from '@/routes/machines'
import SettingsPage from '@/routes/settings'
import TemplateManagerPage from '@/routes/templates'

function InboxShell() {
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

function SessionsPage() {
    return <InboxShell />
}

function SessionsIndexPage() {
    return null
}

function SessionPage() {
    return <SessionPageImpl />
}

function SessionDetailRoute() {
    const pathname = useLocation({ select: location => location.pathname })
    const { sessionId } = useParams({ from: '/sessions/$sessionId' })
    const basePath = `/sessions/${sessionId}`
    const isChat = pathname === basePath || pathname === `${basePath}/`

    return isChat ? <SessionPage /> : <Outlet />
}

function NewSessionPage() {
    return <NewSessionPageImpl />
}

function RoomsPage() {
    return <InboxShell />
}

function RoomsIndexPage() {
    return null
}

function RoomPage() {
    return <RoomPageImpl />
}

function NewRoomPage() {
    return <NewRoomPageImpl />
}

const rootRoute = createRootRoute({
    component: App,
})

const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <Navigate to="/sessions" replace />,
})

const sessionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sessions',
    component: SessionsPage,
})

const sessionsIndexRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: '/',
    component: SessionsIndexPage,
})

const sessionDetailRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: '$sessionId',
    component: SessionDetailRoute,
})

const sessionFilesRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: 'files',
    validateSearch: (search: Record<string, unknown>): { tab?: 'changes' | 'directories'; fromRoom?: string } => {
        const tabValue = typeof search.tab === 'string' ? search.tab : undefined
        const tab = tabValue === 'directories'
            ? 'directories'
            : tabValue === 'changes'
                ? 'changes'
                : undefined
        const fromRoom = typeof search.fromRoom === 'string' ? search.fromRoom : undefined

        return {
            ...(tab ? { tab } : {}),
            ...(fromRoom ? { fromRoom } : {}),
        }
    },
    component: FilesPage,
})

const sessionTerminalRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: 'terminal',
    validateSearch: (search: Record<string, unknown>): { fromRoom?: string } => {
        const fromRoom = typeof search.fromRoom === 'string' ? search.fromRoom : undefined
        return fromRoom ? { fromRoom } : {}
    },
    component: TerminalPage,
})

type SessionFileSearch = {
    path: string
    staged?: boolean
    tab?: 'changes' | 'directories'
    fromRoom?: string
}

const sessionFileRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: 'file',
    validateSearch: (search: Record<string, unknown>): SessionFileSearch => {
        const path = typeof search.path === 'string' ? search.path : ''
        const staged = search.staged === true || search.staged === 'true'
            ? true
            : search.staged === false || search.staged === 'false'
                ? false
                : undefined

        const tabValue = typeof search.tab === 'string' ? search.tab : undefined
        const tab = tabValue === 'directories'
            ? 'directories'
            : tabValue === 'changes'
                ? 'changes'
                : undefined
        const fromRoom = typeof search.fromRoom === 'string' ? search.fromRoom : undefined

        const result: SessionFileSearch = { path }
        if (staged !== undefined) {
            result.staged = staged
        }
        if (tab !== undefined) {
            result.tab = tab
        }
        if (fromRoom !== undefined) {
            result.fromRoom = fromRoom
        }
        return result
    },
    component: FilePage,
})

const newSessionRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: 'new',
    component: NewSessionPage,
})

const roomsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/rooms',
    component: RoomsPage,
})

const roomsIndexRoute = createRoute({
    getParentRoute: () => roomsRoute,
    path: '/',
    component: RoomsIndexPage,
})

const roomDetailRoute = createRoute({
    getParentRoute: () => roomsRoute,
    path: '$roomId',
    component: RoomPage,
})

const newRoomRoute = createRoute({
    getParentRoute: () => roomsRoute,
    path: 'new',
    component: NewRoomPage,
})

const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: SettingsPage,
})

const machinesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/machines',
    component: MachinesPage,
})

const templatesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/templates',
    component: TemplateManagerPage,
})

export const routeTree = rootRoute.addChildren([
    indexRoute,
    sessionsRoute.addChildren([
        sessionsIndexRoute,
        newSessionRoute,
        sessionDetailRoute.addChildren([
            sessionTerminalRoute,
            sessionFilesRoute,
            sessionFileRoute,
        ]),
    ]),
    roomsRoute.addChildren([
        roomsIndexRoute,
        newRoomRoute,
        roomDetailRoute,
    ]),
    settingsRoute,
    machinesRoute,
    templatesRoute,
])

type RouterHistory = Parameters<typeof createRouter>[0]['history']

export function createAppRouter(history?: RouterHistory) {
    return createRouter({
        routeTree,
        history,
        scrollRestoration: true,
    })
}

export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
    interface Register {
        router: AppRouter
    }
}
