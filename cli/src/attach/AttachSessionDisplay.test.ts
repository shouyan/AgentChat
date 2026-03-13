import React, { act } from 'react'
import { PassThrough } from 'node:stream'
import { stripVTControlCharacters } from 'node:util'
import { EventEmitter } from 'node:events'
import { render, type Instance } from 'ink'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@/api/types'
import { MessageBuffer } from '@/ui/ink/messageBuffer'
import { AttachSessionDisplay } from './AttachSessionDisplay'
import type { AttachConnectionState, AttachedSessionClient } from './AttachedSessionClient'

type Key = {
    ctrl?: boolean
    meta?: boolean
    return?: boolean
    backspace?: boolean
    delete?: boolean
}

let inputHandler: ((input: string, key: Key) => void | Promise<void>) | null = null

vi.mock('ink', async () => {
    const actual = await vi.importActual<typeof import('ink')>('ink')
    return {
        ...actual,
        useInput: (handler: (input: string, key: Key) => void | Promise<void>) => {
            inputHandler = handler
        }
    }
})

type TtyWriteStream = NodeJS.WriteStream & {
    isTTY?: boolean
    columns?: number
    rows?: number
}

type TtyReadStream = NodeJS.ReadStream & {
    isTTY?: boolean
}

class OutputCapture {
    private buffer = ''
    readonly stdout: NodeJS.WriteStream
    readonly stderr: NodeJS.WriteStream
    readonly stdin: NodeJS.ReadStream

    constructor() {
        const stdout = new PassThrough() as unknown as TtyWriteStream
        const stderr = new PassThrough() as unknown as TtyWriteStream
        const stdin = new PassThrough() as unknown as TtyReadStream

        Object.assign(stdout, { isTTY: true, columns: 80, rows: 24 })
        Object.assign(stderr, { isTTY: true, columns: 80, rows: 24 })
        Object.assign(stdin, { isTTY: false })

        ;(stdout as unknown as PassThrough).on('data', (chunk: Buffer | string) => {
            this.buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
        })
        ;(stderr as unknown as PassThrough).on('data', (chunk: Buffer | string) => {
            this.buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
        })

        this.stdout = stdout
        this.stderr = stderr
        this.stdin = stdin
    }

    reset(): void {
        this.buffer = ''
    }

    text(): string {
        return stripVTControlCharacters(this.buffer)
    }
}

class FakeAttachedSessionClient extends EventEmitter {
    constructor(
        private readonly session: Session,
        private readonly connectionState: AttachConnectionState = 'connected'
    ) {
        super()
    }

    getSession(): Session {
        return this.session
    }

    getConnectionState(): AttachConnectionState {
        return this.connectionState
    }
}

describe('AttachSessionDisplay', () => {
    let renderer: Instance | null = null
    let previousActEnvironment: boolean | undefined

    const getActEnvironment = (): boolean | undefined =>
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT

    const setActEnvironment = (value: boolean | undefined) => {
        ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = value
    }

    const mount = async (opts: {
        onSubmitInput?: (input: string) => Promise<void>
        onExit?: () => Promise<void> | void
        messageBuffer?: MessageBuffer
    }) => {
        const capture = new OutputCapture()
        const client = new FakeAttachedSessionClient(createSession('session-attach-test')) as unknown as AttachedSessionClient
        const messageBuffer = opts.messageBuffer ?? new MessageBuffer()
        await act(async () => {
            renderer = render(
                React.createElement(AttachSessionDisplay, {
                    client,
                    messageBuffer,
                    onExit: opts.onExit ?? vi.fn(),
                    onSubmitInput: opts.onSubmitInput ?? vi.fn(async () => {}),
                }),
                {
                    stdout: capture.stdout,
                    stderr: capture.stderr,
                    stdin: capture.stdin,
                    exitOnCtrlC: false,
                    patchConsole: false,
                }
            )
        })
        await flush()
        capture.reset()
        return { capture, client, messageBuffer }
    }

    const triggerInput = async (input: string, key: Key = {}) => {
        if (!inputHandler) {
            throw new Error('useInput handler was not registered')
        }
        await act(async () => {
            await inputHandler?.(input, key)
        })
        await flush()
    }

    const startInput = (input: string, key: Key = {}) => {
        if (!inputHandler) {
            throw new Error('useInput handler was not registered')
        }
        let result: void | Promise<void> = undefined
        act(() => {
            result = inputHandler?.(input, key)
        })
        return result
    }

    beforeEach(() => {
        previousActEnvironment = getActEnvironment()
        setActEnvironment(true)
        inputHandler = null
    })

    afterEach(async () => {
        if (renderer) {
            const activeRenderer = renderer
            await act(async () => {
                activeRenderer.unmount()
            })
            activeRenderer.cleanup()
            renderer = null
        }
        setActEnvironment(previousActEnvironment)
    })

    it('submits typed text and clears the composer after success', async () => {
        const onSubmitInput = vi.fn(async () => {})
        const { capture } = await mount({ onSubmitInput })

        await triggerInput('h')
        await triggerInput('i')
        capture.reset()

        await triggerInput('', { return: true })

        expect(onSubmitInput).toHaveBeenCalledTimes(1)
        expect(onSubmitInput).toHaveBeenCalledWith('hi')
        await waitForText(capture, 'Interactive attach')
        capture.reset()
        await triggerInput('x')
        await waitForText(capture, '> x')
    })

    it('shows retry guidance and preserves composer text after a failed send', async () => {
        const onSubmitInput = vi.fn()
            .mockRejectedValueOnce(new Error('network down'))
            .mockResolvedValueOnce(undefined)
        const { capture } = await mount({ onSubmitInput })

        for (const char of 'retry me') {
            await triggerInput(char)
        }
        capture.reset()

        await triggerInput('', { return: true })

        expect(onSubmitInput).toHaveBeenCalledTimes(1)
        await waitForText(capture, 'Last action failed. Enter retry • Ctrl-U clear • /detach exit')
        expect(capture.text()).toContain('network down')
        expect(capture.text()).toContain('> retry me')

        capture.reset()
        await triggerInput('', { return: true })

        expect(onSubmitInput).toHaveBeenCalledTimes(2)
        expect(onSubmitInput).toHaveBeenNthCalledWith(2, 'retry me')
        await waitForText(capture, 'Interactive attach')
        capture.reset()
        await triggerInput('z')
        await waitForText(capture, '> z')
    })

    it('shows sending status while a submit is still in flight', async () => {
        let resolveSubmit: (() => void) | null = null
        const onSubmitInput = vi.fn(async () => {
            await new Promise<void>((resolve) => {
                resolveSubmit = resolve
            })
        })
        const { capture } = await mount({ onSubmitInput })

        await triggerInput('o')
        await triggerInput('k')
        capture.reset()

        const pendingSubmit = startInput('', { return: true })
        await flush()

        await waitForText(capture, 'Sending message to session...')

        const releaseSubmit = resolveSubmit
        if (!releaseSubmit) {
            throw new Error('submit promise was not captured')
        }
        await act(async () => {
            ;(releaseSubmit as () => void)()
            await pendingSubmit
        })
        expect(onSubmitInput).toHaveBeenCalledWith('ok')
    })
})

function createSession(id: string): Session {
    return {
        id,
        namespace: 'default',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            flavor: 'cursor',
            startedBy: 'runner',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        permissionMode: 'default',
    }
}

async function flush(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
    })
}

async function waitForText(capture: OutputCapture, expected: string, timeoutMs = 500): Promise<void> {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
        if (capture.text().includes(expected)) {
            return
        }
        await flush()
    }

    expect(capture.text()).toContain(expected)
}
