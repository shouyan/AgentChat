import { cn } from '@/lib/utils'

type BrandMarkProps = {
    className?: string
    imageClassName?: string
    alt?: string
}

export function BrandMark(props: BrandMarkProps) {
    return (
        <div
            className={cn(
                'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[22%] bg-[var(--app-secondary-bg)] shadow-sm ring-1 ring-black/6 dark:ring-white/10',
                props.className,
            )}
        >
            <img
                src="/agentchat-icon-source.png"
                alt={props.alt ?? 'AgentChat'}
                className={cn('h-full w-full object-cover', props.imageClassName)}
                draggable={false}
            />
        </div>
    )
}
