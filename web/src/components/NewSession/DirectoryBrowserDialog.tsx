import { useEffect, useMemo, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { useMachineDirectory } from '@/hooks/queries/useMachineDirectory'
import { useTranslation } from '@/lib/use-translation'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'

function HomeIcon(props: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={props.className}>
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
            <path d="M9 21v-6h6v6" />
        </svg>
    )
}

function ArrowUpIcon(props: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={props.className}>
            <path d="M12 19V5" />
            <path d="m5 12 7-7 7 7" />
        </svg>
    )
}

function FolderIcon(props: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={props.className}>
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
    )
}

export function DirectoryBrowserDialog(props: {
    api: ApiClient
    machineId: string | null
    isOpen: boolean
    initialPath: string
    onClose: () => void
    onSelect: (path: string) => void
}) {
    const { t } = useTranslation()
    const [requestedPath, setRequestedPath] = useState('')

    useEffect(() => {
        if (!props.isOpen) return
        setRequestedPath(props.initialPath.trim())
    }, [props.initialPath, props.isOpen])

    const query = useMachineDirectory(props.api, props.machineId, requestedPath, props.isOpen)
    const currentPath = query.path ?? requestedPath.trim()
    const directoryEntries = useMemo(
        () => query.entries.filter((entry) => entry.type === 'directory'),
        [query.entries]
    )

    const handleUseDirectory = () => {
        if (!currentPath) return
        props.onSelect(currentPath)
        props.onClose()
    }

    const canGoUp = Boolean(query.parentPath && query.parentPath !== currentPath)

    return (
        <Dialog open={props.isOpen} onOpenChange={(open) => !open && props.onClose()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('newSession.browse.title')}</DialogTitle>
                    <DialogDescription>
                        {t('newSession.browse.description')}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setRequestedPath('')}
                            disabled={!props.machineId || query.isLoading}
                            title={t('newSession.browse.home')}
                        >
                            <HomeIcon className="mr-1 h-4 w-4" />
                            {t('newSession.browse.home')}
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => query.parentPath && setRequestedPath(query.parentPath)}
                            disabled={!canGoUp || query.isLoading}
                            title={t('newSession.browse.up')}
                        >
                            <ArrowUpIcon className="mr-1 h-4 w-4" />
                            {t('newSession.browse.up')}
                        </Button>
                    </div>

                    <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-3 py-2 text-sm">
                        <div className="text-xs text-[var(--app-hint)]">{t('newSession.browse.current')}</div>
                        <div className="mt-1 break-all font-mono text-[var(--app-fg)]">
                            {currentPath || '—'}
                        </div>
                    </div>

                    <div className="max-h-[420px] overflow-y-auto rounded-lg border border-[var(--app-border)]">
                        {query.isLoading ? (
                            <div className="px-4 py-6 text-sm text-[var(--app-hint)]">
                                {t('newSession.browse.loading')}
                            </div>
                        ) : query.error ? (
                            <div className="px-4 py-6 text-sm text-red-600">
                                {query.error}
                            </div>
                        ) : directoryEntries.length === 0 ? (
                            <div className="px-4 py-6 text-sm text-[var(--app-hint)]">
                                {t('newSession.browse.empty')}
                            </div>
                        ) : (
                            <div className="divide-y divide-[var(--app-border)]">
                                {directoryEntries.map((entry) => (
                                    <div key={entry.path} className="flex items-center justify-between gap-3 px-3 py-2">
                                        <button
                                            type="button"
                                            onClick={() => setRequestedPath(entry.path)}
                                            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-[var(--app-fg)] hover:bg-[var(--app-secondary-bg)]"
                                        >
                                            <FolderIcon className="h-4 w-4 shrink-0 text-[var(--app-link)]" />
                                            <span className="truncate">{entry.name}</span>
                                        </button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                props.onSelect(entry.path)
                                                props.onClose()
                                            }}
                                        >
                                            {t('newSession.browse.select')}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={props.onClose}>
                            {t('button.cancel')}
                        </Button>
                        <Button
                            type="button"
                            onClick={handleUseDirectory}
                            disabled={!props.machineId || !currentPath || query.isLoading || Boolean(query.error)}
                        >
                            {t('newSession.browse.useCurrent')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
