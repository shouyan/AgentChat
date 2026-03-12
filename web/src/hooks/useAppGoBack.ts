import { useCallback } from 'react'
import { useLocation, useNavigate, useRouter } from '@tanstack/react-router'

export function useAppGoBack(): () => void {
    const navigate = useNavigate()
    const router = useRouter()
    const pathname = useLocation({ select: (location) => location.pathname })
    const search = useLocation({ select: (location) => location.search })

    return useCallback(() => {
        // Use explicit path navigation for consistent behavior across all environments
        if (pathname === '/sessions/new') {
            navigate({ to: '/sessions' })
            return
        }

        // Settings page always goes back to sessions
        if (pathname === '/settings') {
            navigate({ to: '/sessions' })
            return
        }

        // For single file view, go back to files list
        if (pathname.match(/^\/sessions\/[^/]+\/file$/)) {
            const filesPath = pathname.replace(/\/file$/, '/files')

            const tab = (search && typeof search === 'object' && 'tab' in search)
                ? (search as { tab?: unknown }).tab
                : undefined
            const fromRoom = (search && typeof search === 'object' && 'fromRoom' in search && typeof (search as { fromRoom?: unknown }).fromRoom === 'string')
                ? (search as { fromRoom?: string }).fromRoom
                : undefined
            const nextSearch: { tab?: 'directories'; fromRoom?: string } = {}
            if (tab === 'directories') {
                nextSearch.tab = 'directories'
            }
            if (fromRoom) {
                nextSearch.fromRoom = fromRoom
            }

            navigate({ to: filesPath, search: nextSearch })
            return
        }

        // If a session was opened from a room, go back to that room
        if (pathname.startsWith('/sessions/')) {
            const fromRoom = (search && typeof search === 'object' && 'fromRoom' in search && typeof (search as { fromRoom?: unknown }).fromRoom === 'string')
                ? (search as { fromRoom?: string }).fromRoom
                : undefined

            if (fromRoom) {
                navigate({ to: '/rooms/$roomId', params: { roomId: fromRoom } })
                return
            }

            const parentPath = pathname.replace(/\/[^/]+$/, '') || '/sessions'
            navigate({ to: parentPath })
            return
        }

        // Fallback to history.back() for other cases
        router.history.back()
    }, [navigate, pathname, router, search])
}
