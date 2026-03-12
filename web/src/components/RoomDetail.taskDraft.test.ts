import { describe, expect, it } from 'vitest'
import { buildTaskDraftFromMessage } from './rooms/MessageTaskDialog'
import type { RoomMessage } from '@/types/api'

function makeMessage(text: string): RoomMessage {
    return {
        id: 'message-1',
        roomId: 'room-1',
        seq: 1,
        createdAt: 1_700_000_000_000,
        senderType: 'session',
        senderId: 'session-1',
        roleKey: 'planner',
        content: {
            type: 'text',
            text
        }
    }
}

describe('buildTaskDraftFromMessage', () => {
    it('uses message text as task title and source text as description', () => {
        const draft = buildTaskDraftFromMessage(makeMessage('Investigate failing integration tests and report back.'), 'Planner')

        expect(draft.title).toContain('Investigate failing integration tests')
        expect(draft.description).toContain('Source message from Planner')
        expect(draft.description).toContain('Investigate failing integration tests')
    })

    it('truncates very long task titles', () => {
        const draft = buildTaskDraftFromMessage(makeMessage('a'.repeat(140)), 'Planner')

        expect(draft.title.length).toBeLessThanOrEqual(96)
        expect(draft.title.endsWith('…')).toBe(true)
    })
})
