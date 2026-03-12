export function OnlineBadge(props: { online: boolean }) {
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${props.online ? 'bg-emerald-100 text-emerald-700' : 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${props.online ? 'bg-emerald-500' : 'bg-[var(--app-hint)]/60'}`} />
            {props.online ? 'online' : 'offline'}
        </span>
    )
}
