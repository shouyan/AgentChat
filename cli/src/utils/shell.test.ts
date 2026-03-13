import { describe, expect, it } from 'vitest'
import { resolveDefaultShell } from './shell'

describe('resolveDefaultShell', () => {
    it('prefers SHELL when present', () => {
        expect(resolveDefaultShell({ SHELL: '/custom/shell' })).toBe('/custom/shell')
    })

    it('falls back to ComSpec on Windows', () => {
        const originalPlatform = process.platform
        Object.defineProperty(process, 'platform', { value: 'win32' })
        expect(resolveDefaultShell({ ComSpec: 'C:\\Windows\\System32\\cmd.exe' })).toBe('C:\\Windows\\System32\\cmd.exe')
        Object.defineProperty(process, 'platform', { value: originalPlatform })
    })

    it('falls back to first existing unix shell', () => {
        expect(resolveDefaultShell({}, { exists: (path) => path === '/bin/sh' })).toBe('/bin/sh')
    })
})
