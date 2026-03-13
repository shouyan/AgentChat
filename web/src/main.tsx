import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { RouterProvider } from '@tanstack/react-router'
import './index.css'
import { registerSW } from 'virtual:pwa-register'
import { initializeFontScale } from '@/hooks/useFontScale'
import { queryClient } from './lib/query-client'
import { createAppRouter } from './router'
import { I18nProvider } from './lib/i18n-context'

function getStartParam(): string | null {
    const query = new URLSearchParams(window.location.search)
    return query.get('startapp')
}

function getDeepLinkedSessionId(): string | null {
    const startParam = getStartParam()
    if (startParam?.startsWith('session_')) {
        return startParam.slice('session_'.length)
    }
    return null
}

function getInitialPath(): string {
    const sessionId = getDeepLinkedSessionId()
    return sessionId ? `/sessions/${sessionId}` : '/sessions'
}

async function bootstrap() {
    initializeFontScale()

    const updateSW = registerSW({
        onNeedRefresh() {
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            if (isLocalhost) {
                void updateSW(true)
                return
            }
            if (confirm('New version available! Reload to update?')) {
                updateSW(true)
            }
        },
        onOfflineReady() {
            console.log('App ready for offline use')
        },
        onRegistered(registration) {
            if (registration) {
                setInterval(() => {
                    registration.update()
                }, 60 * 60 * 1000)
            }
        },
        onRegisterError(error) {
            console.error('SW registration error:', error)
        }
    })

    const router = createAppRouter()
    const initialPath = getInitialPath()
    if (window.location.pathname === '/' && initialPath !== '/sessions') {
        router.navigate({ to: initialPath, replace: true })
    }

    ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
            <I18nProvider>
                <QueryClientProvider client={queryClient}>
                    <RouterProvider router={router} />
                    {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
                </QueryClientProvider>
            </I18nProvider>
        </React.StrictMode>
    )
}

void bootstrap()
