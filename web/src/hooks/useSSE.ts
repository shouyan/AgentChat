import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isObject } from '@agentchat/protocol'
import type { SyncEvent } from '@/types/api'
import { createSyncEventHandler } from './sse/eventHandler'
import { SSEInvalidationQueue } from './sse/invalidationQueue'
import {
    buildEventsUrl,
    getVisibilityState,
    HEARTBEAT_STALE_MS,
    HEARTBEAT_WATCHDOG_INTERVAL_MS,
    RECONNECT_BASE_DELAY_MS,
    RECONNECT_JITTER_MS,
    RECONNECT_MAX_DELAY_MS,
} from './sse/transport'
import type { SSESubscription, ToastEvent } from './sse/types'

type UseSSEOptions = {
    enabled: boolean
    token: string
    baseUrl: string
    subscription?: SSESubscription
    onEvent: (event: SyncEvent) => void
    onConnect?: () => void
    onDisconnect?: (reason: string) => void
    onError?: (error: unknown) => void
    onToast?: (event: ToastEvent) => void
}

export function useSSE(options: UseSSEOptions): { subscriptionId: string | null } {
    const queryClient = useQueryClient()
    const onEventRef = useRef(options.onEvent)
    const onConnectRef = useRef(options.onConnect)
    const onDisconnectRef = useRef(options.onDisconnect)
    const onErrorRef = useRef(options.onError)
    const onToastRef = useRef(options.onToast)
    const eventSourceRef = useRef<EventSource | null>(null)
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const reconnectAttemptRef = useRef(0)
    const lastActivityAtRef = useRef(0)
    const invalidationQueueRef = useRef(new SSEInvalidationQueue(queryClient))
    const [reconnectNonce, setReconnectNonce] = useState(0)
    const [subscriptionId, setSubscriptionId] = useState<string | null>(null)

    useEffect(() => {
        invalidationQueueRef.current = new SSEInvalidationQueue(queryClient)
        return () => {
            invalidationQueueRef.current.dispose()
        }
    }, [queryClient])

    useEffect(() => {
        onEventRef.current = options.onEvent
    }, [options.onEvent])

    useEffect(() => {
        onErrorRef.current = options.onError
    }, [options.onError])

    useEffect(() => {
        onConnectRef.current = options.onConnect
    }, [options.onConnect])

    useEffect(() => {
        onDisconnectRef.current = options.onDisconnect
    }, [options.onDisconnect])

    useEffect(() => {
        onToastRef.current = options.onToast
    }, [options.onToast])

    const subscription = options.subscription ?? {}
    const subscriptionKey = useMemo(() => {
        return `${subscription.all ? '1' : '0'}|${subscription.sessionId ?? ''}|${subscription.machineId ?? ''}|${subscription.roomId ?? ''}`
    }, [subscription.all, subscription.sessionId, subscription.machineId, subscription.roomId])

    useEffect(() => {
        if (!options.enabled) {
            eventSourceRef.current?.close()
            eventSourceRef.current = null
            invalidationQueueRef.current.dispose()
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current)
                reconnectTimerRef.current = null
            }
            reconnectAttemptRef.current = 0
            setSubscriptionId(null)
            return
        }

        setSubscriptionId(null)
        const url = buildEventsUrl(options.baseUrl, options.token, {
            ...subscription,
            sessionId: subscription.sessionId ?? undefined,
        }, getVisibilityState())
        const eventSource = new EventSource(url)
        let disconnectNotified = false
        let reconnectRequested = false
        eventSourceRef.current = eventSource
        lastActivityAtRef.current = Date.now()

        const scheduleReconnect = () => {
            const attempt = reconnectAttemptRef.current
            const exponentialDelay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * (2 ** attempt))
            const jitter = Math.floor(Math.random() * (RECONNECT_JITTER_MS + 1))
            reconnectAttemptRef.current = attempt + 1
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current)
            }
            reconnectTimerRef.current = setTimeout(() => {
                reconnectTimerRef.current = null
                setReconnectNonce((value) => value + 1)
            }, exponentialDelay + jitter)
        }

        const notifyDisconnect = (reason: string) => {
            if (disconnectNotified) {
                return
            }
            disconnectNotified = true
            onDisconnectRef.current?.(reason)
        }

        const requestReconnect = (reason: string) => {
            if (reconnectRequested) {
                return
            }
            reconnectRequested = true
            notifyDisconnect(reason)
            eventSource.close()
            if (eventSourceRef.current === eventSource) {
                eventSourceRef.current = null
            }
            setSubscriptionId(null)
            scheduleReconnect()
        }

        const handleSyncEvent = createSyncEventHandler({
            queryClient,
            invalidationQueue: invalidationQueueRef.current,
            onEvent: (event) => onEventRef.current(event),
            onToast: (event) => onToastRef.current?.(event),
            setSubscriptionId,
            markActivity: () => {
                lastActivityAtRef.current = Date.now()
            },
        })

        const handleMessage = (message: MessageEvent<string>) => {
            if (typeof message.data !== 'string') {
                return
            }

            let parsed: unknown
            try {
                parsed = JSON.parse(message.data)
            } catch {
                return
            }

            if (!isObject(parsed)) {
                return
            }
            if (typeof parsed.type !== 'string') {
                return
            }

            handleSyncEvent(parsed as SyncEvent)
        }

        eventSource.onmessage = handleMessage
        eventSource.onopen = () => {
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current)
                reconnectTimerRef.current = null
            }
            reconnectAttemptRef.current = 0
            disconnectNotified = false
            lastActivityAtRef.current = Date.now()
            onConnectRef.current?.()
        }
        eventSource.onerror = (error) => {
            onErrorRef.current?.(error)
            if (eventSource.readyState === EventSource.CLOSED) {
                requestReconnect('closed')
                return
            }
            notifyDisconnect('error')
        }

        const watchdogTimer = setInterval(() => {
            if (eventSourceRef.current !== eventSource) {
                return
            }
            if (getVisibilityState() === 'hidden') {
                return
            }
            if (Date.now() - lastActivityAtRef.current < HEARTBEAT_STALE_MS) {
                return
            }
            requestReconnect('heartbeat-timeout')
        }, HEARTBEAT_WATCHDOG_INTERVAL_MS)

        return () => {
            clearInterval(watchdogTimer)
            invalidationQueueRef.current.dispose()
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current)
                reconnectTimerRef.current = null
            }
            eventSource.close()
            if (eventSourceRef.current === eventSource) {
                eventSourceRef.current = null
            }
            setSubscriptionId(null)
        }
    }, [options.baseUrl, options.enabled, options.token, queryClient, reconnectNonce, subscriptionKey])

    return { subscriptionId }
}
