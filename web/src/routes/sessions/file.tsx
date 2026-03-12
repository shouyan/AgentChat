import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useSearch } from '@tanstack/react-router'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { GitCommandResponse } from '@/types/api'
import { FileIcon } from '@/components/FileIcon'
import { CopyIcon, CheckIcon } from '@/components/icons'
import { useAppContext } from '@/lib/app-context'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { formatJsonForPreview, getFileMimeType, isEditableFile, resolveFilePreviewKind } from '@/lib/filePreview'
import { queryKeys } from '@/lib/query-keys'
import { langAlias, useShikiHighlighter } from '@/lib/shiki'
import { decodeBase64, decodeBase64ToBytes, encodeBase64 } from '@/lib/utils'

const MAX_COPYABLE_FILE_BYTES = 1_000_000

function decodePath(value: string): string {
    if (!value) return ''
    const decoded = decodeBase64(value)
    return decoded.ok ? decoded.text : value
}

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

function DiffDisplay(props: { diffContent: string }) {
    const lines = props.diffContent.split('\n')

    return (
        <div className="overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-bg)]">
            {lines.map((line, index) => {
                const isAdd = line.startsWith('+') && !line.startsWith('+++')
                const isRemove = line.startsWith('-') && !line.startsWith('---')
                const isHunk = line.startsWith('@@')
                const isHeader = line.startsWith('+++') || line.startsWith('---')

                const className = [
                    'whitespace-pre-wrap px-3 py-0.5 text-xs font-mono',
                    isAdd ? 'bg-[var(--app-diff-added-bg)] text-[var(--app-diff-added-text)]' : '',
                    isRemove ? 'bg-[var(--app-diff-removed-bg)] text-[var(--app-diff-removed-text)]' : '',
                    isHunk ? 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)] font-semibold' : '',
                    isHeader ? 'text-[var(--app-hint)] font-semibold' : ''
                ].filter(Boolean).join(' ')

                const style = isAdd
                    ? { borderLeft: '2px solid var(--app-git-staged-color)' }
                    : isRemove
                        ? { borderLeft: '2px solid var(--app-git-deleted-color)' }
                        : undefined

                return (
                    <div key={`${index}-${line}`} className={className} style={style}>
                        {line || ' '}
                    </div>
                )
            })}
        </div>
    )
}

function FileContentSkeleton() {
    const widths = ['w-full', 'w-11/12', 'w-5/6', 'w-3/4', 'w-2/3', 'w-4/5']

    return (
        <div role="status" aria-live="polite">
            <span className="sr-only">Loading file…</span>
            <div className="animate-pulse space-y-2 rounded-md border border-[var(--app-border)] bg-[var(--app-code-bg)] p-3">
                {Array.from({ length: 12 }).map((_, index) => (
                    <div key={`file-skeleton-${index}`} className={`h-3 ${widths[index % widths.length]} rounded bg-[var(--app-subtle-bg)]`} />
                ))}
            </div>
        </div>
    )
}

function resolveLanguage(path: string): string | undefined {
    const parts = path.split('.')
    if (parts.length <= 1) return undefined
    const ext = parts[parts.length - 1]?.toLowerCase()
    if (!ext) return undefined
    return langAlias[ext] ?? ext
}

function getUtf8ByteLength(value: string): number {
    return new TextEncoder().encode(value).length
}

function isBinaryContent(content: string): boolean {
    if (!content) return false
    if (content.includes('\0')) return true
    const nonPrintable = content.split('').filter((char) => {
        const code = char.charCodeAt(0)
        return code < 32 && code !== 9 && code !== 10 && code !== 13
    }).length
    return nonPrintable / content.length > 0.1
}

function extractCommandError(result: GitCommandResponse | undefined): string | null {
    if (!result) return null
    if (result.success) return null
    return result.error ?? result.stderr ?? 'Failed to load diff'
}

