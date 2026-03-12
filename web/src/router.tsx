import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
import { SessionChat } from '@/components/SessionChat'
import { SessionList } from '@/components/SessionList'
import { NewSession } from '@/components/NewSession'
import { NewRoom } from '@/components/NewRoom'
import { RoomDetail } from '@/components/RoomDetail'
import { InboxSidebar } from '@/components/InboxSidebar'
import { LoadingState } from '@/components/LoadingState'
import { useAppContext } from '@/lib/app-context'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { isTelegramApp } from '@/hooks/useTelegram'
import { useMessages } from '@/hooks/queries/useMessages'
import { useMachines } from '@/features/machines/hooks/useMachines'
import { useSession } from '@/hooks/queries/useSession'
import { useSessions } from '@/hooks/queries/useSessions'
import { useRoom } from '@/features/rooms/hooks/useRoom'
import { useRoomMessages } from '@/features/rooms/hooks/useRoomMessages'
import { useRooms } from '@/features/rooms/hooks/useRooms'
import { useSlashCommands } from '@/hooks/queries/useSlashCommands'
import { useSkills } from '@/hooks/queries/useSkills'
import { useSendMessage } from '@/hooks/mutations/useSendMessage'
import { queryKeys } from '@/lib/query-keys'
import { useToast } from '@/lib/toast-context'
import { useTranslation } from '@/lib/use-translation'
import { fetchLatestMessages, seedMessageWindowFromSession } from '@/lib/message-window-store'
import FilesPage from '@/routes/sessions/files'
import FilePage from '@/routes/sessions/file'
import TerminalPage from '@/routes/sessions/terminal'
import MachinesPage from '@/routes/machines'
import SettingsPage from '@/routes/settings'
import TemplateManagerPage from '@/routes/templates'

function BackIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

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
    const { api } = useAppContext()
    const { t } = useTranslation()
    const goBack = useAppGoBack()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { addToast } = useToast()
    const { sessionId } = useParams({ from: '/sessions/$sessionId' })
    const {
        session,
        refetch: refetchSession,
    } = useSession(api, sessionId)
    const { machines } = useMachines(api, true)
    const {
        messages,
        warning: messagesWarning,
        isLoading: messagesLoading,
        isLoadingMore: messagesLoadingMore,
        hasMore: messagesHasMore,
        loadMore: loadMoreMessages,
        refetch: refetchMessages,
        pendingCount,
        messagesVersion,
        flushPending,
        setAtBottom,
    } = useMessages(api, sessionId)
    const {
        sendMessage,
        retryMessage,
        isSending,
    } = useSendMessage(api, sessionId, {
        resolveSessionId: async (currentSessionId) => {
            if (!api || !session || session.active) {
                return currentSessionId
            }
            try {
                return await api.resumeSession(currentSessionId)
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Resume failed'
                addToast({
                    title: 'Resume failed',
                    body: message,
                    sessionId: currentSessionId,
                    url: ''
                })
                throw error
            }
        },
        onSessionResolved: (resolvedSessionId) => {
            void (async () => {
                if (api) {
                    if (session && resolvedSessionId !== session.id) {
                        seedMessageWindowFromSession(session.id, resolvedSessionId)
                        queryClient.setQueryData(queryKeys.session(resolvedSessionId), {
                            session: { ...session, id: resolvedSessionId, active: true }
                        })
                    }
                    try {
                        await Promise.all([
                            queryClient.prefetchQuery({
                                queryKey: queryKeys.session(resolvedSessionId),
                                queryFn: () => api.getSession(resolvedSessionId),
                            }),
                            fetchLatestMessages(api, resolvedSessionId),
                        ])
                    } catch {
                    }
                }
                navigate({
                    to: '/sessions/$sessionId',
                    params: { sessionId: resolvedSessionId },
                    replace: true
                })
            })()
        },
        onBlocked: (reason) => {
            if (reason === 'no-api') {
                addToast({
                    title: t('send.blocked.title'),
                    body: t('send.blocked.noConnection'),
                    sessionId: sessionId ?? '',
                    url: ''
                })
            }
            // 'no-session' and 'pending' don't need toast - either invalid state or expected behavior
        }
    })

    // Get agent type from session metadata for slash commands
    const agentType = session?.metadata?.flavor ?? 'claude'
    const {
        getSuggestions: getSlashSuggestions,
    } = useSlashCommands(api, sessionId, agentType)
    const {
        getSuggestions: getSkillSuggestions,
    } = useSkills(api, sessionId)

    const getAutocompleteSuggestions = useCallback(async (query: string) => {
        if (query.startsWith('$')) {
            return await getSkillSuggestions(query)
        }
        return await getSlashSuggestions(query)
    }, [getSkillSuggestions, getSlashSuggestions])

    const refreshSelectedSession = useCallback(() => {
        void refetchSession()
        void refetchMessages()
    }, [refetchMessages, refetchSession])

    if (!session) {
        return (
            <div className="flex-1 flex items-center justify-center p-4">
                <LoadingState label="Loading session…" className="text-sm" />
            </div>
        )
    }

    const sessionMachine = session.metadata?.machineId
        ? machines.find((machine) => machine.id === session.metadata?.machineId) ?? null
        : null

    return (
        <SessionChat
            api={api}
            session={session}
            machine={sessionMachine}
            messages={messages}
            messagesWarning={messagesWarning}
            hasMoreMessages={messagesHasMore}
            isLoadingMessages={messagesLoading}
            isLoadingMoreMessages={messagesLoadingMore}
            isSending={isSending}
            pendingCount={pendingCount}
            messagesVersion={messagesVersion}
            onBack={goBack}
            onRefresh={refreshSelectedSession}
            onLoadMore={loadMoreMessages}
            onSend={sendMessage}
            onFlushPending={flushPending}
            onAtBottomChange={setAtBottom}
            onRetryMessage={retryMessage}
            autocompleteSuggestions={getAutocompleteSuggestions}
        />
    )
}

