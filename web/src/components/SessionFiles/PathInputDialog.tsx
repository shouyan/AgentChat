import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type PathInputDialogProps = {
    isOpen: boolean
    title: string
    description?: string
    placeholder: string
    initialValue?: string
    submitLabel: string
    submittingLabel: string
    isPending: boolean
    onClose: () => void
    onSubmit: (value: string) => Promise<void>
}

export function PathInputDialog(props: PathInputDialogProps) {
    const [value, setValue] = useState(props.initialValue ?? '')
    const [error, setError] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!props.isOpen) {
            return
        }

        setValue(props.initialValue ?? '')
        setError(null)

        setTimeout(() => {
            inputRef.current?.focus()
            if (props.initialValue) {
                inputRef.current?.select()
            }
        }, 100)
    }, [props.initialValue, props.isOpen])

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault()
        const trimmed = value.trim()
        if (!trimmed) {
            setError('Path is required.')
            return
        }

        setError(null)
        try {
            await props.onSubmit(trimmed)
            props.onClose()
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Operation failed')
        }
    }

    return (
        <Dialog open={props.isOpen} onOpenChange={(open) => !open && props.onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{props.title}</DialogTitle>
                    {props.description ? (
                        <DialogDescription>{props.description}</DialogDescription>
                    ) : null}
                </DialogHeader>

                <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
                    <input
                        ref={inputRef}
                        type="text"
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        placeholder={props.placeholder}
                        className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2.5 text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-button)] focus:border-transparent"
                        disabled={props.isPending}
                        maxLength={512}
                        autoCapitalize="none"
                        autoCorrect="off"
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
                        <Button type="submit" disabled={props.isPending || !value.trim()}>
                            {props.isPending ? props.submittingLabel : props.submitLabel}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