export default function FilePage() {
    const { api } = useAppContext()
    const queryClient = useQueryClient()
    const { copied: pathCopied, copy: copyPath } = useCopyToClipboard()
    const { copied: contentCopied, copy: copyContent } = useCopyToClipboard()
    const goBack = useAppGoBack()
    const { sessionId } = useParams({ from: '/sessions/$sessionId/file' })
    const search = useSearch({ from: '/sessions/$sessionId/file' })
    const encodedPath = typeof search.path === 'string' ? search.path : ''
    const staged = search.staged

    const filePath = useMemo(() => decodePath(encodedPath), [encodedPath])
    const fileName = filePath.split('/').pop() || filePath || 'File'

    const diffQuery = useQuery({
        queryKey: queryKeys.gitFileDiff(sessionId, filePath, staged),
        queryFn: async () => {
            if (!api || !sessionId || !filePath) {
                throw new Error('Missing session or path')
            }
            return await api.getGitDiffFile(sessionId, filePath, staged)
        },
        enabled: Boolean(api && sessionId && filePath)
    })

    const fileQuery = useQuery({
        queryKey: queryKeys.sessionFile(sessionId, filePath),
        queryFn: async () => {
            if (!api || !sessionId || !filePath) {
                throw new Error('Missing session or path')
            }
            return await api.readSessionFile(sessionId, filePath)
        },
        enabled: Boolean(api && sessionId && filePath)
    })

    const diffContent = diffQuery.data?.success ? (diffQuery.data.stdout ?? '') : ''
    const diffError = extractCommandError(diffQuery.data)
    const diffSuccess = diffQuery.data?.success === true
    const diffFailed = diffQuery.data?.success === false

    const fileContentResult = fileQuery.data
    const decodedContentResult = fileContentResult?.success && fileContentResult.content
        ? decodeBase64(fileContentResult.content)
        : { text: '', ok: true }
    const decodedContent = decodedContentResult.text
    const binaryFile = fileContentResult?.success
        ? !decodedContentResult.ok || isBinaryContent(decodedContent)
        : false
    const previewKind = useMemo(() => resolveFilePreviewKind(filePath, binaryFile), [binaryFile, filePath])
    const canEditFile = useMemo(() => isEditableFile(filePath, binaryFile), [binaryFile, filePath])
    const prettyJsonContent = useMemo(
        () => (previewKind === 'json' ? formatJsonForPreview(decodedContent) : null),
        [decodedContent, previewKind]
    )
    const sourceContent = previewKind === 'json' && prettyJsonContent ? prettyJsonContent : decodedContent

    const language = useMemo(() => resolveLanguage(filePath), [filePath])
    const highlighted = useShikiHighlighter(sourceContent, language)
    const contentSizeBytes = useMemo(
        () => (sourceContent ? getUtf8ByteLength(sourceContent) : 0),
        [sourceContent]
    )
    const canCopyContent = fileContentResult?.success === true
        && !binaryFile
        && sourceContent.length > 0
        && contentSizeBytes <= MAX_COPYABLE_FILE_BYTES

    const [displayMode, setDisplayMode] = useState<'diff' | 'preview' | 'source' | 'edit'>('preview')
    const [editorContent, setEditorContent] = useState('')
    const [savedContent, setSavedContent] = useState('')
    const [savedHash, setSavedHash] = useState<string | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saveStatus, setSaveStatus] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const isDirty = editorContent !== savedContent
    const imageSrc = fileContentResult?.success && fileContentResult.content
        ? `data:${getFileMimeType(filePath)};base64,${fileContentResult.content}`
        : null

    useEffect(() => {
        if (diffSuccess && diffContent) {
            setDisplayMode('diff')
            return
        }
        if (previewKind === 'image' || previewKind === 'markdown' || previewKind === 'json') {
            setDisplayMode('preview')
            return
        }
        if (canEditFile) {
            setDisplayMode('source')
            return
        }
        setDisplayMode('preview')
    }, [canEditFile, diffContent, diffSuccess, previewKind])

    useEffect(() => {
        if (!fileContentResult?.success || binaryFile) return
        const nextHash = fileContentResult.hash ?? null
        if (isDirty && savedHash === nextHash) {
            return
        }
        setEditorContent(decodedContent)
        setSavedContent(decodedContent)
        setSavedHash(nextHash)
    }, [binaryFile, decodedContent, fileContentResult, isDirty, savedHash])

    const loading = diffQuery.isLoading || fileQuery.isLoading
    const fileError = fileContentResult && !fileContentResult.success
        ? (fileContentResult.error ?? 'Failed to read file')
        : null
    const missingPath = !filePath
    const diffErrorMessage = diffError ? `Diff unavailable: ${diffError}` : null

    const handleDownload = () => {
        if (!fileContentResult?.success || !fileContentResult.content) return
        const decoded = decodeBase64ToBytes(fileContentResult.content)
        if (!decoded.ok) return

        const byteBuffer = new ArrayBuffer(decoded.bytes.byteLength)
        new Uint8Array(byteBuffer).set(decoded.bytes)
        const blob = new Blob([byteBuffer], { type: getFileMimeType(filePath) })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = fileName
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        URL.revokeObjectURL(url)
    }

    const handleSave = async () => {
        if (!api || !filePath || !canEditFile) return
        setIsSaving(true)
        setSaveError(null)
        setSaveStatus(null)

        try {
            const result = await api.writeSessionFile(sessionId, filePath, encodeBase64(editorContent), savedHash)
            if (!result.success) {
                throw new Error(result.error ?? 'Failed to save file')
            }

            setSavedContent(editorContent)
            setSavedHash(result.hash ?? null)
            setSaveStatus('Saved')

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.sessionFile(sessionId, filePath) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.gitFileDiff(sessionId, filePath, staged) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.gitStatus(sessionId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.sessionDirectory(sessionId, '') }),
            ])
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : 'Failed to save file')
        } finally {
            setIsSaving(false)
        }
    }

    const renderPreview = () => {
        if (previewKind === 'image') {
            if (!imageSrc) {
                return <div className="text-sm text-[var(--app-hint)]">Image unavailable.</div>
            }
            return (
                <div className="overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
                    <img src={imageSrc} alt={fileName} className="mx-auto max-h-[70vh] max-w-full rounded object-contain" />
                </div>
            )
        }

        if (previewKind === 'markdown') {
            return (
                <div className="markdown-content rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-4 text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {decodedContent}
                    </ReactMarkdown>
                </div>
            )
        }

        if (previewKind === 'json') {
            return (
                <pre className="shiki overflow-auto rounded-md bg-[var(--app-code-bg)] p-3 text-xs font-mono">
                    <code>{highlighted ?? sourceContent}</code>
                </pre>
            )
        }

        if (binaryFile) {
            return <div className="text-sm text-[var(--app-hint)]">This looks like a binary file. It cannot be previewed.</div>
        }

        if (!sourceContent) {
            return <div className="text-sm text-[var(--app-hint)]">File is empty.</div>
        }

        return (
            <pre className="shiki overflow-auto rounded-md bg-[var(--app-code-bg)] p-3 text-xs font-mono">
                <code>{highlighted ?? sourceContent}</code>
            </pre>
        )
    }

    return (
        <div className="flex h-full flex-col">
            <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto w-full max-w-content flex items-center gap-2 p-3 border-b border-[var(--app-border)]">
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                    >
                        <BackIcon />
                    </button>
                    <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{fileName}</div>
                        <div className="truncate text-xs text-[var(--app-hint)]">{filePath || 'Unknown path'}</div>
                    </div>
                </div>
            </div>

            <div className="bg-[var(--app-bg)]">
                <div className="mx-auto w-full max-w-content px-3 py-2 flex items-center gap-2 border-b border-[var(--app-divider)]">
                    <FileIcon fileName={fileName} size={20} />
                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--app-hint)]">{filePath}</span>
                    <button
                        type="button"
                        onClick={() => copyPath(filePath)}
                        className="shrink-0 rounded p-1 text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] transition-colors"
                        title="Copy path"
                    >
                        {pathCopied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                    </button>
                </div>
            </div>

            {(diffContent || canEditFile || previewKind !== 'text') ? (
                <div className="bg-[var(--app-bg)]">
                    <div className="mx-auto w-full max-w-content px-3 py-2 flex flex-wrap items-center gap-2 border-b border-[var(--app-divider)]">
                        {diffContent ? (
                            <button
                                type="button"
                                onClick={() => setDisplayMode('diff')}
                                className={`rounded px-3 py-1 text-xs font-semibold ${displayMode === 'diff' ? 'bg-[var(--app-button)] text-[var(--app-button-text)] opacity-80' : 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'}`}
                            >
                                Diff
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => setDisplayMode('preview')}
                            className={`rounded px-3 py-1 text-xs font-semibold ${displayMode === 'preview' ? 'bg-[var(--app-button)] text-[var(--app-button-text)] opacity-80' : 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'}`}
                        >
                            Preview
                        </button>
                        {!binaryFile ? (
                            <button
                                type="button"
                                onClick={() => setDisplayMode('source')}
                                className={`rounded px-3 py-1 text-xs font-semibold ${displayMode === 'source' ? 'bg-[var(--app-button)] text-[var(--app-button-text)] opacity-80' : 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'}`}
                            >
                                Source
                            </button>
                        ) : null}
                        {canEditFile ? (
                            <button
                                type="button"
                                onClick={() => setDisplayMode('edit')}
                                className={`rounded px-3 py-1 text-xs font-semibold ${displayMode === 'edit' ? 'bg-[var(--app-button)] text-[var(--app-button-text)] opacity-80' : 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'}`}
                            >
                                Edit
                            </button>
                        ) : null}
                        <div className="ml-auto flex flex-wrap items-center gap-2">
                            {saveStatus ? <span className="text-xs text-emerald-600">{saveStatus}</span> : null}
                            {isDirty && canEditFile ? <span className="text-xs text-amber-600">Unsaved changes</span> : null}
                            <button
                                type="button"
                                onClick={handleDownload}
                                className="rounded border border-[var(--app-border)] px-3 py-1 text-xs"
                            >
                                Download
                            </button>
                            {displayMode === 'edit' && canEditFile ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditorContent(savedContent)
                                            setSaveError(null)
                                            setSaveStatus(null)
                                        }}
                                        disabled={!isDirty || isSaving}
                                        className="rounded border border-[var(--app-border)] px-3 py-1 text-xs disabled:opacity-50"
                                    >
                                        Discard
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleSave()}
                                        disabled={isSaving || !isDirty}
                                        className="rounded bg-[var(--app-link)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                                    >
                                        {isSaving ? 'Saving…' : 'Save'}
                                    </button>
                                </>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-content p-4">
                    {diffErrorMessage ? (
                        <div className="mb-3 rounded-md bg-amber-500/10 p-2 text-xs text-[var(--app-hint)]">
                            {diffErrorMessage}
                        </div>
                    ) : null}
                    {saveError ? (
                        <div className="mb-3 rounded-md bg-red-500/10 p-2 text-xs text-red-600">
                            {saveError}
                        </div>
                    ) : null}
                    {missingPath ? (
                        <div className="text-sm text-[var(--app-hint)]">No file path provided.</div>
                    ) : loading ? (
                        <FileContentSkeleton />
                    ) : fileError ? (
                        <div className="text-sm text-[var(--app-hint)]">{fileError}</div>
                    ) : displayMode === 'diff' && diffContent ? (
                        <DiffDisplay diffContent={diffContent} />
                    ) : displayMode === 'diff' && diffFailed ? (
                        <div className="text-sm text-[var(--app-hint)]">{diffError ?? 'Diff unavailable.'}</div>
                    ) : displayMode === 'edit' && canEditFile ? (
                        <textarea
                            value={editorContent}
                            onChange={(event) => {
                                setEditorContent(event.target.value)
                                setSaveStatus(null)
                            }}
                            spellCheck={false}
                            className="min-h-[70vh] w-full rounded-md border border-[var(--app-border)] bg-[var(--app-code-bg)] p-3 font-mono text-xs"
                        />
                    ) : displayMode === 'source' ? (
                        sourceContent ? (
                            <div className="relative">
                                {canCopyContent ? (
                                    <button
                                        type="button"
                                        onClick={() => copyContent(sourceContent)}
                                        className="absolute right-2 top-2 z-10 rounded p-1 text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] transition-colors"
                                        title="Copy file content"
                                    >
                                        {contentCopied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                                    </button>
                                ) : null}
                                <pre className="shiki overflow-auto rounded-md bg-[var(--app-code-bg)] p-3 pr-8 text-xs font-mono">
                                    <code>{highlighted ?? sourceContent}</code>
                                </pre>
                            </div>
                        ) : (
                            <div className="text-sm text-[var(--app-hint)]">File is empty.</div>
                        )
                    ) : (
                        renderPreview()
                    )}
                </div>
            </div>
        </div>
    )
}
