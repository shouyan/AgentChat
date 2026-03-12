import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { SessionChat } from '@/components/SessionChat'
import { LoadingState } from '@/components/LoadingState'
import { useAppContext } from '@/lib/app-context'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useMessages } from '@/hooks/queries/useMessages'
import { useSession } from '@/hooks/queries/useSession'
import { useSlashCommands } from '@/hooks/queries/useSlashCommands'
import { useSkills } from '@/hooks/queries/useSkills'
import { useSendMessage } from '@/hooks/mutations/useSendMessage'
import { useMachines } from '@/features/machines/hooks/useMachines'
import { queryKeys } from '@/lib/query-keys'
import { useToast } from '@/lib/toast-context'
import { useTranslation } from '@/lib/use-translation'
import { fetchLatestMessages, seedMessageWindowFromSession } from '@/lib/message-window-store'

export default function SessionPage() {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const goBack = useAppGoBack()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { addToast } = useToast()
    const { sessionId } = useParams({ from: '/sessions/$sessionId' })
    const { session, refetch: refetchSession } = useSession(api, sessionId)
    const { machines } = useMachines(api, true)
    const { messages, warning: messagesWarning, isLoading: messagesLoading, isLoadingMore: messagesLoadingMore, hasMore: messagesHasMore, loadMore: loadMoreMessages, refetch: refetchMessages, pendingCount, messagesVersion, flushPending, setAtBottom } = useMessages(api, sessionId)
    const { sendMessage, retryMessage, isSending } = useSendMessage(api, sessionId, {
        resolveSessionId: async (currentSessionId) => {
            if (!api || !session || session.active) return currentSessionId
            try {
                return await api.resumeSession(currentSessionId)
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Resume failed'
                addToast({ title: 'Resume failed', body: message, sessionId: currentSessionId, url: '' })
                throw error
            }
        },
        onSessionResolved: (resolvedSessionId) => {
            void (async () => {
                if (api) {
                    if (session && resolvedSessionId !== session.id) {
                        seedMessageWindowFromSession(session.id, resolvedSessionId)
                        queryClient.setQueryData(queryKeys.session(resolvedSessionId), { session: { ...session, id: resolvedSessionId, active: true } })
                    }
                    try {
                        await Promise.all([
                            queryClient.prefetchQuery({ queryKey: queryKeys.session(resolvedSessionId), queryFn: () => api.getSession(resolvedSessionId) }),
                            fetchLatestMessages(api, resolvedSessionId),
                        ])
                    } catch {
                    }
                }
                navigate({ to: '/sessions/$sessionId', params: { sessionId: resolvedSessionId }, replace: true })
            })()
        },
        onBlocked: (reason) => {
            if (reason === 'no-api') {
                addToast({ title: t('send.blocked.title'), body: t('send.blocked.noConnection'), sessionId: sessionId ?? '', url: '' })
            }
        },
    })

    const agentType = session?.metadata?.flavor ?? 'claude'
    const { getSuggestions: getSlashSuggestions } = useSlashCommands(api, sessionId, agentType)
    const { getSuggestions: getSkillSuggestions } = useSkills(api, sessionId)

    const getAutocompleteSuggestions = useCallback(async (query: string) => {
        if (query.startsWith('$')) return await getSkillSuggestions(query)
        return await getSlashSuggestions(query)
    }, [getSkillSuggestions, getSlashSuggestions])

    const refreshSelectedSession = useCallback(() => {
        void refetchSession()
        void refetchMessages()
    }, [refetchMessages, refetchSession])

    if (!session) {
        return <div className="flex-1 flex items-center justify-center p-4"><LoadingState label="Loading session…" className="text-sm" /></div>
    }

    const sessionMachine = session.metadata?.machineId ? machines.find((machine) => machine.id === session.metadata?.machineId) ?? null : null

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
