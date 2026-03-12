import type { FileSearchItem, GitFileStatus } from '@/types/api'
import { FileIcon } from '@/components/FileIcon'
import { DirectoryTree } from '@/components/SessionFiles/DirectoryTree'
import { Button } from '@/components/ui/button'
import type { ApiClient } from '@/api/client'
import { useMemo } from 'react'

function BackIcon(props: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

function RefreshIcon(props: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <polyline points="21 3 21 9 15 9" />
        </svg>
    )
}

function SearchIcon(props: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
    )
}

function GitBranchIcon(props: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="6" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
    )
}

function FolderIcon(props: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
    )
}

function StatusBadge(props: { status: GitFileStatus['status'] }) {
    const { label, color } = useMemo(() => {
        switch (props.status) {
            case 'added':
                return { label: 'A', color: 'var(--app-git-staged-color)' }
            case 'deleted':
                return { label: 'D', color: 'var(--app-git-deleted-color)' }
            case 'renamed':
                return { label: 'R', color: 'var(--app-git-renamed-color)' }
            case 'untracked':
                return { label: '?', color: 'var(--app-git-untracked-color)' }
            case 'conflicted':
                return { label: 'U', color: 'var(--app-git-deleted-color)' }
            default:
                return { label: 'M', color: 'var(--app-git-unstaged-color)' }
        }
    }, [props.status])

    return <span className="inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[10px] font-semibold" style={{ color, borderColor: color }}>{label}</span>
}

function LineChanges(props: { added: number; removed: number }) {
    if (!props.added && !props.removed) return null
    return (
        <span className="flex items-center gap-1 text-[11px] font-mono">
            {props.added ? <span className="text-[var(--app-diff-added-text)]">+{props.added}</span> : null}
            {props.removed ? <span className="text-[var(--app-diff-removed-text)]">-{props.removed}</span> : null}
        </span>
    )
}

function GitFileRow(props: { file: GitFileStatus; onOpen: () => void; showDivider: boolean }) {
    const subtitle = props.file.filePath || 'project root'
    return (
        <button type="button" onClick={props.onOpen} className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--app-subtle-bg)] ${props.showDivider ? 'border-b border-[var(--app-divider)]' : ''}`}>
            <FileIcon fileName={props.file.fileName} size={22} />
            <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{props.file.fileName}</div>
                <div className="truncate text-xs text-[var(--app-hint)]">{subtitle}</div>
            </div>
            <div className="flex items-center gap-2">
                <LineChanges added={props.file.linesAdded} removed={props.file.linesRemoved} />
                <StatusBadge status={props.file.status} />
            </div>
        </button>
    )
}

function SearchResultRow(props: { file: FileSearchItem; onOpen: () => void; showDivider: boolean }) {
    const subtitle = props.file.filePath || 'project root'
    const icon = props.file.fileType === 'file'
        ? <FileIcon fileName={props.file.fileName} size={22} />
        : <FolderIcon className="text-[var(--app-link)]" />

    return (
        <button type="button" onClick={props.onOpen} className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--app-subtle-bg)] ${props.showDivider ? 'border-b border-[var(--app-divider)]' : ''}`}>
            {icon}
            <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{props.file.fileName}</div>
                <div className="truncate text-xs text-[var(--app-hint)]">{subtitle}</div>
            </div>
        </button>
    )
}

function FileListSkeleton(props: { label: string; rows?: number }) {
    const titleWidths = ['w-1/3', 'w-1/2', 'w-2/3', 'w-2/5', 'w-3/5']
    const subtitleWidths = ['w-1/2', 'w-2/3', 'w-3/4', 'w-1/3']
    const rows = props.rows ?? 6

    return (
        <div className="animate-pulse space-y-3 p-3" role="status" aria-live="polite">
            <span className="sr-only">{props.label}</span>
            {Array.from({ length: rows }).map((_, index) => (
                <div key={`skeleton-row-${index}`} className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded bg-[var(--app-subtle-bg)]" />
                    <div className="flex-1 space-y-2">
                        <div className={`h-3 ${titleWidths[index % titleWidths.length]} rounded bg-[var(--app-subtle-bg)]`} />
                        <div className={`h-2 ${subtitleWidths[index % subtitleWidths.length]} rounded bg-[var(--app-subtle-bg)]`} />
                    </div>
                </div>
            ))}
        </div>
    )
}