function SessionDetailRoute() {
    const pathname = useLocation({ select: location => location.pathname })
    const { sessionId } = useParams({ from: '/sessions/$sessionId' })
    const basePath = `/sessions/${sessionId}`
    const isChat = pathname === basePath || pathname === `${basePath}/`

    return isChat ? <SessionPage /> : <Outlet />
}

function NewSessionPage() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const goBack = useAppGoBack()
    const queryClient = useQueryClient()
    const { machines, isLoading: machinesLoading, error: machinesError } = useMachines(api, true)
    const { t } = useTranslation()

    const handleCancel = useCallback(() => {
        navigate({ to: '/sessions' })
    }, [navigate])

    const handleSuccess = useCallback((sessionId: string) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
        // Replace current page with /sessions to clear spawn flow from history
        navigate({ to: '/sessions', replace: true })
        // Then navigate to new session
        requestAnimationFrame(() => {
            navigate({
                to: '/sessions/$sessionId',
                params: { sessionId },
            })
        })
    }, [navigate, queryClient])

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="flex items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-bg)] p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
                {!isTelegramApp() && (
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                    >
                        <BackIcon />
                    </button>
                )}
                <div className="flex-1 font-semibold">{t('newSession.title')}</div>
            </div>

            {machinesError ? (
                <div className="p-3 text-sm text-red-600">
                    {machinesError}
                </div>
            ) : null}

            <NewSession
                api={api}
                machines={machines}
                isLoading={machinesLoading}
                onCancel={handleCancel}
                onSuccess={handleSuccess}
            />
        </div>
    )
}

function RoomsPage() {
    return <InboxShell />
}

function RoomsIndexPage() {
    return null
}

function RoomPage() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const { roomId } = useParams({ from: '/rooms/$roomId' })
    const { room } = useRoom(api, roomId)
    const { messages } = useRoomMessages(api, roomId)
    const { sessions } = useSessions(api)
    const { machines } = useMachines(api, true)
    const queryClient = useQueryClient()

    if (!api || !room) {
        return (
            <div className="flex h-full items-center justify-center">
                <LoadingState label="Loading room…" className="text-sm" />
            </div>
        )
    }

    return (
        <RoomDetail
            api={api}
            room={room}
            messages={messages}
            sessions={sessions}
            machines={machines}
            onOpenSession={(sessionId) => navigate({
                to: '/sessions/$sessionId',
                params: { sessionId },
                search: { fromRoom: room.id },
            })}
            onOpenSessionFiles={(sessionId) => navigate({
                to: '/sessions/$sessionId/files',
                params: { sessionId },
                search: { tab: 'directories', fromRoom: room.id },
            })}
            onOpenSessionTerminal={(sessionId) => navigate({
                to: '/sessions/$sessionId/terminal',
                params: { sessionId },
                search: { fromRoom: room.id },
            })}
            onDeleted={() => {
                void queryClient.invalidateQueries({ queryKey: queryKeys.rooms })
                void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
                navigate({ to: '/rooms' })
            }}
        />
    )
}

function NewRoomPage() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { machines, isLoading: machinesLoading } = useMachines(api, true)

    if (!api) {
        return (
            <div className="flex h-full items-center justify-center">
                <LoadingState label="Loading room creator…" className="text-sm" />
            </div>
        )
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
