import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import {
    FilesContent,
    FilesPageHeader,
    FilesTabBar,
    FilesToolbar,
} from '@/components/SessionFiles/FilesPageSections'
import { PathInputDialog } from '@/components/SessionFiles/PathInputDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAppContext } from '@/lib/app-context'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useGitStatusFiles } from '@/hooks/queries/useGitStatusFiles'
import { useSession } from '@/hooks/queries/useSession'
import { useSessionFileSearch } from '@/hooks/queries/useSessionFileSearch'
import { decodeBase64ToBytes, encodeBase64, encodeBytesToBase64 } from '@/lib/utils'
import { queryKeys } from '@/lib/query-keys'
import { useQueryClient } from '@tanstack/react-query'

type PathDialogState =
    | {
        kind: 'create-file'
        title: string
        description: string
        placeholder: string
        submitLabel: string
        submittingLabel: string
        initialValue?: string
    }
    | {
        kind: 'create-directory'
        title: string
        description: string
        placeholder: string
        submitLabel: string
        submittingLabel: string
        initialValue?: string
    }
    | {
        kind: 'rename'
        title: string
        description: string
        placeholder: string
        submitLabel: string
        submittingLabel: string
        initialValue: string
        targetPath: string
    }

export default function FilesPage() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const goBack = useAppGoBack()
    const { sessionId } = useParams({ from: '/sessions/$sessionId/files' })
    const search = useSearch({ from: '/sessions/$sessionId/files' })
    const { session } = useSession(api, sessionId)
    const [searchQuery, setSearchQuery] = useState('')
    const [pathDialog, setPathDialog] = useState<PathDialogState | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<null | { path: string; type: 'file' | 'directory' }>(null)
    const [isMutating, setIsMutating] = useState(false)
    const [actionError, setActionError] = useState<string | null>(null)
    const [uploadTargetPath, setUploadTargetPath] = useState('')
    const uploadInputRef = useRef<HTMLInputElement>(null)

    const initialTab = search.tab === 'changes' ? 'changes' : 'directories'
    const [activeTab, setActiveTab] = useState<'changes' | 'directories'>(initialTab)

    const {
        status: gitStatus,
        error: gitError,
        isLoading: gitLoading,
        refetch: refetchGit
    } = useGitStatusFiles(api, sessionId)

    const shouldSearch = Boolean(searchQuery)

    const searchResults = useSessionFileSearch(api, sessionId, searchQuery, {
        enabled: shouldSearch
    })

    const handleOpenFile = useCallback((path: string, staged?: boolean) => {
        const fromRoom = typeof search.fromRoom === 'string' ? search.fromRoom : undefined
        const fileSearch = staged === undefined
            ? (activeTab === 'directories'
                ? { path: encodeBase64(path), tab: 'directories' as const, ...(fromRoom ? { fromRoom } : {}) }
                : { path: encodeBase64(path), ...(fromRoom ? { fromRoom } : {}) })
            : (activeTab === 'directories'
                ? { path: encodeBase64(path), staged, tab: 'directories' as const, ...(fromRoom ? { fromRoom } : {}) }
                : { path: encodeBase64(path), staged, ...(fromRoom ? { fromRoom } : {}) })
        navigate({
            to: '/sessions/$sessionId/file',
            params: { sessionId },
            search: fileSearch
        })
    }, [activeTab, navigate, search.fromRoom, sessionId])

    const branchLabel = gitStatus?.branch ?? 'detached'
    const subtitle = session?.metadata?.path ?? sessionId
    const showGitErrorBanner = Boolean(gitError)
    const rootLabel = useMemo(() => {
        const base = session?.metadata?.path ?? sessionId
        const parts = base.split(/[/\\]/).filter(Boolean)
        return parts.length ? parts[parts.length - 1] : base
    }, [session?.metadata?.path, sessionId])

    const refreshFileQueries = useCallback(async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['session-directory', sessionId] }),
            queryClient.invalidateQueries({ queryKey: ['session-files', sessionId] }),
            queryClient.invalidateQueries({ queryKey: ['session-file', sessionId] }),
            queryClient.invalidateQueries({ queryKey: ['git-file-diff', sessionId] }),
            queryClient.invalidateQueries({ queryKey: queryKeys.gitStatus(sessionId) })
        ])
    }, [queryClient, sessionId])

    const runPathMutation = useCallback(async <T extends { success: boolean; error?: string },>(
        operation: () => Promise<T>
    ) => {
        setIsMutating(true)
        setActionError(null)
        try {
            const result = await operation()
            if (!result.success) {
                throw new Error(result.error ?? 'Operation failed')
            }
            await refreshFileQueries()
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Operation failed'
            setActionError(message)
            throw new Error(message)
        } finally {
            setIsMutating(false)
        }
    }, [refreshFileQueries])

    const handleDownloadFile = useCallback(async (path: string) => {
        if (!api) {
            return
        }

        setActionError(null)
        try {
            const result = await api.readSessionFile(sessionId, path)
            if (!result.success) {
                throw new Error(result.error ?? 'Failed to download file')
            }

            const decoded = decodeBase64ToBytes(result.content ?? '')
            if (!decoded.ok) {
                throw new Error('Failed to decode file content')
            }

            const blob = new Blob([decoded.bytes.buffer as ArrayBuffer])
            const url = window.URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = path.split('/').pop() || 'download'
            document.body.appendChild(anchor)
            anchor.click()
            anchor.remove()
            window.URL.revokeObjectURL(url)
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Failed to download file')
        }
    }, [api, sessionId])

    const openUploadPicker = useCallback((targetPath: string) => {
        setActionError(null)
        setUploadTargetPath(targetPath)
        uploadInputRef.current?.click()
    }, [])

    const handleUploadSelection = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(event.target.files ?? [])
        event.target.value = ''

        if (!api || selectedFiles.length === 0) {
            return
        }

        await runPathMutation(async () => {
            for (const file of selectedFiles) {
                const bytes = new Uint8Array(await file.arrayBuffer())
                const targetFilePath = uploadTargetPath ? `${uploadTargetPath}/${file.name}` : file.name
                const result = await api.writeSessionFile(
                    sessionId,
                    targetFilePath,
                    encodeBytesToBase64(bytes)
                )

                if (!result.success) {
                    return {
                        success: false,
                        error: result.error ?? `Failed to upload ${file.name}`
                    }
                }
            }

            return { success: true }
        })
    }, [api, runPathMutation, sessionId, uploadTargetPath])

    const handlePathDialogSubmit = useCallback(async (value: string) => {
        if (!api || !pathDialog) {
            return
        }

        if (pathDialog.kind === 'create-file') {
            await runPathMutation(() => api.writeSessionFile(sessionId, value, encodeBase64('')))
            return
        }

        if (pathDialog.kind === 'create-directory') {
            await runPathMutation(() => api.createSessionDirectory(sessionId, value))
            return
        }

        const nextPath = value.trim()
        if (nextPath === pathDialog.targetPath) {
            setActionError(null)
            return
        }

        await runPathMutation(() => api.renameSessionPath(sessionId, pathDialog.targetPath, nextPath))
    }, [api, pathDialog, runPathMutation, sessionId])

    const handleDeleteConfirm = useCallback(async () => {
        if (!api || !deleteTarget) {
            return
        }

        await runPathMutation(() => api.deleteSessionPath(
            sessionId,
            deleteTarget.path,
            deleteTarget.type === 'directory'
        ))
    }, [api, deleteTarget, runPathMutation, sessionId])

    const openRenameDialog = useCallback((path: string, type: 'file' | 'directory') => {
        setActionError(null)
        setPathDialog({
            kind: 'rename',
            title: type === 'file' ? 'Rename file' : 'Rename folder',
            description: 'Use a session-relative path. You can move items by changing parent folders.',
            placeholder: type === 'file' ? 'src/example.ts' : 'src/components',
            submitLabel: 'Rename',
            submittingLabel: 'Renaming…',
            initialValue: path,
            targetPath: path
        })
    }, [])

    const handleRefresh = useCallback(() => {
        if (searchQuery) {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.sessionFiles(sessionId, searchQuery)
            })
            return
        }

        if (activeTab === 'directories') {
            void queryClient.invalidateQueries({
                queryKey: ['session-directory', sessionId]
            })
            return
        }

        void refetchGit()
    }, [activeTab, queryClient, refetchGit, searchQuery, sessionId])

    const handleTabChange = useCallback((nextTab: 'changes' | 'directories') => {
        setActiveTab(nextTab)
        navigate({
            to: '/sessions/$sessionId/files',
            params: { sessionId },
            search: nextTab === 'changes' ? {} : { tab: nextTab },
            replace: true,
        })
    }, [navigate, sessionId])

    return (
        <div className="flex h-full flex-col">
            <FilesPageHeader subtitle={subtitle} onBack={goBack} onRefresh={handleRefresh} />
            <FilesToolbar
                searchQuery={searchQuery}
                shouldSearch={shouldSearch}
                isMutating={isMutating}
                actionError={actionError}
                onSearchChange={setSearchQuery}
                onUpload={() => openUploadPicker('')}
                onNewFile={() => {
                    setActionError(null)
                    setPathDialog({
                        kind: 'create-file',
                        title: 'New file',
                        description: 'Enter a path relative to this session directory.',
                        placeholder: 'src/new-file.ts',
                        submitLabel: 'Create file',
                        submittingLabel: 'Creating…'
                    })
                }}
                onNewFolder={() => {
                    setActionError(null)
                    setPathDialog({
                        kind: 'create-directory',
                        title: 'New folder',
                        description: 'Enter a path relative to this session directory.',
                        placeholder: 'src/new-folder',
                        submitLabel: 'Create folder',
                        submittingLabel: 'Creating…'
                    })
                }}
            />
            <FilesTabBar activeTab={activeTab} onChange={handleTabChange} />
            <FilesContent
                api={api}
                sessionId={sessionId}
                activeTab={activeTab}
                searchQuery={searchQuery}
                shouldSearch={shouldSearch}
                showGitErrorBanner={showGitErrorBanner}
                gitError={gitError}
                gitLoading={gitLoading}
                gitStatus={gitStatus}
                searchResults={searchResults}
                rootLabel={rootLabel}
                actionsDisabled={isMutating}
                branchLabel={branchLabel}
                onOpenFile={handleOpenFile}
                onUploadToFolder={openUploadPicker}
                onRenamePath={openRenameDialog}
                onDeletePath={(path, type) => {
                    setActionError(null)
                    setDeleteTarget({ path, type })
                }}
                onDownloadFile={handleDownloadFile}
            />

            <PathInputDialog
                isOpen={pathDialog !== null}
                title={pathDialog?.title ?? 'Edit path'}
                description={pathDialog?.description}
                placeholder={pathDialog?.placeholder ?? 'src/example.ts'}
                initialValue={pathDialog?.initialValue}
                submitLabel={pathDialog?.submitLabel ?? 'Save'}
                submittingLabel={pathDialog?.submittingLabel ?? 'Saving…'}
                isPending={isMutating}
                onClose={() => setPathDialog(null)}
                onSubmit={handlePathDialogSubmit}
            />

            <ConfirmDialog
                isOpen={deleteTarget !== null}
                onClose={() => setDeleteTarget(null)}
                title={deleteTarget?.type === 'directory' ? 'Delete folder?' : 'Delete file?'}
                description={deleteTarget
                    ? `Delete ${deleteTarget.path}${deleteTarget.type === 'directory' ? ' and everything inside it' : ''}? This cannot be undone.`
                    : ''}
                confirmLabel={deleteTarget?.type === 'directory' ? 'Delete folder' : 'Delete file'}
                confirmingLabel="Deleting…"
                onConfirm={handleDeleteConfirm}
                isPending={isMutating}
                destructive
            />

            <input
                ref={uploadInputRef}
                type="file"
                className="hidden"
                multiple
                onChange={handleUploadSelection}
            />
        </div>
    )
}
