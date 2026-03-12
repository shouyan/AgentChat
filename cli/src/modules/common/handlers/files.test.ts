import { beforeEach, describe, expect, it } from 'vitest'
import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { RpcHandlerManager } from '../../../api/rpc/RpcHandlerManager'
import { registerFileHandlers } from './files'

async function createTempDir(prefix: string): Promise<string> {
    const base = tmpdir()
    const path = join(base, `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    await mkdir(path, { recursive: true })
    return path
}

describe('file RPC handlers', () => {
    let rootDir: string
    let rpc: RpcHandlerManager

    beforeEach(async () => {
        if (rootDir) {
            await rm(rootDir, { recursive: true, force: true })
        }

        rootDir = await createTempDir('hapi-file-handler')
        await mkdir(join(rootDir, 'src'), { recursive: true })
        await writeFile(join(rootDir, 'src', 'index.ts'), 'console.log("ok")\n')

        rpc = new RpcHandlerManager({ scopePrefix: 'session-test' })
        registerFileHandlers(rpc, rootDir)
    })

    it('creates a new file via writeFile', async () => {
        const response = await rpc.handleRequest({
            method: 'session-test:writeFile',
            params: JSON.stringify({
                path: 'src/new-file.txt',
                content: Buffer.from('hello world\n', 'utf8').toString('base64')
            })
        })

        const parsed = JSON.parse(response) as { success: boolean; hash?: string }
        expect(parsed.success).toBe(true)
        expect(parsed.hash).toBeTruthy()

        const created = await readFile(join(rootDir, 'src', 'new-file.txt'), 'utf8')
        expect(created).toBe('hello world\n')
    })

    it('creates a new directory', async () => {
        const response = await rpc.handleRequest({
            method: 'session-test:createDirectory',
            params: JSON.stringify({ path: 'docs/guides' })
        })

        const parsed = JSON.parse(response) as { success: boolean; path?: string }
        expect(parsed.success).toBe(true)
        expect(parsed.path).toBe('docs/guides')

        const created = await stat(join(rootDir, 'docs', 'guides'))
        expect(created.isDirectory()).toBe(true)
    })

    it('reads an existing file and returns a content hash', async () => {
        const response = await rpc.handleRequest({
            method: 'session-test:readFile',
            params: JSON.stringify({ path: 'src/index.ts' })
        })

        const parsed = JSON.parse(response) as { success: boolean; content?: string; hash?: string }
        expect(parsed.success).toBe(true)
        expect(parsed.content).toBeTruthy()
        expect(parsed.hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('updates an existing file when the expected hash matches', async () => {
        const readResponse = await rpc.handleRequest({
            method: 'session-test:readFile',
            params: JSON.stringify({ path: 'src/index.ts' })
        })
        const readParsed = JSON.parse(readResponse) as { success: boolean; hash?: string }
        expect(readParsed.success).toBe(true)
        expect(readParsed.hash).toBeTruthy()

        const writeResponse = await rpc.handleRequest({
            method: 'session-test:writeFile',
            params: JSON.stringify({
                path: 'src/index.ts',
                content: Buffer.from('console.log("updated")\n', 'utf8').toString('base64'),
                expectedHash: readParsed.hash,
            })
        })

        const writeParsed = JSON.parse(writeResponse) as { success: boolean; hash?: string }
        expect(writeParsed.success).toBe(true)
        expect(writeParsed.hash).toMatch(/^[a-f0-9]{64}$/)

        const updated = await readFile(join(rootDir, 'src', 'index.ts'), 'utf8')
        expect(updated).toBe('console.log("updated")\n')
    })

    it('renames a file', async () => {
        const response = await rpc.handleRequest({
            method: 'session-test:renamePath',
            params: JSON.stringify({
                path: 'src/index.ts',
                nextPath: 'src/main.ts'
            })
        })

        const parsed = JSON.parse(response) as { success: boolean; path?: string }
        expect(parsed.success).toBe(true)
        expect(parsed.path).toBe('src/main.ts')

        const renamed = await readFile(join(rootDir, 'src', 'main.ts'), 'utf8')
        expect(renamed).toContain('console.log')
    })

    it('deletes directories recursively', async () => {
        await mkdir(join(rootDir, 'tmp', 'nested'), { recursive: true })
        await writeFile(join(rootDir, 'tmp', 'nested', 'file.txt'), 'bye')

        const response = await rpc.handleRequest({
            method: 'session-test:deletePath',
            params: JSON.stringify({
                path: 'tmp',
                recursive: true
            })
        })

        const parsed = JSON.parse(response) as { success: boolean }
        expect(parsed.success).toBe(true)

        await expect(stat(join(rootDir, 'tmp'))).rejects.toThrow()
    })

    it('rejects paths outside the working directory', async () => {
        const response = await rpc.handleRequest({
            method: 'session-test:deletePath',
            params: JSON.stringify({
                path: '../nope.txt',
                recursive: false
            })
        })

        const parsed = JSON.parse(response) as { success: boolean; error?: string }
        expect(parsed.success).toBe(false)
        expect(parsed.error).toContain('outside the working directory')
    })
})
