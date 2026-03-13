import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useAppContext } from '@/lib/app-context'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useMachines } from '@/features/machines/hooks/useMachines'
import { useSessions } from '@/hooks/queries/useSessions'
import { queryKeys } from '@/lib/query-keys'
import { MachineStatusCard } from '@/features/machines/components/MachineStatusCard'
import { LoadingState } from '@/components/LoadingState'
import type { MachineCleanupResponse, ProviderHealthResponse, RunnerEnvResponse } from '@/types/api'

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

export default function MachinesPage() {
    const { api, namespace } = useAppContext()
    const navigate = useNavigate()
    const goBack = useAppGoBack()
    const queryClient = useQueryClient()
    const { machines, isLoading, error } = useMachines(api, true)
    const { sessions } = useSessions(api)
    const [pendingActionByMachine, setPendingActionByMachine] = useState<Record<string, string | null>>({})
    const [actionMessageByMachine, setActionMessageByMachine] = useState<Record<string, string | null>>({})
    const [providerHealthByMachine, setProviderHealthByMachine] = useState<Record<string, ProviderHealthResponse | null>>({})
    const [pendingSessionCleanupId, setPendingSessionCleanupId] = useState<string | null>(null)
    const [runnerEnvByMachine, setRunnerEnvByMachine] = useState<Record<string, { path?: string; content: string }>>({})

    const refreshMachineQueries = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.machines })
        await queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
    }, [queryClient])

    const queueRefreshes = useCallback(() => {
        void refreshMachineQueries()
        for (const delay of [1_000, 3_000, 6_000]) {
            window.setTimeout(() => {
                void refreshMachineQueries()
            }, delay)
        }
    }, [refreshMachineQueries])

    const setMachinePending = useCallback((machineId: string, action: string | null) => {
        setPendingActionByMachine((current) => ({ ...current, [machineId]: action }))
    }, [])

    const setMachineMessage = useCallback((machineId: string, message: string | null) => {
        setActionMessageByMachine((current) => ({ ...current, [machineId]: message }))
    }, [])

    const applyRunnerEnv = useCallback((machineId: string, result: RunnerEnvResponse) => {
        setRunnerEnvByMachine((current) => ({
            ...current,
            [machineId]: {
                path: result.path,
                content: result.content ?? '',
            },
        }))
    }, [])

    const loadRunnerEnv = useCallback(async (machineId: string) => {
        if (!api) return
        setMachinePending(machineId, 'runner-env-load')
        setMachineMessage(machineId, null)
        try {
            const result = await api.getRunnerEnv(machineId)
            if (!result.success) {
                setMachineMessage(machineId, result.error || 'Failed to load runner env')
                return
            }
            applyRunnerEnv(machineId, result)
        } catch (actionError) {
            setMachineMessage(machineId, actionError instanceof Error ? actionError.message : 'Failed to load runner env')
        } finally {
            setMachinePending(machineId, null)
        }
    }, [api, applyRunnerEnv, setMachineMessage, setMachinePending])

    useEffect(() => {
        if (!api) return
        for (const machine of machines) {
            if (!machine.active) continue
            if (runnerEnvByMachine[machine.id]) continue
            void loadRunnerEnv(machine.id)
        }
    }, [api, machines, runnerEnvByMachine, loadRunnerEnv])

    const handleRestartRunner = useCallback(async (machineId: string) => {
        if (!api) {
            return
        }
        if (!window.confirm('Restart this runner now? Active runner-managed sessions may reconnect.')) {
            return
        }

        setMachinePending(machineId, 'restart')
        setMachineMessage(machineId, null)
        try {
            const result = await api.restartRunner(machineId)
            setMachineMessage(machineId, result.message)
            queueRefreshes()
        } catch (actionError) {
            setMachineMessage(machineId, actionError instanceof Error ? actionError.message : 'Failed to restart runner')
        } finally {
            setMachinePending(machineId, null)
        }
    }, [api, queueRefreshes, setMachineMessage, setMachinePending])

    const handleCleanupDeadSessions = useCallback(async (machineId: string) => {
        if (!api) {
            return
        }
        if (!window.confirm('Remove only runner sessions whose tracked host process is gone? Inactive history will be kept.')) {
            return
        }

        setMachinePending(machineId, 'cleanup')
        setMachineMessage(machineId, null)
        try {
            const result: MachineCleanupResponse = await api.cleanupDeadSessions(machineId)
            const summary = result.deletedSessionIds.length > 0
                ? `Deleted ${result.deletedSessionIds.length} orphaned session(s); kept ${result.keptSessionIds.length}, including ${result.preservedInactiveSessionIds.length} inactive history item(s).`
                : `No orphaned sessions found; kept ${result.keptSessionIds.length}, including ${result.preservedInactiveSessionIds.length} inactive history item(s).`
            setMachineMessage(machineId, summary)
            queueRefreshes()
        } catch (actionError) {
            setMachineMessage(machineId, actionError instanceof Error ? actionError.message : 'Failed to clean dead sessions')
        } finally {
            setMachinePending(machineId, null)
        }
    }, [api, queueRefreshes, setMachineMessage, setMachinePending])

    const handleRunProviderHealthCheck = useCallback(async (machineId: string) => {
        if (!api) {
            return
        }

        setMachinePending(machineId, 'health')
        setMachineMessage(machineId, null)
        try {
            const result = await api.runProviderHealthCheck(machineId)
            setProviderHealthByMachine((current) => ({ ...current, [machineId]: result }))
            if (!result.success) {
                setMachineMessage(machineId, result.error || 'Provider health checks failed')
            } else {
                setMachineMessage(machineId, 'Provider health checks updated.')
            }
            await refreshMachineQueries()
        } catch (actionError) {
            setMachineMessage(machineId, actionError instanceof Error ? actionError.message : 'Failed to run provider health checks')
        } finally {
            setMachinePending(machineId, null)
        }
    }, [api, refreshMachineQueries, setMachineMessage, setMachinePending])

    const handleCleanupSession = useCallback(async (machineId: string, sessionId: string) => {
        if (!api) {
            return
        }
        if (!window.confirm('Remove this inactive session record?')) {
            return
        }

        setPendingSessionCleanupId(sessionId)
        setMachineMessage(machineId, null)
        try {
            await api.deleteSession(sessionId)
            setMachineMessage(machineId, `Removed inactive session ${sessionId.slice(0, 8)}.`)
            queueRefreshes()
        } catch (actionError) {
            setMachineMessage(machineId, actionError instanceof Error ? actionError.message : 'Failed to remove inactive session')
        } finally {
            setPendingSessionCleanupId(null)
        }
    }, [api, queueRefreshes, setMachineMessage])

    const handleRunnerEnvChange = useCallback((machineId: string, content: string) => {
        setRunnerEnvByMachine((current) => ({
            ...current,
            [machineId]: {
                path: current[machineId]?.path,
                content,
            },
        }))
    }, [])

    const handleSaveRunnerEnv = useCallback(async (machineId: string) => {
        if (!api) return
        const current = runnerEnvByMachine[machineId]
        if (!current) {
            await loadRunnerEnv(machineId)
            return
        }

        setMachinePending(machineId, 'runner-env-save')
        setMachineMessage(machineId, null)
        try {
            const result = await api.saveRunnerEnv(machineId, current.content)
            if (!result.success) {
                setMachineMessage(machineId, result.error || 'Failed to save runner env')
                return
            }
            applyRunnerEnv(machineId, result)
            setMachineMessage(machineId, 'Runner environment saved. New agent sessions will use these values.')
            await refreshMachineQueries()
        } catch (actionError) {
            setMachineMessage(machineId, actionError instanceof Error ? actionError.message : 'Failed to save runner env')
        } finally {
            setMachinePending(machineId, null)
        }
    }, [api, runnerEnvByMachine, loadRunnerEnv, applyRunnerEnv, refreshMachineQueries, setMachineMessage, setMachinePending])

    const sessionsByMachine = useMemo(() => {
        const map = new Map<string, typeof sessions>()
        for (const session of sessions) {
            const machineId = session.metadata?.machineId
            if (!machineId) continue
            const current = map.get(machineId) ?? []
            current.push(session)
            map.set(machineId, current)
        }
        return map
    }, [sessions])

    return (
        <div className="flex h-full flex-col">
            <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto flex w-full max-w-content items-center gap-2 border-b border-[var(--app-border)] p-3">
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                    >
                        <BackIcon />
                    </button>
                    <div className="flex-1 font-semibold">Machines & providers</div>
                    <button
                        type="button"
                        onClick={() => {
                            void refreshMachineQueries()
                        }}
                        className="rounded-md border border-[var(--app-border)] px-3 py-1.5 text-sm"
                    >
                        Refresh
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate({ to: '/settings' })}
                        className="rounded-md border border-[var(--app-border)] px-3 py-1.5 text-sm"
                    >
                        Settings
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto flex w-full max-w-content flex-col gap-4 p-4">
                    <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
                        <div className="text-sm font-medium">Namespace scope</div>
                        <div className="mt-1 text-xs text-[var(--app-hint)]">
                            Showing only machine, session, and provider data for <span className="font-mono text-[var(--app-fg)]">{namespace}</span>.
                        </div>
                    </div>
                    <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
                        <div className="text-sm font-medium">Release checklist</div>
                        <div className="mt-2 text-xs text-[var(--app-hint)]">
                            Before wider rollout: keep one runner online per machine, save provider variables in runner.env, create a fresh session after env changes, and verify Feishu or web flows against this namespace.
                        </div>
                    </div>
                    {isLoading ? <LoadingState label="Loading machines…" className="text-sm" /> : null}
                    {error ? <div className="text-sm text-red-600">{error}</div> : null}
                    {!isLoading && !error && machines.length === 0 ? (
                        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4 text-sm text-[var(--app-hint)]">
                            <div className="font-medium text-[var(--app-fg)]">No online machines</div>
                            <ol className="mt-2 list-decimal space-y-1 pl-4">
                                <li>Start the hub.</li>
                                <li>Start a runner with the same token and hub URL.</li>
                                <li>Refresh this page after the runner connects.</li>
                            </ol>
                        </div>
                    ) : null}
                    {machines.map((machine) => (
                        <MachineStatusCard
                            key={machine.id}
                            machine={machine}
                            sessions={sessionsByMachine.get(machine.id) ?? []}
                            pendingAction={pendingActionByMachine[machine.id] ?? null}
                            actionMessage={actionMessageByMachine[machine.id] ?? null}
                            providerHealth={providerHealthByMachine[machine.id] ?? null}
                            runnerEnvPath={runnerEnvByMachine[machine.id]?.path}
                            runnerEnvContent={runnerEnvByMachine[machine.id]?.content ?? ''}
                            onRunnerEnvChange={(content) => handleRunnerEnvChange(machine.id, content)}
                            onReloadRunnerEnv={() => void loadRunnerEnv(machine.id)}
                            onSaveRunnerEnv={() => void handleSaveRunnerEnv(machine.id)}
                            onRestartRunner={() => void handleRestartRunner(machine.id)}
                            onCleanupDeadSessions={() => void handleCleanupDeadSessions(machine.id)}
                            onRunProviderHealthCheck={() => void handleRunProviderHealthCheck(machine.id)}
                            pendingSessionCleanupId={pendingSessionCleanupId}
                            onOpenSession={(sessionId) => navigate({ to: '/sessions/$sessionId', params: { sessionId } })}
                            onCleanupSession={(sessionId) => void handleCleanupSession(machine.id, sessionId)}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}
