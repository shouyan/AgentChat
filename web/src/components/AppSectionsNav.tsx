import { useNavigate, useLocation } from '@tanstack/react-router'

export function AppSectionsNav() {
  const navigate = useNavigate()
  const pathname = useLocation({ select: (location) => location.pathname })
  const active = pathname.startsWith('/rooms') ? 'rooms' : 'sessions'

  const baseClass = 'rounded-full px-3 py-1.5 text-sm transition-colors'
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => navigate({ to: '/sessions' })}
        className={`${baseClass} ${active === 'sessions' ? 'bg-[var(--app-link)] text-white' : 'bg-[var(--app-subtle-bg)] text-[var(--app-fg)]'}`}
      >
        Sessions
      </button>
      <button
        type="button"
        onClick={() => navigate({ to: '/rooms' })}
        className={`${baseClass} ${active === 'rooms' ? 'bg-[var(--app-link)] text-white' : 'bg-[var(--app-subtle-bg)] text-[var(--app-fg)]'}`}
      >
        Rooms
      </button>
    </div>
  )
}
