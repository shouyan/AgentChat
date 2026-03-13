import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { configuration } from '@/configuration'

export const RUNNER_ENV_KEYS = [
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    'GOOGLE_GEMINI_BASE_URL',
    'GEMINI_API_KEY',
] as const

export type RunnerEnvKey = typeof RUNNER_ENV_KEYS[number]
export type RunnerEnvMap = Partial<Record<RunnerEnvKey, string>>

function stripInlineComment(value: string): string {
    const trimmed = value.trim()
    if (!trimmed.includes('#')) {
        return trimmed
    }
    if (trimmed.startsWith('"') || trimmed.startsWith('\'')) {
        return trimmed
    }
    return trimmed.split('#', 1)[0]!.trim()
}

function unquote(value: string): string {
    const trimmed = value.trim()
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"'))
        || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
    ) {
        return trimmed.slice(1, -1)
    }
    return trimmed
}

export function parseRunnerEnvFile(content: string): RunnerEnvMap {
    const parsed: RunnerEnvMap = {}
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) {
            continue
        }
        const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line
        const separatorIndex = normalized.indexOf('=')
        if (separatorIndex <= 0) {
            continue
        }
        const key = normalized.slice(0, separatorIndex).trim() as RunnerEnvKey
        if (!RUNNER_ENV_KEYS.includes(key)) {
            continue
        }
        const value = unquote(stripInlineComment(normalized.slice(separatorIndex + 1)))
        if (!value) {
            continue
        }
        parsed[key] = value
    }
    return parsed
}

export function formatRunnerEnvFile(
    env: RunnerEnvMap,
    generatedAt: Date = new Date(),
    options?: { includeEmptyKeys?: boolean }
): string {
    const lines = [
        '# AgentChat runner environment',
        '# Edit this file manually. New agent sessions started by runner will use these values.',
        `# Generated at: ${generatedAt.toISOString()}`,
        '',
    ]
    for (const key of RUNNER_ENV_KEYS) {
        const value = env[key]
        if (!value && !options?.includeEmptyKeys) {
            continue
        }
        lines.push(`${key}=${value ?? ''}`)
    }
    lines.push('')
    return lines.join('\n')
}

export async function readRunnerEnvFile(filePath: string = configuration.runnerEnvFile): Promise<RunnerEnvMap> {
    if (!existsSync(filePath)) {
        return {}
    }
    const content = await readFile(filePath, 'utf8')
    return parseRunnerEnvFile(content)
}

export async function readRunnerEnvFileText(filePath: string = configuration.runnerEnvFile): Promise<string> {
    await ensureRunnerEnvFile(filePath)
    return await readFile(filePath, 'utf8')
}

export function mergeRunnerEnv(baseEnv: NodeJS.ProcessEnv, runnerEnv: RunnerEnvMap): NodeJS.ProcessEnv {
    const merged: NodeJS.ProcessEnv = { ...baseEnv }
    for (const key of RUNNER_ENV_KEYS) {
        delete merged[key]
    }
    delete merged.GEMINI_BASE_URL
    delete merged.GOOGLE_BASE_URL

    for (const [key, value] of Object.entries(runnerEnv) as Array<[RunnerEnvKey, string]>) {
        if (value) {
            merged[key] = value
        }
    }

    const geminiBaseUrl = runnerEnv.GOOGLE_GEMINI_BASE_URL
    if (geminiBaseUrl) {
        merged.GEMINI_BASE_URL = geminiBaseUrl
        merged.GOOGLE_BASE_URL = geminiBaseUrl
    }

    return merged
}

export async function buildRunnerManagedEnv(baseEnv: NodeJS.ProcessEnv = process.env): Promise<NodeJS.ProcessEnv> {
    const runnerEnv = await readRunnerEnvFile()
    return mergeRunnerEnv(baseEnv, runnerEnv)
}

export async function writeRunnerEnvFile(env: RunnerEnvMap, filePath: string = configuration.runnerEnvFile): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, formatRunnerEnvFile(env), 'utf8')
}

export async function writeRunnerEnvFileText(content: string, filePath: string = configuration.runnerEnvFile): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true })
    const normalizedContent = content.endsWith('\n') ? content : `${content}\n`
    await writeFile(filePath, normalizedContent, 'utf8')
}

export async function ensureRunnerEnvFile(filePath: string = configuration.runnerEnvFile): Promise<void> {
    if (existsSync(filePath)) {
        return
    }
    const emptyEnv = Object.fromEntries(RUNNER_ENV_KEYS.map((key) => [key, ''])) as RunnerEnvMap
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, formatRunnerEnvFile(emptyEnv, new Date(), { includeEmptyKeys: true }), 'utf8')
}
