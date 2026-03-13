export type AttachCommand =
    | { type: 'detach' }
    | { type: 'refresh' }
    | { type: 'help' }
    | { type: 'message'; text: string }

export function parseAttachInput(input: string): AttachCommand | null {
    const trimmed = input.trim()
    if (!trimmed) {
        return null
    }

    switch (trimmed) {
        case '/detach':
        case '/exit':
        case '/quit':
            return { type: 'detach' }
        case '/refresh':
            return { type: 'refresh' }
        case '/help':
            return { type: 'help' }
        default:
            return { type: 'message', text: trimmed }
    }
}
