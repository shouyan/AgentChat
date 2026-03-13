import { describe, expect, it } from 'vitest'
import { formatRunnerEnvFile, mergeRunnerEnv, parseRunnerEnvFile } from './envFile'

describe('runner env file', () => {
    it('parses only managed runner env keys', () => {
        const parsed = parseRunnerEnvFile([
            '# comment',
            'ANTHROPIC_BASE_URL=https://jimmie.zeabur.app',
            'ANTHROPIC_AUTH_TOKEN=test-token',
            'GOOGLE_GEMINI_BASE_URL=https://gemini.example.com',
            'GEMINI_API_KEY=gemini-key',
            'OPENAI_API_KEY=openai-key',
            'NOT_ALLOWED=value',
            '',
        ].join('\n'))

        expect(parsed).toEqual({
            ANTHROPIC_BASE_URL: 'https://jimmie.zeabur.app',
            ANTHROPIC_AUTH_TOKEN: 'test-token',
            GOOGLE_GEMINI_BASE_URL: 'https://gemini.example.com',
            GEMINI_API_KEY: 'gemini-key',
        })
    })

    it('formats managed runner env content', () => {
        const formatted = formatRunnerEnvFile({
            ANTHROPIC_BASE_URL: 'https://jimmie.zeabur.app',
            ANTHROPIC_AUTH_TOKEN: 'test-token',
        }, new Date('2026-03-12T00:00:00.000Z'))

        expect(formatted).toContain('ANTHROPIC_BASE_URL=https://jimmie.zeabur.app')
        expect(formatted).toContain('ANTHROPIC_AUTH_TOKEN=test-token')
        expect(formatted).toContain('Edit this file manually. New agent sessions started by runner will use these values.')
        expect(formatted).toContain('Generated at: 2026-03-12T00:00:00.000Z')
    })

    it('replaces stale managed provider keys when merging env', () => {
        const merged = mergeRunnerEnv({
            ANTHROPIC_BASE_URL: 'https://api.kimi.com/coding/',
            ANTHROPIC_AUTH_TOKEN: 'kimi-token',
            GOOGLE_GEMINI_BASE_URL: 'https://old-gemini.example.com',
            GEMINI_BASE_URL: 'https://old-gemini.example.com',
            GOOGLE_BASE_URL: 'https://old-gemini.example.com',
            PATH: '/usr/bin',
        }, {
            ANTHROPIC_BASE_URL: 'https://jimmie.zeabur.app',
            ANTHROPIC_AUTH_TOKEN: 'jimmie-token',
            GOOGLE_GEMINI_BASE_URL: 'https://gemini.example.com',
            GEMINI_API_KEY: 'gemini-key',
        })

        expect(merged.PATH).toBe('/usr/bin')
        expect(merged.ANTHROPIC_BASE_URL).toBe('https://jimmie.zeabur.app')
        expect(merged.ANTHROPIC_AUTH_TOKEN).toBe('jimmie-token')
        expect(merged.GOOGLE_GEMINI_BASE_URL).toBe('https://gemini.example.com')
        expect(merged.GEMINI_BASE_URL).toBe('https://gemini.example.com')
        expect(merged.GOOGLE_BASE_URL).toBe('https://gemini.example.com')
        expect(merged.GEMINI_API_KEY).toBe('gemini-key')
    })
})
