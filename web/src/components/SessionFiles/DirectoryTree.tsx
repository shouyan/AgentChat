import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { ApiClient } from '@/api/client'
import { FileIcon } from '@/components/FileIcon'
import { useSessionDirectory } from '@/hooks/queries/useSessionDirectory'

function EditIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M12 20h9" />
            <path d="m16.5 3.5 4 4L7 21l-4 1 1-4z" />
        </svg>
    )
}

function DownloadIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
    )
}

function UploadIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
    )
}

function TrashIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
    )
}

function TreeActionButton(props: {
    title: string
    onClick: () => void
    children: ReactNode
    destructive?: boolean
    disabled?: boolean
}) {
    return (
        <button
            type="button"
            onClick={(event) => {
                event.stopPropagation()
                props.onClick()
            }}
            className={`flex h-7 w-7 items-center justify-center rounded text-[var(--app-hint)] transition-colors hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] ${props.destructive ? 'hover:text-red-500' : ''}`}
            title={props.title}
            aria-label={props.title}
            disabled={props.disabled}
        >
            {props.children}
        </button>
    )
}

function ChevronIcon(props: { className?: string; collapsed: boolean }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`${props.className ?? ''} transition-transform duration-200 ${props.collapsed ? '' : 'rotate-90'}`}
        >
            <polyline points="9 18 15 12 9 6" />
        </svg>
    )
}

function FolderIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
    )
}

function DirectorySkeleton(props: { depth: number; rows?: number }) {
    const rows = props.rows ?? 4
    const indent = 12 + props.depth * 14

    return (
        <div className="animate-pulse">
            {Array.from({ length: rows }).map((_, index) => (
                <div
                    key={`dir-skel-${props.depth}-${index}`}
                    className="flex items-center gap-3 px-3 py-2"
                    style={{ paddingLeft: indent }}
                >
                    <div className="h-5 w-5 rounded bg-[var(--app-subtle-bg)]" />
                    <div className="h-3 w-40 rounded bg-[var(--app-subtle-bg)]" />
                </div>
            ))}
        </div>
    )
}

function DirectoryErrorRow(props: { depth: number; message: string }) {
    const indent = 12 + props.depth * 14
    return (
        <div
            className="px-3 py-2 text-xs text-[var(--app-hint)] bg-amber-500/10"
            style={{ paddingLeft: indent }}
        >
            {props.message}
        </div>
    )
}

