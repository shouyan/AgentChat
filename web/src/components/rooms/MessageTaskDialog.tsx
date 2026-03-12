import { useEffect } from 'react'
import type { RoomMessage, RoomRole } from '@/types/api'

export type MessageTaskDraft = {
    messageId: string
    title: string
    description: string
    assigneeRoleKey: string
}

function formatTaskSourceTime(value: number): string {
    try {
        return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
        return ''
    }
}

export function buildTaskDraftFromMessage(message: RoomMessage, senderLabel: string): {
    title: string
    description: string
} {
    const collapsed = message.content.text
        .replace(/\s+/g, ' ')
        .trim()
    const normalizedTitle = collapsed.length > 96
        ? `${collapsed.slice(0, 93).trimEnd()}…`
        : collapsed
    const fallbackTitle = `Follow up with ${senderLabel}`

    return {
        title: normalizedTitle || fallbackTitle,
        description: `Source message from ${senderLabel} at ${formatTaskSourceTime(message.createdAt)}:\n\n${message.content.text}`.trim()
    }
}

export function MessageTaskDialog(props: {
    draft: MessageTaskDraft | null
    roles: RoomRole[]
    isPending?: boolean
    onChange: (next: MessageTaskDraft) => void
    onClose: () => void
    onSubmit: () => void
}) {
    useEffect(() => {
        if (!props.draft) {
            return
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                props.onClose()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [props.draft, props.onClose])

    if (!props.draft) {
        return null
    }

    return (
        <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
            onClick={props.onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="message-task-dialog-title"
                className="w-full max-w-lg rounded-2xl border border-[var(--app-border)] bg-[var(--app-bg)] p-4 shadow-xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div id="message-task-dialog-title" className="text-base font-semibold">Create task from message</div>
                <div className="mt-1 text-sm text-[var(--app-hint)]">
                    Turn this room message into a tracked task and optionally assign it immediately.
                </div>

                <div className="mt-4 space-y-3">
                    <div>
                        <div className="text-xs font-medium text-[var(--app-hint)]">Task title</div>
                        <input
                            autoFocus
                            value={props.draft.title}
                            onChange={(event) => props.onChange({ ...props.draft!, title: event.target.value })}
                            className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                            placeholder="Task title"
                        />
                    </div>

                    <div>
                        <div className="text-xs font-medium text-[var(--app-hint)]">Assign to role</div>
                        <select
                            value={props.draft.assigneeRoleKey}
                            onChange={(event) => props.onChange({ ...props.draft!, assigneeRoleKey: event.target.value })}
                            className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5"
                        >
                            <option value="">Unassigned</option>
                            {props.roles.map((role) => (
                                <option key={role.id} value={role.key}>{role.label} (@{role.key})</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <div className="text-xs font-medium text-[var(--app-hint)]">Task description</div>
                        <textarea
                            value={props.draft.description}
                            onChange={(event) => props.onChange({ ...props.draft!, description: event.target.value })}
                            className="mt-1 min-h-36 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                        />
                    </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={props.onClose}
                        className="rounded border border-[var(--app-border)] px-3 py-2 text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={props.onSubmit}
                        disabled={props.isPending || !props.draft.title.trim()}
                        className="rounded bg-[var(--app-link)] px-3 py-2 text-sm text-white disabled:opacity-60"
                    >
                        {props.isPending ? 'Creating…' : 'Create task'}
                    </button>
                </div>
            </div>
        </div>
    )
}
