import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function SaveRoomTemplateDialog(props: {
  isOpen: boolean
  isPending: boolean
  initialLabel?: string
  initialDescription?: string
  onClose: () => void
  onSubmit: (payload: { label: string; description?: string }) => Promise<void>
}) {
  const [label, setLabel] = useState(props.initialLabel ?? '')
  const [description, setDescription] = useState(props.initialDescription ?? '')
  const [error, setError] = useState<string | null>(null)
  const labelRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!props.isOpen) return
    setLabel(props.initialLabel ?? '')
    setDescription(props.initialDescription ?? '')
    setError(null)
    setTimeout(() => {
      labelRef.current?.focus()
      labelRef.current?.select()
    }, 100)
  }, [props.initialDescription, props.initialLabel, props.isOpen])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedLabel = label.trim()
    if (!trimmedLabel) {
      setError('Template title is required.')
      return
    }

    setError(null)
    try {
      await props.onSubmit({
        label: trimmedLabel,
        description: description.trim() || undefined,
      })
      props.onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to save template')
    }
  }

  return (
    <Dialog open={props.isOpen} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save room template</DialogTitle>
          <DialogDescription>
            Save the current slot setup as a reusable room template.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <input
            ref={labelRef}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Template title"
            className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2.5 text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-button)] focus:border-transparent"
            disabled={props.isPending}
            maxLength={120}
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description (optional)"
            className="min-h-24 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2.5 text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-button)] focus:border-transparent"
            disabled={props.isPending}
            maxLength={300}
          />

          {error ? (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={props.onClose}
              disabled={props.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={props.isPending || !label.trim()}>
              {props.isPending ? 'Saving…' : 'Save template'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