function DirectoryNode(props: {
    api: ApiClient | null
    sessionId: string
    path: string
    label: string
    depth: number
    onOpenFile: (path: string) => void
    onUploadToFolder: (path: string) => void
    onRenamePath: (path: string, type: 'file' | 'directory') => void
    onDeletePath: (path: string, type: 'file' | 'directory') => void
    onDownloadFile: (path: string) => void
    actionsDisabled?: boolean
    expanded: Set<string>
    onToggle: (path: string) => void
}) {
    const isExpanded = props.expanded.has(props.path)
    const { entries, error, isLoading } = useSessionDirectory(props.api, props.sessionId, props.path, {
        enabled: isExpanded
    })

    const directories = useMemo(() => entries.filter((entry) => entry.type === 'directory'), [entries])
    const files = useMemo(() => entries.filter((entry) => entry.type === 'file'), [entries])
    const childDepth = props.depth + 1

    const indent = 12 + props.depth * 14
    const childIndent = 12 + childDepth * 14

    return (
        <div>
            <div
                className="flex items-center gap-2 px-2 py-1.5 transition-colors hover:bg-[var(--app-subtle-bg)]"
                style={{ paddingLeft: indent }}
            >
                <button
                    type="button"
                    onClick={() => props.onToggle(props.path)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded px-1 py-1 text-left"
                >
                    <ChevronIcon collapsed={!isExpanded} className="text-[var(--app-hint)]" />
                    <FolderIcon className="text-[var(--app-link)]" />
                    <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{props.label}</div>
                    </div>
                </button>

                {props.path ? (
                    <div className="flex items-center gap-1">
                        <TreeActionButton
                            title="Upload file to folder"
                            onClick={() => props.onUploadToFolder(props.path)}
                            disabled={props.actionsDisabled}
                        >
                            <UploadIcon />
                        </TreeActionButton>
                        <TreeActionButton
                            title="Rename folder"
                            onClick={() => props.onRenamePath(props.path, 'directory')}
                            disabled={props.actionsDisabled}
                        >
                            <EditIcon />
                        </TreeActionButton>
                        <TreeActionButton
                            title="Delete folder"
                            onClick={() => props.onDeletePath(props.path, 'directory')}
                            destructive
                            disabled={props.actionsDisabled}
                        >
                            <TrashIcon />
                        </TreeActionButton>
                    </div>
                ) : null}
            </div>

            {isExpanded ? (
                isLoading ? (
                    <DirectorySkeleton depth={childDepth} />
                ) : error ? (
                    <DirectoryErrorRow depth={childDepth} message={error} />
                ) : (
                    <div>
                        {directories.map((entry) => {
                            const childPath = props.path ? `${props.path}/${entry.name}` : entry.name
                            return (
                                <DirectoryNode
                                    key={childPath}
                                    api={props.api}
                                    sessionId={props.sessionId}
                                    path={childPath}
                                    label={entry.name}
                                    depth={childDepth}
                                    onOpenFile={props.onOpenFile}
                                    onUploadToFolder={props.onUploadToFolder}
                                    onRenamePath={props.onRenamePath}
                                    onDeletePath={props.onDeletePath}
                                    onDownloadFile={props.onDownloadFile}
                                    actionsDisabled={props.actionsDisabled}
                                    expanded={props.expanded}
                                    onToggle={props.onToggle}
                                />
                            )
                        })}

                        {files.map((entry) => {
                            const filePath = props.path ? `${props.path}/${entry.name}` : entry.name
                            return (
                                <div
                                    key={filePath}
                                    className="flex items-center gap-2 px-2 py-1.5 transition-colors hover:bg-[var(--app-subtle-bg)]"
                                    style={{ paddingLeft: childIndent }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => props.onOpenFile(filePath)}
                                        className="flex min-w-0 flex-1 items-center gap-3 rounded px-1 py-1 text-left"
                                    >
                                        <span className="h-4 w-4" />
                                        <FileIcon fileName={entry.name} size={22} />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-medium">{entry.name}</div>
                                        </div>
                                    </button>
                                    <div className="flex items-center gap-1">
                                        <TreeActionButton
                                            title="Download file"
                                            onClick={() => props.onDownloadFile(filePath)}
                                            disabled={props.actionsDisabled}
                                        >
                                            <DownloadIcon />
                                        </TreeActionButton>
                                        <TreeActionButton
                                            title="Rename file"
                                            onClick={() => props.onRenamePath(filePath, 'file')}
                                            disabled={props.actionsDisabled}
                                        >
                                            <EditIcon />
                                        </TreeActionButton>
                                        <TreeActionButton
                                            title="Delete file"
                                            onClick={() => props.onDeletePath(filePath, 'file')}
                                            destructive
                                            disabled={props.actionsDisabled}
                                        >
                                            <TrashIcon />
                                        </TreeActionButton>
                                    </div>
                                </div>
                            )
                        })}

                        {directories.length === 0 && files.length === 0 ? (
                            <div
                                className="px-3 py-2 text-sm text-[var(--app-hint)]"
                                style={{ paddingLeft: childIndent }}
                            >
                                Empty directory.
                            </div>
                        ) : null}
                    </div>
                )
            ) : null}
        </div>
    )
}

export function DirectoryTree(props: {
    api: ApiClient | null
    sessionId: string
    rootLabel: string
    onOpenFile: (path: string) => void
    onUploadToFolder: (path: string) => void
    onRenamePath: (path: string, type: 'file' | 'directory') => void
    onDeletePath: (path: string, type: 'file' | 'directory') => void
    onDownloadFile: (path: string) => void
    actionsDisabled?: boolean
}) {
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']))

    const handleToggle = useCallback((path: string) => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(path)) {
                next.delete(path)
            } else {
                next.add(path)
            }
            return next
        })
    }, [])

    return (
        <div className="border-t border-[var(--app-divider)]">
            <DirectoryNode
                api={props.api}
                sessionId={props.sessionId}
                path=""
                label={props.rootLabel}
                depth={0}
                onOpenFile={props.onOpenFile}
                onUploadToFolder={props.onUploadToFolder}
                onRenamePath={props.onRenamePath}
                onDeletePath={props.onDeletePath}
                onDownloadFile={props.onDownloadFile}
                actionsDisabled={props.actionsDisabled}
                expanded={expanded}
                onToggle={handleToggle}
            />
        </div>
    )
}
