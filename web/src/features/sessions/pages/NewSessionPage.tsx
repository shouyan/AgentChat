import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { NewSession } from '@/components/NewSession'
import { useAppContext } from '@/lib/app-context'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { isTelegramApp } from '@/hooks/useTelegram'
import { useMachines } from '@/features/machines/hooks/useMachines'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'

function BackIcon(props: { className?: string }) {
    return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}><polyline points="15 18 9 12 15 6" /></svg>
}

export default function NewSessionPage() {
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
        navigate({ to: '/sessions', replace: true })
        requestAnimationFrame(() => {
            navigate({ to: '/sessions/$sessionId', params: { sessionId } })
        })
    }, [navigate, queryClient])

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="flex items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-bg)] p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
                {!isTelegramApp() && <button type="button" onClick={goBack} className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"><BackIcon /></button>}
                <div className="flex-1 font-semibold">{t('newSession.title')}</div>
            </div>
            {machinesError ? <div className="p-3 text-sm text-red-600">{machinesError}</div> : null}
            <NewSession api={api} machines={machines} isLoading={machinesLoading} onCancel={handleCancel} onSuccess={handleSuccess} />
        </div>
    )
}
