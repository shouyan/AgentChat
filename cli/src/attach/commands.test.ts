import { describe, expect, it } from 'vitest'
import { parseAttachInput } from './commands'

describe('parseAttachInput', () => {
    it('parses attach slash commands', () => {
        expect(parseAttachInput('/detach')).toEqual({ type: 'detach' })
        expect(parseAttachInput('/exit')).toEqual({ type: 'detach' })
        expect(parseAttachInput('/quit')).toEqual({ type: 'detach' })
        expect(parseAttachInput('/refresh')).toEqual({ type: 'refresh' })
        expect(parseAttachInput('/help')).toEqual({ type: 'help' })
    })

    it('parses normal terminal input as message text', () => {
        expect(parseAttachInput('  hello attach  ')).toEqual({ type: 'message', text: 'hello attach' })
    })

    it('returns null for empty input', () => {
        expect(parseAttachInput('   ')).toBeNull()
    })
})
