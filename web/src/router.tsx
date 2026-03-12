import {
    Navigate,
    Outlet,
    createRootRoute,
    createRoute,
    createRouter,
    useLocation,
    useParams,
} from '@tanstack/react-router'
import { App } from '@/App'
import InboxShellImpl from '@/features/inbox/pages/InboxShell'
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
    return <InboxShellImpl />
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