export function FilesPageHeader(props: { subtitle: string; onBack: () => void; onRefresh: () => void }) {
    return (
        <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
            <div className="mx-auto flex w-full max-w-content items-center gap-2 border-b border-[var(--app-border)] p-3">
                <button type="button" onClick={props.onBack} className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]">
                    <BackIcon />
                </button>
                <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">Project Files</div>
                    <div className="truncate text-xs text-[var(--app-hint)]">{props.subtitle}</div>
                </div>
                <button type="button" onClick={props.onRefresh} className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]" title="Refresh">
                    <RefreshIcon />
                </button>
            </div>
        </div>
    )
}

export function FilesToolbar(props: {
    searchQuery: string
    shouldSearch: boolean
    isMutating: boolean
    actionError: string | null
    onSearchChange: (value: string) => void
    onUpload: () => void
    onNewFile: () => void
    onNewFolder: () => void
}) {
    return (
        <div className="bg-[var(--app-bg)]">
            <div className="mx-auto w-full max-w-content border-b border-[var(--app-border)] p-3">
                <div className="flex items-center gap-2 rounded-md bg-[var(--app-subtle-bg)] px-3 py-2">
                    <SearchIcon className="text-[var(--app-hint)]" />
                    <input
                        value={props.searchQuery}
                        onChange={(event) => props.onSearchChange(event.target.value)}
                        placeholder="Search files in current directory"
                        className="w-full bg-transparent text-sm text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:outline-none"
                        autoCapitalize="none"
                        autoCorrect="off"
                    />
                </div>
                {!props.shouldSearch ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="secondary" onClick={props.onUpload} disabled={props.isMutating}>Upload</Button>
                        <Button type="button" size="sm" variant="secondary" onClick={props.onNewFile} disabled={props.isMutating}>New File</Button>
                        <Button type="button" size="sm" variant="secondary" onClick={props.onNewFolder} disabled={props.isMutating}>New Folder</Button>
                    </div>
                ) : null}
                {props.actionError ? (
                    <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{props.actionError}</div>
                ) : null}
            </div>
        </div>
    )
}

export function FilesTabBar(props: { activeTab: 'changes' | 'directories'; onChange: (tab: 'changes' | 'directories') => void }) {
    return (
        <div className="border-b border-[var(--app-divider)] bg-[var(--app-bg)]" role="tablist">
            <div className="mx-auto grid w-full max-w-content grid-cols-2">
                {(['changes', 'directories'] as const).map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={props.activeTab === tab}
                        onClick={() => props.onChange(tab)}
                        className={`relative py-3 text-center text-sm font-semibold transition-colors hover:bg-[var(--app-subtle-bg)] ${props.activeTab === tab ? 'text-[var(--app-fg)]' : 'text-[var(--app-hint)]'}`}
                    >
                        {tab === 'changes' ? 'Changes' : 'Directory Tree'}
                        <span className={`absolute bottom-0 left-1/2 h-0.5 w-10 -translate-x-1/2 rounded-full ${props.activeTab === tab ? 'bg-[var(--app-link)]' : 'bg-transparent'}`} />
                    </button>
                ))}
            </div>
        </div>
    )
}

