import { describe, expect, it } from 'bun:test'
import { mergeSessionMetadataPreservingSystemFields } from './sessionMetadata'

describe('mergeSessionMetadataPreservingSystemFields', () => {
    it('preserves room markers when later metadata updates omit them', () => {
        const merged = mergeSessionMetadataPreservingSystemFields(
            {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'claude',
                roomSpawned: true,
                roomId: 'room-123'
            },
            {
                path: '/tmp/project',
                host: 'localhost',
                tools: ['Edit', 'Read']
            }
        ) as Record<string, unknown>

        expect(merged.roomSpawned).toBe(true)
        expect(merged.roomId).toBe('room-123')
        expect(merged.tools).toEqual(['Edit', 'Read'])
    })

    it('keeps the newer summary when it is more recent', () => {
        const merged = mergeSessionMetadataPreservingSystemFields(
            {
                path: '/tmp/project',
                host: 'localhost',
                summary: { text: 'older', updatedAt: 100 }
            },
            {
                path: '/tmp/project',
                host: 'localhost',
                summary: { text: 'newer', updatedAt: 200 }
            }
        ) as Record<string, unknown>

        expect(merged.summary).toEqual({ text: 'newer', updatedAt: 200 })
    })
})
