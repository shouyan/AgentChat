import { describe, expect, it } from 'bun:test'
import { isSocketOriginAllowed } from './server'

describe('isSocketOriginAllowed', () => {
    it('allows exact configured origins', () => {
        expect(isSocketOriginAllowed(
            'http://127.0.0.1:4173',
            '127.0.0.1:4217',
            ['http://127.0.0.1:4173'],
            false
        )).toBe(true)
    })

    it('allows same host across different ports', () => {
        expect(isSocketOriginAllowed(
            'http://192.168.5.34:4173',
            '192.168.5.34:4217',
            ['http://192.168.5.34:4217'],
            false
        )).toBe(true)
    })

    it('allows loopback aliases across ports', () => {
        expect(isSocketOriginAllowed(
            'http://localhost:4173',
            '127.0.0.1:4217',
            ['http://127.0.0.1:4217'],
            false
        )).toBe(true)
    })

    it('rejects different hosts when not explicitly allowed', () => {
        expect(isSocketOriginAllowed(
            'http://example.com:4173',
            '127.0.0.1:4217',
            ['http://127.0.0.1:4217'],
            false
        )).toBe(false)
    })
})