export function FilesContent(props: {
    api: ApiClient | null
    sessionId: string
    activeTab: 'changes' | 'directories'
    searchQuery: string
    shouldSearch: boolean
    showGitErrorBanner: boolean
    gitError: string | null
    gitLoading: boolean
    gitStatus: {
        branch: string | null
        totalStaged: number
        totalUnstaged: number
        stagedFiles: GitFileStatus[]
        unstagedFiles: GitFileStatus[]
    } | null
    searchResults: {
        isLoading: boolean
        error: string | null
        files: FileSearchItem[]
    }
    rootLabel: string
    actionsDisabled: boolean
    branchLabel: string
    onOpenFile: (path: string, staged?: boolean) => void
    onUploadToFolder: (path: string) => void
    onRenamePath: (path: string, type: 'file' | 'directory') => void
    onDeletePath: (path: string, type: 'file' | 'directory') => void
    onDownloadFile: (path: string) => void
}) {
    return (
        <>
            {!props.gitLoading && props.gitStatus && !props.searchQuery && props.activeTab === 'changes' ? (
                <div className="bg-[var(--app-bg)]">
                    <div className="mx-auto w-full max-w-content border-b border-[var(--app-divider)] px-3 py-2">
                        <div className="flex items-center gap-2 text-sm">
                            <GitBranchIcon className="text-[var(--app-hint)]" />
                            <span className="font-semibold">{props.branchLabel}</span>
                        </div>
                        <div className="text-xs text-[var(--app-hint)]">{props.gitStatus.totalStaged} staged, {props.gitStatus.totalUnstaged} unstaged</div>
                    </div>
                </div>
            ) : null}

            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-content">
                    {props.showGitErrorBanner && props.activeTab === 'changes' ? (
                        <div className="border-b border-[var(--app-divider)] bg-amber-500/10 px-3 py-2 text-xs text-[var(--app-hint)]">{props.gitError}</div>
                    ) : null}
                    {props.shouldSearch ? (
                        props.searchResults.isLoading ? (
                            <FileListSkeleton label="Loading files…" />
                        ) : props.searchResults.error ? (
                            <div className="p-6 text-sm text-[var(--app-hint)]">{props.searchResults.error}</div>
                        ) : props.searchResults.files.length === 0 ? (
                            <div className="p-6 text-sm text-[var(--app-hint)]">{props.searchQuery ? 'No files match your search.' : 'No files found in this project.'}</div>
                        ) : (
                            <div className="border-t border-[var(--app-divider)]">
                                {props.searchResults.files.map((file, index) => (
                                    <SearchResultRow key={`${file.fullPath}-${index}`} file={file} onOpen={() => props.onOpenFile(file.fullPath)} showDivider={index < props.searchResults.files.length - 1} />
                                ))}
                            </div>
                        )
                    ) : props.activeTab === 'directories' ? (
                        <DirectoryTree
                            api={props.api}
                            sessionId={props.sessionId}
                            rootLabel={props.rootLabel}
                            onOpenFile={(path) => props.onOpenFile(path)}
                            onUploadToFolder={props.onUploadToFolder}
                            onRenamePath={props.onRenamePath}
                            onDeletePath={props.onDeletePath}
                            onDownloadFile={props.onDownloadFile}
                            actionsDisabled={props.actionsDisabled}
                        />
                    ) : props.gitLoading ? (
                        <FileListSkeleton label="Loading Git status…" />
                    ) : (
                        <div>
                            {props.gitStatus?.stagedFiles.length ? (
                                <div>
                                    <div className="border-b border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 text-xs font-semibold text-[var(--app-git-staged-color)]">Staged Changes ({props.gitStatus.stagedFiles.length})</div>
                                    {props.gitStatus.stagedFiles.map((file, index) => (
                                        <GitFileRow key={`staged-${file.fullPath}-${index}`} file={file} onOpen={() => props.onOpenFile(file.fullPath, file.isStaged)} showDivider={index < props.gitStatus!.stagedFiles.length - 1 || props.gitStatus!.unstagedFiles.length > 0} />
                                    ))}
                                </div>
                            ) : null}

                            {props.gitStatus?.unstagedFiles.length ? (
                                <div>
                                    <div className="border-b border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 text-xs font-semibold text-[var(--app-git-unstaged-color)]">Unstaged Changes ({props.gitStatus.unstagedFiles.length})</div>
                                    {props.gitStatus.unstagedFiles.map((file, index) => (
                                        <GitFileRow key={`unstaged-${file.fullPath}-${index}`} file={file} onOpen={() => props.onOpenFile(file.fullPath, file.isStaged)} showDivider={index < props.gitStatus!.unstagedFiles.length - 1} />
                                    ))}
                                </div>
                            ) : null}

                            {!props.gitStatus ? <div className="p-6 text-sm text-[var(--app-hint)]">Git status unavailable. Use Directories to browse all files, or search.</div> : null}
                            {props.gitStatus && props.gitStatus.stagedFiles.length === 0 && props.gitStatus.unstagedFiles.length === 0 ? (
                                <div className="p-6 text-sm text-[var(--app-hint)]">No changes detected. Use Directories to browse all files, or search.</div>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}
